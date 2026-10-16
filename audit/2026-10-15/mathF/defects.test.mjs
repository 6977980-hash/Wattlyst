const ROOT = new URL('../../../', import.meta.url).pathname;
// CONFIRMED DEFECTS: every test in this file FAILS on the current engine/pages (2026-10-15, main as checked out).
// Each test states the correct behaviour; it should pass once the defect is fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
const page = (id) => JSON.parse(readFileSync(`${ROOT}generated/pages/${id}.json`, 'utf8')).content;
const n = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

test('DEFECT MF-01: printed bill lines (energy+fixed+FC+QTA+FPA+GST) add up to the printed total on every F page example and how text', () => {
  const bad = [];
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) {
    const c = page(id);
    const m = /Subtotal (Rs [\d,]+)[;+ ]+GST (?:at )?[\d.]+% (?:= )?\(?(Rs [\d,]+)\)?(?:\. Estimated bill| =) (Rs [\d,]+)/.exec(c.tool.how.text);
    if (m && n(m[1]) + n(m[2]) !== n(m[3])) bad.push(`${id} how: ${m[0]}`);
    c.examples.forEach((e, k) => {
      if (!/fixed charge/.test(e.text) || /lifeline/.test(e.title)) return;
      const g = (re) => { const x = re.exec(e.text); return x ? n(x[1]) : null; };
      const en = g(/(?:= |[Ee]nergy charge )(Rs [\d,]+)/), fx = g(/fixed charge (Rs [\d,]+)/), fc = g(/FC surcharge (Rs [\d,]+)/), qta = g(/QTA[a-zA-Z ]*? (Rs -?[\d,]+)/), gst = g(/GST (Rs [\d,]+)/), fpa = g(/FPA[a-zA-Z ]*? (Rs -?[\d,]+)/);
      if ([en, fx, fc, gst].includes(null) || /subtotal/i.test(e.text)) return;
      const parts = [en, fx, fc, qta ?? 0, fpa ?? 0, gst];
      const tot = /(?:Estimated (?:\w+ )*bill) (Rs [\d,]+)/.exec(e.text);
      if (tot && parts.reduce((s, x) => s + x, 0) !== n(tot[1])) bad.push(`${id} ex${k}: ${parts.join('+')} != ${tot[1]}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('DEFECT MF-01b: engine lines rounded for display reconcile with the rounded total (0..1000 units, 1-3 kW)', () => {
  const R = Math.round; let miss = 0;
  for (const kw of [1, 2, 3]) for (let u = 0; u <= 1000; u++) {
    const r = C.bill_total({ units: u, sanctioned_kw: kw, period: '2026-09..2026-11' }, data);
    if (R(r.energy_rs) + R(r.fixed_rs) + R(r.fc_rs) + R(r.qta_rs) + R(r.fpa_rs) + R(r.gst_rs) !== R(r.total_rs)) miss++;
  }
  assert.equal(miss, 0, `${miss} of 3003 bills print lines that do not add up`);
});

test('DEFECT MF-02: E4 and N4 give the same minimum sanctioned load for the same two-AC home (4.4 kW)', () => {
  const e4 = C.add_ac_check({ current_w: 2950, ac: 'ac-split-1-5ton-inverter', sanctioned_kw: 5 }, data);
  const e4min = Math.ceil(e4.new_total_kw); // E4 text: "at least the new total in kW, rounded up" → 5 kW (ToU)
  const n4 = C.sanctioned_load({ connected_kw: e4.new_total_kw }, data).recommended_kw; // → 3 kW
  assert.equal(e4min, n4);
});

test('DEFECT MF-03: N1 protection-at-risk bill: the possible extra compares with the protected bill the home should have had', () => {
  // 210 units over 34 days, 1 kW, protected history. Billed unprotected: 210×33.10+350 = 7,301.
  // Protected, slab limits pro-rated by 34/30: 113.33×10.54 + 96.67×13.01 + 300 = 2,752.17 → extra ≈ 4,548.83.
  const r = C.bill_audit({ units: 210, days: 34, sanctioned_kw: 1 }, data);
  assert.equal(r.protection_at_risk, true);
  const s1 = 100 * 34 / 30;
  const fairProtected = s1 * 10.54 + (210 - s1) * 13.01 + 300;
  assert.ok(Math.abs(r.extra_rs - (r.billed_rs - fairProtected)) < 1, `extra_rs ${r.extra_rs.toFixed(2)} vs ${(r.billed_rs - fairProtected).toFixed(2)}`);
});

test('DEFECT MF-04: E1 prices its own monthly units at the slab those units reach', () => {
  const o = Object.fromEntries(page('E1').tool.outputs.map((x) => [x.key, x.value]));
  const units = n(o.monthly_units); // 454 → 401-500 band
  const band = data.tariff.unprotected.find((b) => b.upto === null || units <= b.upto);
  assert.ok(n(o.monthly_rs) >= Math.round(units * band.rate), `${o.monthly_rs} for ${units} units; slab energy alone = Rs ${Math.round(units * band.rate)}`);
});

test('DEFECT MF-05: protected_check accepts "1,500" like every other numeric input (WL-17 rule)', () => {
  const r = C.protected_check({ history: [100, 120, 150, 180, 190, '1,500'] }, data);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.protected, false);
});

test('DEFECT MF-06: F1 key fact "pays Rs 350 a month before using a single unit" matches the engine fixed charge at 0 units', () => {
  const kf = page('F1').key_facts.find((t) => /before using a single unit/.test(t));
  const claimed = n(/pays (Rs [\d,]+) a month before using a single unit/.exec(kf)[1]);
  assert.equal(C.bill_total({ units: 0, sanctioned_kw: 1 }, data).fixed_rs, claimed);
});

test('DEFECT MF-07: N1 example 3 calls the 401-500 band "the top slab"', () => {
  const t = page('N1').examples[2].text;
  const r = C.bill_audit({ units: 450, days: 38, sanctioned_kw: 2 }, data);
  const band = data.tariff.unprotected.find((b) => b.upto === null || 450 <= b.upto);
  if (/top slab/.test(t)) assert.equal(band.upto, null, `450 units are in the band up to ${band.upto}; text: ${t}`);
  assert.ok(r.ok);
});
