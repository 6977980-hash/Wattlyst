const ROOT = new URL('../../../', import.meta.url).pathname;
// Independent verification of the Wattlyst bill and load engines. All tests here PASS on correct behaviour.
// Run: node --test /tmp/claude-0/-home-user-wattlyst/10a88ae1-cea1-556c-b13a-8987bcd472f7/scratchpad/mathF/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indepBill, BI } from './indep.mjs';
import { calculators as C } from '../../../engine/index.js';
import { errorMessage } from '../../../engine/messages.js';
import { data } from '../../../tests/load-data.js';

const GEN = 'Something went wrong with this calculation. Please check your inputs.';
const U = [0, 1, 50, 99, 100, 101, 199, 200, 201, 300, 301, 400, 700, 701, 1000, 1500, 5000];
const P = '2026-09..2026-11';
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('bill_total equals the independent model at every boundary, all categories, 1/2/4.9 kW, FPA 0/+1.11/-2', () => {
  for (const cat of ['unprotected', 'protected', 'lifeline']) for (const kw of [1, 2, 4.9]) for (const fpa of [0, 1.11, -2]) for (const u of U) {
    const e = indepBill({ units: u, kw, cat, fpa, period: P });
    const r = C.bill_total({ units: u, sanctioned_kw: kw, protected: cat === 'protected', lifeline: cat === 'lifeline', period: P, fpa_per_unit: fpa }, data);
    if (e.err) { assert.equal(r.ok, false); assert.notEqual(errorMessage(r.error), GEN); continue; }
    assert.equal(r.ok, true, `${cat} ${u} ${r.error}`);
    for (const [k, x] of [['energy_rs', e.energy], ['fixed_rs', e.fixed], ['fc_rs', e.fcRs], ['qta_rs', e.qtaRs], ['fpa_rs', e.fpaRs], ['gst_rs', e.gstRs], ['total_rs', e.total]]) close(r[k], x, `${cat} ${u} ${kw} ${k}`);
  }
});

test('hand-worked anchors (formulas.md F)', () => {
  // 300 unprotected 1 kW: 300×33.10=9930; +350; FC 3.23×300=969; QTA 0.5194×300=155.82; sub 11404.82; GST 18% 2052.8676; total 13457.6876
  close(C.bill_total({ units: 300, period: P }, data).total_rs, 13457.6876, '300u');
  // 200 protected 1 kW: 100×10.54+100×13.01=2355; +300; FC 646; QTA 103.88; sub 3404.88; ×1.18 = 4017.7584
  close(C.bill_total({ units: 200, protected: true, period: P }, data).total_rs, 4017.7584, '200p');
  // 100 lifeline: 100×7.74 = 774, no fixed/QTA/FPA, FC and GST default 0
  close(C.bill_total({ units: 100, lifeline: true, period: P }, data).total_rs, 774, '100 lifeline');
  // FPA exempt for protected and lifeline
  assert.equal(C.bill_total({ units: 150, protected: true, fpa_per_unit: 5 }, data).fpa_rs, 0);
  assert.equal(C.bill_total({ units: 80, lifeline: true, fpa_per_unit: 5 }, data).fpa_rs, 0);
});

test('bill non-decreasing in units within each category (cliffs at slab edges are upward only); GST share constant', () => {
  for (const cat of ['unprotected', 'protected', 'lifeline']) for (const fpa of [0, 1.11, -2]) {
    let prev = -1;
    for (let u = 0; u <= 5000; u += 0.25) {
      const r = C.bill_total({ units: u, protected: cat === 'protected', lifeline: cat === 'lifeline', period: P, fpa_per_unit: fpa }, data);
      if (!r.ok) break;
      assert.ok(r.total_rs >= prev - 1e-9, `${cat} ${u}`);
      if (r.total_rs > 0) close(r.gst_rs / r.total_rs, r.gst_pct / (100 + r.gst_pct), 'gst share');
      prev = r.total_rs;
    }
  }
});

test('protected never dearer than unprotected for the same units', () => {
  for (let u = 0; u <= 200; u++) assert.ok(C.bill_total({ units: u, protected: true, period: P }, data).total_rs <= C.bill_total({ units: u, period: P }, data).total_rs);
});

test('invalid inputs give ok:false with a specific message; never NaN/Infinity', () => {
  for (const v of [null, '', 'abc', '18%', '1e3', '0x10', -1, Infinity, NaN, '1,5', 1e13, true, {}]) {
    const r = C.bill_total({ units: v }, data);
    assert.equal(r.ok, false, String(v)); assert.notEqual(errorMessage(r.error), GEN, r.error);
  }
  assert.equal(C.bill_total({ units: '1,500' }, data).ok, true);
  assert.equal(C.bill_total({ units: 300, sanctioned_kw: 5 }, data).error, 'tou_required_at_5kw');
  assert.equal(C.bill_total({ units: 300, gst_pct: '18%' }, data).error, 'gst_pct_invalid');
  assert.equal(C.bill_total({ units: 300, period: '2027-01..2027-03' }, data).error, 'period_unknown');
});

test('Bill Index ladder and month tables equal the independent model (2 kW, month FPA and QTA)', () => {
  const g = JSON.parse(readFileSync(ROOT + 'generated/pages/bill-index.json', 'utf8')).content;
  const rs = (x) => 'Rs ' + Math.round(x).toLocaleString('en-US');
  const [cur, prev] = BI.months;
  for (const row of g.tables[0].rows) {
    const u = Number(row[0].replace(/,/g, ''));
    assert.equal(row[1], rs(indepBill({ units: u, kw: BI.sanctioned_kw, fpa: cur.fpa_per_unit, period: cur.qta_period }).total), `ladder ${u}`);
    if (u <= 200) assert.equal(row[3], rs(indepBill({ units: u, kw: BI.sanctioned_kw, cat: 'protected', fpa: cur.fpa_per_unit, period: cur.qta_period }).total));
  }
  for (const row of g.tables[1].rows) {
    const u = Number(row[0].replace(/,/g, '')); const cat = row[1].toLowerCase();
    assert.equal(row[2], rs(indepBill({ units: u, kw: 2, cat, fpa: cur.fpa_per_unit, period: cur.qta_period }).total));
    assert.equal(row[3], rs(indepBill({ units: u, kw: 2, cat, fpa: prev.fpa_per_unit, period: prev.qta_period }).total));
  }
});

test('N16 = F1 run twice = E5 units; protected loss and 6-month lock', () => {
  for (const [o, prot, ac, h] of [[180, true, 'ac-split-1-5ton-inverter', 8], [250, false, 'ac-split-1-5ton-inverter', 8], [120, true, 'ac-split-1ton-inverter', 2], [150, true, 'ac-split-1ton-inverter', 2.6]]) {
    const n = C.ac_bill_impact({ ac, hours: h, other_units: o, protected: prot, period: P }, data);
    const e5 = C.ac_units({ ac, hours: h }, data);
    close(n.ac_units, e5.monthly_units, 'E5');
    const tot = o + e5.monthly_units; const lost = prot && tot > 200;
    const b = indepBill({ units: o, cat: prot ? 'protected' : 'unprotected', period: P }).total;
    const a = indepBill({ units: tot, cat: prot && !lost ? 'protected' : 'unprotected', period: P }).total;
    close(n.before_rs, b, 'before'); close(n.after_rs, a, 'after'); close(n.extra_rs, a - b, 'extra');
    assert.equal(n.protected_lost, lost);
    close(n.lock_extra_rs, lost ? 6 * (indepBill({ units: o, period: P }).total - b) : 0, 'lock');
  }
  // page default: 180 protected + 240 AC units = 420 → Rs 3,622 → Rs 21,752, extra Rs 18,130, Rs 75.54/AC unit, lock Rs 22,012
  const n = C.ac_bill_impact({ ac: 'ac-split-1-5ton-inverter', hours: 8, other_units: 180, protected: true, period: P }, data);
  assert.equal(Math.round(n.extra_rs), 18130); assert.equal(Math.round(n.lock_extra_rs), 22012); close(Math.round(n.rs_per_ac_unit * 100) / 100, 75.54, 'per unit');
});

test('E5 ac_units grows with hours and tonnage', () => {
  for (const fam of [['ac-split-1ton-inverter', 'ac-split-1-5ton-inverter', 'ac-split-2ton-inverter'], ['ac-split-1ton-non-inverter', 'ac-split-1-5ton-non-inverter', 'ac-split-2ton-non-inverter']]) {
    const m = fam.map((ac) => C.ac_units({ ac, hours: 8 }, data).monthly_units);
    assert.ok(m[0] < m[1] && m[1] < m[2], m.join());
    for (const ac of fam) { let pv = -1; for (let h = 0; h <= 24; h += 0.5) { const x = C.ac_units({ ac, hours: h }, data).monthly_units; assert.ok(x >= pv); pv = x; } }
  }
  assert.equal(C.ac_units({ ac: 'ac-split-1-5ton-inverter', hours: 25 }, data).error, 'hours_too_large');
  assert.equal(C.ac_units({ ac: 'ac-split-1-5ton-inverter', hours: 8, days: 32 }, data).error, 'days_too_large');
});

test('N9 sign: raising the set point saves, lowering costs extra, capped at 100%', () => {
  const up = C.ac_temp({ t_old: 22, t_new: 26, monthly_units: 240 }, data);
  close(up.saving_pct, 0.24, 'pct'); close(up.units_saved, 57.6, 'units');
  const dn = C.ac_temp({ t_old: 26, t_new: 22, monthly_units: 240 }, data);
  assert.equal(dn.saving_pct, 0); close(dn.extra_pct, 0.24, 'extra');
  assert.ok(C.ac_temp({ t_old: 16, t_new: 30, monthly_units: 240, per_degree: 0.2 }, data).saving_pct <= 1);
});

test('N10 payback = price diff ÷ (annual saving ÷ 12); zero/negative saving guarded', () => {
  const r = C.ac_payback({ kw_noninv: 1.8, kw_inv: 1, hours_year: 1200, tariff: 36.46, price_diff: 40000 }, data);
  close(r.payback_months, 40000 / (((1.8 * 0.8 - 1) * 1200 * 36.46) / 12), 'payback');
  assert.equal(C.ac_payback({ kw_noninv: 1.8, kw_inv: 1.5, hours_year: 1200, tariff: 36.46, price_diff: 40000 }, data).error, 'inverter_ac_must_use_less');
  assert.equal(C.ac_payback({ kw_noninv: 1.8, kw_inv: 1.4399, hours_year: 1200, tariff: 36.46, price_diff: 40000 }, data).error, 'inverter_ac_no_payback');
  assert.equal(C.ac_payback({ kw_noninv: 1.8, kw_inv: 1, hours_year: 0, tariff: 36.46, price_diff: 40000 }, data).error, 'hours_year_invalid');
});

test('N5, N8, E3, E6, N4 hand formulas', () => {
  const h = C.heating_cost({ q_kw: 2, cop: 3, tariff: 36.46, gas_price_mmbtu: 1250 }, data);
  close(h.ac_rs_per_h, (2 / 3) * 36.46, 'ac'); close(h.gas_price, (1250 * 37) / 1055.056, 'gas Rs/m3'); close(h.gas_rs_per_h, ((2 / 0.8) * 3.6 / 37) * (1250 * 37) / 1055.056, 'gas Rs/h');
  const e = C.ebike({ v: 48, ah: 24, range_km: 60, tariff: 36.46 }, data);
  close(e.rs_per_km, (48 * 24 / 1000 / 0.85) * 36.46 / 60, 'ebike');
  close(C.load_check({ total_w: 3000, sanctioned_kw: 2 }, data).amps, 3000 / (230 * 0.8), 'E3');
  close(C.units({ watts: 1000, hours: 1, days: 30 }, data).units, 30, 'E6');
  assert.equal(C.sanctioned_load({ connected_kw: 6 }, data).recommended_kw, 4);
});

test('E4 AC circuit equals W1/W3 breaker for every AC', () => {
  for (const ac of Object.keys(data.appliances).filter((k) => k.startsWith('ac-') || k.startsWith('heat-pump'))) {
    const e4 = C.add_ac_check({ current_w: 1500, ac, sanctioned_kw: 2 }, data); const w = C.breaker_size({ appliance: ac }, data);
    assert.deepEqual([e4.ac_breaker_a, e4.ac_curve, e4.ac_cable_mm2], [w.breaker_a, w.curve, w.area_mm2], ac);
  }
});

test('H3..H7 / E1 / E2 page outputs equal Σ watts × qty × hours from data/appliances.json', () => {
  const A = data.appliances;
  for (const id of ['E1', 'E2', 'H3', 'H4', 'H5', 'H6', 'H7']) {
    const g = JSON.parse(readFileSync(`${ROOT}generated/pages/${id}.json`, 'utf8')).content;
    const defs = Object.fromEntries(g.tool.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
    const daily = defs.loads.reduce((s, r) => { const a = A[r.id]; const run = r.watts ?? a.running_w; const ew = a.avg_w ? (a.avg_w * run) / a.running_w : run; return s + ew * (r.qty ?? 1) * (r.hours ?? a.typical_hours_per_day); }, 0) / 1000;
    const out = Object.fromEntries(g.tool.outputs.map((o) => [o.key, o.value]));
    assert.equal(Number(out.monthly_units.replace(/,/g, '')), Number((daily * (defs.days ?? 30)).toFixed(out.monthly_units.includes('.') ? 1 : 0)), id);
  }
});

test('every F page default and worked example matches the independent bill', () => {
  const rs = (x) => 'Rs ' + Math.round(x).toLocaleString('en-US');
  const blank = (v) => v === '' || v === undefined || v === null;
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F14']) {
    const c = JSON.parse(readFileSync(`${ROOT}content/pages/${id}.json`, 'utf8'));
    const g = JSON.parse(readFileSync(`${ROOT}generated/pages/${id}.json`, 'utf8')).content;
    const defs = Object.fromEntries(g.tool.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
    const ind = (i) => indepBill({ units: Number(i.units), kw: Number(i.sanctioned_kw ?? 1), cat: i.lifeline === true ? 'lifeline' : i.protected === true ? 'protected' : 'unprotected', period: i.period, fc: blank(i.fc_surcharge_per_unit) ? undefined : Number(i.fc_surcharge_per_unit), gst: blank(i.gst_pct) ? undefined : Number(i.gst_pct), fpa: blank(i.fpa_per_unit) ? 0 : Number(i.fpa_per_unit) });
    assert.equal(g.tool.outputs.find((o) => o.key === 'total_rs').value, rs(ind(defs).total), id);
    (c.examples || []).forEach((e, k) => assert.ok(g.examples[k].text.includes(rs(ind({ ...defs, ...e.inputs }).total)), `${id} ex ${k}`));
  }
});
