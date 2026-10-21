// Full audit 15 Oct 2026, fix Phase 3 (bill calculators): MF-01 to MF-07 moved from the audit branch
// (audit/2026-10-15/mathF/defects.test.mjs, all failed on v0.8.18) and adapted to tests/load-data.js, plus the
// WL-115 to WL-118 page checks. Rules: specs/formulas.md section F, N1, N4/E4, E1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculators as C } from '../engine/index.js';
import { noticeCode } from '../engine/messages.js';
import { fmt } from '../engine/format.js';
import { data, root } from './load-data.js';

const page = (id) => JSON.parse(readFileSync(join(root, 'generated/pages', `${id}.json`), 'utf8')).content;
const n = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));
const F = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

test('MF-01 (WL-109): printed bill lines add up to the printed total on every F page example and how text', () => {
  const bad = [];
  for (const id of F) {
    const c = page(id);
    const m = /Subtotal (Rs [\d,]+)[;+ ]+GST (?:at )?[\d.]+% (?:= )?\(?(Rs [\d,]+)\)?(?:\. Estimated bill| =) (Rs [\d,]+)/.exec(c.tool.how.text);
    if (m && n(m[1]) + n(m[2]) !== n(m[3])) bad.push(`${id} how: ${m[0]}`);
    c.examples.forEach((e, k) => {
      if (!/fixed charge/.test(e.text) || /lifeline/.test(e.title)) return;
      const g = (re) => { const x = re.exec(e.text); return x ? n(x[1]) : null; };
      const en = g(/(?:= |[Ee]nergy charge )(Rs [\d,]+)/), fx = g(/fixed charge (Rs [\d,]+)/), fc = g(/FC surcharge (Rs [\d,]+)/), qta = g(/QTA[a-zA-Z ]*? (Rs -?[\d,]+)/), gst = g(/GST (Rs [\d,]+)/), fpa = g(/F(?:P|C)A[a-zA-Z ]*? (Rs -?[\d,]+)/);
      if ([en, fx, fc, gst].includes(null) || /subtotal/i.test(e.text)) return;
      const parts = [en, fx, fc, qta ?? 0, fpa ?? 0, gst];
      const tot = /(?:Estimated (?:\w+ )*bill) (Rs [\d,]+)/.exec(e.text);
      if (tot && parts.reduce((s, x) => s + x, 0) !== n(tot[1])) bad.push(`${id} ex${k}: ${parts.join('+')} != ${tot[1]}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('MF-01b (WL-109): engine bill lines are whole rupees and add up to the total (0 to 1,000 units, 1 to 3 kW, FPA)', () => {
  let miss = 0;
  for (const kw of [1, 2, 3]) for (const fpa of [0, 1.11, -2.37]) for (let u = 0; u <= 1000; u++) {
    const r = C.bill_total({ units: u, sanctioned_kw: kw, period: '2026-09..2026-11', fpa_per_unit: fpa }, data);
    const lines = [r.energy_rs, r.fixed_rs, r.fc_rs, r.qta_rs, r.fpa_rs];
    if (!lines.every(Number.isInteger) || !Number.isInteger(r.gst_rs)) miss++;
    else if (Math.max(0, lines.reduce((s, x) => s + x, 0)) + r.gst_rs !== r.total_rs) miss++;
  }
  assert.equal(miss, 0, `${miss} bills print lines that do not add up`);
});

test('MF-02 (WL-110): E4 and N4 give the same minimum sanctioned load for the same two-AC home', () => {
  for (const current_w of [0, 800, 1500, 2950, 4000, 6000]) {
    const e4 = C.add_ac_check({ current_w, ac: 'ac-split-1-5ton-inverter', sanctioned_kw: 3 }, data);
    const n4 = C.sanctioned_load({ connected_kw: e4.new_total_kw }, data);
    assert.equal(e4.needed_kw, n4.recommended_kw, `${current_w} W`);
    assert.equal(e4.within_sanctioned, n4.recommended_kw <= 3);
  }
  // The field is the connected load (diversity applied once, Engineer Reviewer).
  assert.match(page('E4').tool.fields.find((f) => f.name === 'current_w').label, /Connected load/);
  // The page's two-AC FAQ quotes the same kW the N4 page gives for that connected load.
  const faq = page('E4').faq.find((f) => /two ACs/.test(f.q)).a;
  const n4 = C.sanctioned_load({ connected_kw: 4.4 }, data).recommended_kw;
  assert.match(faq, new RegExp(`so ${n4} kW is the minimum sanctioned load`));
});

test('MF-03 (WL-111): N1 protection-at-risk bill compares with the protected bill the home should have had', () => {
  const r = C.bill_audit({ units: 210, days: 34, sanctioned_kw: 1 }, data);
  assert.equal(r.protection_at_risk, true);
  const [p1, p2] = data.tariff.protected;
  const s1 = (p1.upto * 34) / data.defaults.bill_month_days;
  const fairProtected = s1 * p1.rate + (210 - s1) * p2.rate + p2.fixed_per_kw;
  assert.ok(Math.abs(r.extra_rs - (r.billed_rs - fairProtected)) < 1, `extra_rs ${r.extra_rs.toFixed(2)} vs ${(r.billed_rs - fairProtected).toFixed(2)}`);
  // Floating-point edge (Engineer Reviewer): 230 units over 34.5 days is exactly 200 a month and must not error.
  const edge = C.bill_audit({ units: 230, days: 34.5, sanctioned_kw: 2 }, data);
  assert.equal(edge.ok, true, JSON.stringify(edge));
  assert.equal(edge.fair_protected, true);
});

test('MF-04 (WL-112): E1 prices its own monthly units at the slab those units reach, as F1 does', () => {
  const c = page('E1');
  const o = Object.fromEntries(c.tool.outputs.map((x) => [x.key, x.value]));
  const units = n(o.monthly_units);
  const band = data.tariff.unprotected.find((b) => b.upto === null || units <= b.upto);
  assert.ok(n(o.monthly_rs) >= Math.round(units * band.rate), `${o.monthly_rs} for ${units} units`);
  const loads = c.tool.fields.find((f) => f.type === 'loads').default;
  const e1 = C.home_load_bill({ loads }, data);
  assert.equal(e1.monthly_rs, C.bill_total({ units: e1.monthly_units, sanctioned_kw: data.defaults.default_sanctioned_kw }, data).total_rs);
});

test('MF-05 (WL-113): protected_check accepts "1,500" like every other numeric input', () => {
  const r = C.protected_check({ history: [100, 120, 150, 180, 190, '1,500'] }, data);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.protected, false);
  assert.equal(r.max_month, 1500);
});

test('MF-06 (WL-114): F1 fixed-charge fact names the fixed charge a month with no units pays', () => {
  const kf = page('F1').key_facts.find((t) => /month with no units pays/.test(t));
  assert.ok(kf, 'F1 key fact on the fixed charge');
  assert.doesNotMatch(kf, /before using a single unit/);
  const claimed = n(/no units pays the lowest slab's (Rs [\d,]+) per kW/.exec(kf)[1]);
  assert.equal(C.bill_total({ units: 0, sanctioned_kw: 1 }, data).fixed_rs, claimed);
});

test('MF-07 (WL-114): N1 example 3 does not call a closed band "the top slab"; F tables show the average rate', () => {
  for (const e of page('N1').examples) if (/top slab/.test(e.text)) assert.fail(e.text);
  // Protected rows print the average energy rate, below the top protected slab rate (billed slab by slab).
  const t = page('F1').table;
  const col = t.head.indexOf('Average rate per unit');
  assert.ok(col > 0);
  const row = t.rows.find((r) => /protected\)/.test(r[0]) && !/unprotected/.test(r[0]));
  const r = C.bill_total({ units: n(row[0]), protected: true, sanctioned_kw: 1 }, data);
  assert.equal(row[col], `Rs ${(r.energy_rs / r.units).toFixed(2)}`.replace('Rs ', row[col].slice(0, 3)));
  assert.ok(r.avg_rate < r.rate);
});

test('WL-115: an FPA month from a news report is marked "(FPA reported)" and K-Electric is not given a source that excludes it', () => {
  const bi = page('bill-index');
  const cur = JSON.parse(readFileSync(join(root, 'data/bill-index.json'), 'utf8')).months[0];
  const tables = bi.tables.map((t) => t.caption).join(' | ');
  if (!cur.fpa_verified) assert.match(tables, new RegExp(`${cur.label} \\(FPA reported\\)`));
  const disco = bi.tables.find((t) => /every distribution company/.test(t.caption));
  const ke = disco.rows.find((r) => /K-Electric/.test(r[0]));
  assert.equal(/FPA not included/.test(ke[0]), !cur.fpa_ke);
  // F14 pre-fills the latest NEPRA-verified month and names a newer reported month, never calls it "this month's rate".
  const f14 = page('F14');
  const faq = f14.faq.find((f) => /this month/.test(f.q)).a;
  assert.match(faq, /latest NEPRA-verified/);
  if (!cur.fpa_verified) assert.match(faq, new RegExp(`${cur.label} bills carry .* reported in the news`));
  const kw = readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8').split('\n').find((l) => l.startsWith('F14,'));
  assert.doesNotMatch(kw, /this month's rate/);
});

test('WL-116: every 300-unit bill answer names its kW and FPA basis; the home page no longer says no two pages can disagree', () => {
  for (const id of F) {
    const a = page(id).answer;
    if (!/\b300 units\b/.test(a)) continue;
    assert.match(a, /\d kW connection/, id);
    assert.match(a, /(before the month's (FPA|FCA)|FPA added from your bill|FPA from your bill|the [A-Z][a-z]+ \d{4} (FPA|FCA))/, id);
  }
  const h1 = JSON.stringify(page('H1'));
  assert.doesNotMatch(h1, /no two pages can disagree/);
});

test('WL-117: F1 and every DISCO page explain the top-slab cliff with the engine figure', () => {
  for (const id of F) {
    const c = page(id);
    const kf = c.key_facts.find((t) => /one unit more moves all of them to the top slab/.test(t));
    assert.ok(kf, id);
    // The page's own default inputs (sanctioned load, quarter and, since WL-229, the pre-filled FPA).
    const dflt = Object.fromEntries(c.tool.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
    const at = (units) => C.bill_total({ ...dflt, units, protected: false, lifeline: false }, data).total_rs;
    const edge = data.tariff.unprotected.at(-2).upto;
    assert.ok(kf.includes(`adds ${fmt(at(edge + 1) - at(edge), 'rs')} `), `${id}: ${kf}`);
  }
});

test('WL-118: FPA input bounded by the data range; N16 warns when the AC alone is above the sanctioned load', () => {
  const { min, max } = data.tariff.addons_secondary.fpa_per_unit;
  assert.equal(C.bill_total({ units: 300, sanctioned_kw: 1, fpa_per_unit: max + 1 }, data).error, 'fpa_per_unit_too_large');
  assert.equal(C.bill_total({ units: 300, sanctioned_kw: 1, fpa_per_unit: min - 1 }, data).error, 'fpa_per_unit_too_small');
  assert.equal(C.bill_total({ units: 300, sanctioned_kw: 1, fpa_per_unit: max }, data).ok, true);
  const over = C.ac_bill_impact({ ac: 'ac-split-1-5ton-inverter', hours: 8, other_units: 150, sanctioned_kw: 1 }, data);
  assert.equal(noticeCode(over), 'ac_above_sanctioned');
  // The page default no longer puts a 1.5 ton AC on a 1 kW connection.
  const n16 = page('N16').tool;
  const inputs = Object.fromEntries(n16.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
  assert.equal(C.ac_bill_impact(inputs, data).ac_above_sanctioned, false);
});
