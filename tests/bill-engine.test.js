// Audit 2026-10-21, fix Phase 2 (bill engine and bill pages): WL-157, WL-161 to WL-168, WL-229.
// Rules live in specs/formulas.md section F; these tests pin where they flow, not the figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculators as C } from '../engine/index.js';
import { errorMessage } from '../engine/message-text.js';
import { data, root, readJson } from './load-data.js';

const page = (id) => JSON.parse(readFileSync(join(root, 'generated/pages', `${id}.json`), 'utf8')).content;
const manifest = readJson('generated/manifest.json');
const ix = readJson('data/bill-index.json');
const F = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
const dflt = (c) => Object.fromEntries(c.tool.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
// "100 × Rs 10.54 + 50 × Rs 13.01" -> its value.
const sumOf = (s) => s.split(' + ').reduce((t, part) => { const [u, r] = part.split(' × ').map(n); return t + u * r; }, 0);
const n = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

test('WL-157: protected homes pay the FPA; the exempt list is data, per month on the Bill Index', () => {
  const ex = data.tariff.addons_secondary.fpa_per_unit.exempt;
  assert.ok(ex.includes('lifeline') && !ex.includes('protected'));
  for (const m of ix.months) assert.ok(Array.isArray(m.fpa_exempt) && !m.fpa_exempt.includes('protected'), m.month);
  const r = C.bill_total({ units: 150, protected: true, sanctioned_kw: 1, fpa_per_unit: 1 }, data);
  assert.equal(r.fpa_exempt, false);
  assert.equal(r.fpa_rs, 150);
  assert.equal(C.bill_total({ units: 80, lifeline: true, fpa_per_unit: 1 }, data).fpa_rs, 0);
  // A month's own list wins (the March 2026 review spared protected consumers for that month).
  assert.equal(C.bill_total({ units: 150, protected: true, sanctioned_kw: 1, fpa_per_unit: 1, fpa_exempt: ['lifeline', 'protected'] }, data).fpa_rs, 0);
  // Bill Index protected rows carry the month's FPA.
  const cur = ix.months[0];
  const p200 = C.bill_total({ units: 200, protected: true, sanctioned_kw: ix.sanctioned_kw, fpa_per_unit: cur.fpa_per_unit, period: cur.qta_period, fpa_exempt: cur.fpa_exempt }, data);
  assert.ok(p200.fpa_rs > 0);
  const bi = JSON.stringify(page('bill-index'));
  assert.ok(bi.includes(p200.total_rs.toLocaleString('en-US')), 'Bill Index prints the protected bill with the FPA');
  // No page tells a protected home it is exempt or that an FPA line on a protected bill is an error.
  const all = ['F14', 'N1', 'N16', 'P-G', 'bill-index', ...F].map((id) => JSON.stringify(page(id))).join(' ');
  assert.doesNotMatch(all, /protected consumers do not pay|exempts protected|protected and lifeline consumers should see no FPA|exempt from FPA|protected bill carries an FPA line, that is a billing error/i);
});

test('WL-229: F1 to F12 pre-fill the newest NEPRA-verified FPA and say which month it is', () => {
  const latest = ix.months.find((m) => m.fpa_verified);
  for (const id of [...F, 'F13']) {
    const f = page(id).tool.fields.find((x) => x.name === 'fpa_per_unit');
    assert.equal(f.default, latest.fpa_per_unit, id);
    assert.ok(f.hint.includes(latest.fpa_for) && f.hint.includes(latest.label), `${id}: hint names the month`);
    assert.ok(page(id).tool.outputs.some((o) => o.key === 'fpa_rs'), `${id}: FPA line in the results`);
  }
});

test('WL-161: a ticked lifeline box gives the lifeline example total (FC surcharge and GST are placeholders)', () => {
  for (const id of F) {
    const c = page(id);
    for (const name of ['fc_surcharge_per_unit', 'gst_pct']) {
      const f = c.tool.fields.find((x) => x.name === name);
      assert.equal(f.default, undefined, `${id} ${name}: no pre-filled value`);
      assert.match(f.placeholder, /^Blank = (Rs )?[\d.]+/, `${id} ${name}: placeholder names the default`);
    }
    const ex = readJson(`content/pages/${id}.json`).examples.find((e) => e.inputs.lifeline);
    if (!ex) continue;
    // What the browser sends: the page defaults, the box ticked and the example's units.
    const live = C.bill_total({ ...dflt(c), units: ex.inputs.units, lifeline: true }, data);
    const shown = c.examples.find((e) => /lifeline/.test(e.title)).text;
    assert.ok(shown.endsWith(`${live.total_rs.toLocaleString('en-US')}.`), `${id}: ${shown}`);
  }
});

test('WL-164: protected how text prints the slab sum and its arithmetic holds; CSV has an average rate column', () => {
  const r = C.bill_total({ units: 150, protected: true, sanctioned_kw: 1 }, data);
  assert.equal(Math.round(sumOf(r.energy_calc)), r.energy_rs);
  assert.equal(r.energy_calc.split(' + ').length, 2);
  for (const id of F) assert.match(page(id).tool.how.tpl, /\{\{out\.energy_calc\}\}/, id);
  const csv = readFileSync(join(root, 'generated/data/pakistan-electricity-bill-index.csv'), 'utf8').split('\n');
  const head = csv[0].split(',');
  assert.ok(head.includes('avg_rate_rs_per_unit') && head.includes('top_slab_rate_rs_per_unit') && !head.includes('rate_rs_per_unit'));
  const row = csv.find((l) => /^\d{4}-\d{2},150,protected,/.test(l)).split(',');
  const avg = Number(row[head.indexOf('avg_rate_rs_per_unit')]), energy = Number(row[head.indexOf('energy_rs')]);
  assert.ok(Math.abs(avg * 150 - energy) <= 1.5, 'avg rate × units = energy');
});

test('WL-163: N1 shows the year-on-year spike when last year\'s units are entered', () => {
  const o = page('N1').tool.outputs.find((x) => x.key === 'spike');
  assert.ok(o && o.optional && o.spec === 'yesno');
  assert.equal(C.bill_audit({ units: 950, days: 30, prev_year_units: 600 }, data).spike, true);
  assert.equal(C.bill_audit({ units: 950, days: 30 }, data).spike, undefined);
  const php = readFileSync(join(root, 'includes/class-wattlyst-render.php'), 'utf8');
  assert.match(php, /'' === \(string\) \$o\['value'\] \? ' hidden' : ''/, 'an empty optional card starts hidden');
});

test('WL-162: the 5 kW message points to a working ToU bill linked under Sanctioned load on every page that shows it', () => {
  const msg = errorMessage('tou_required_at_5kw');
  assert.match(msg, /link under Sanctioned load/);
  const f13 = manifest.pages.find((p) => p.id === 'F13');
  const kw = data.defaults.tou_threshold_kw;
  let seen = 0;
  for (const p of manifest.pages.filter((x) => x.live && x.id !== 'F13')) {
    const c = page(p.id);
    const f = c.tool?.fields.find((x) => x.name === 'sanctioned_kw');
    if (!f) continue;
    const r = C[c.tool.calc]({ ...dflt(c), ...c.tool.fixed_inputs, sanctioned_kw: kw }, { ...data, ...JSON.parse(readFileSync(join(root, 'generated/manifest.json'), 'utf8')).data });
    if (r.error !== 'tou_required_at_5kw') continue;
    seen++;
    assert.equal(f.label, 'Sanctioned load', p.id);
    assert.ok((f.l || []).some((l) => l.u === f13.url), `${p.id}: Sanctioned load hint links the ToU bill`);
  }
  assert.ok(seen >= F.length, `${seen} pages show the 5 kW message`);
  // The ToU bill is a full bill: add-on lines and GST, and they add up.
  const t = C.bill_tou({ peak_units: 100, offpeak_units: 600, sanctioned_kw: 6, mdi_kw: 4, period: '2026-09..2026-11', fpa_per_unit: 1 }, data);
  assert.equal(t.energy_rs + t.fixed_rs + t.fc_rs + t.qta_rs + t.fpa_rs + t.gst_rs, t.total_rs);
  const c = page('F13');
  assert.equal(c.tool.outputs[0].key, 'total_rs');
  assert.match(c.tool.how.text, /Estimated bill Rs [\d,]+\.$/);
});

test('WL-162: the off-peak ToU rate sits between the slab rates N4 names', () => {
  const u = data.tariff.unprotected;
  assert.ok(data.tariff.tou.offpeak > u[2].rate && u.slice(3).every((b) => data.tariff.tou.offpeak < b.rate), 'N4: off-peak is below every slab rate above the third band');
  assert.ok(JSON.stringify(page('N4')).includes('ToU bill calculator'));
});

test('WL-165: F1 to F12 show the next slab limit and what one more unit adds', () => {
  for (const id of F) {
    const c = page(id);
    for (const k of ['next_units', 'next_rs']) assert.ok(c.tool.outputs.find((o) => o.key === k)?.optional, `${id} ${k}`);
    const r = C.bill_total(dflt(c), data);
    const v = c.tool.outputs.find((o) => o.key === 'next_rs').value;
    assert.equal(n(v), r.next_rs, id);
  }
  // None at the open-ended top band or on lifeline.
  assert.equal(C.bill_total({ units: 900, sanctioned_kw: 3 }, data).next_units, undefined);
  assert.equal(C.bill_total({ units: 60, lifeline: true }, data).next_units, undefined);
  // A protected home in the first slab sees that slab's limit, not the protected limit.
  assert.equal(C.bill_total({ units: 80, protected: true, sanctioned_kw: 1 }, data).next_units, data.tariff.protected[0].upto);
});

test('WL-167: no page says the FPA differs between DISCOs; K-Electric gets the uniform FCA; Bill Index links name the kW basis', () => {
  const all = [...F, 'F13', 'F14', 'N16', 'P-F', 'bill-index'].map((id) => JSON.stringify(page(id))).join(' ');
  assert.doesNotMatch(all, /before the month's FPA|leaves out the month's FPA|apart from the monthly fuel adjustment|only the (monthly )?FPA (line )?(can )?differs?|FPA differs|only by the month's FPA|K-Electric's own monthly figure|can differ from the FPA other DISCOs|decided separately|only the company name and the FPA/i);
  for (const m of ix.months) assert.equal(m.fpa_ke, true, m.month);
  for (const id of ['F1', 'N1', 'P-F']) {
    const t = JSON.stringify(page(id));
    assert.ok(t.includes(`${ix.sanctioned_kw} kW sanctioned load`), `${id}: Bill Index link states its kW basis`);
  }
});

test('WL-168 and WL-166: F13 leads with every season; N4 links the ToU tool; Bill Index per unit figures say before income tax', () => {
  const s = data.tariff.tou.peak_hours.seasons;
  const a = page('F13').answer;
  for (const x of s) assert.ok(a.includes(`${x.from} to ${x.to} in ${x.months}`), x.months);
  assert.doesNotMatch(JSON.stringify(page('N4')), /on the bill pages/);
  const bi = page('bill-index');
  assert.ok(bi.key_facts[1].includes('before income tax'));
  assert.ok(bi.tables[0].head.some((h) => /before income tax/.test(h)));
});
