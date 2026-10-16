// CONFIRMED DEFECTS (audit 2026-10-15, solar + price engines). Every test in this file FAILS on the current code
// and PASSES once the defect is fixed. Run: node --test /tmp/claude-0/-home-user-wattlyst/10a88ae1-cea1-556c-b13a-8987bcd472f7/scratchpad/mathD/defects.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, pageInputs, J } from './lib.mjs';
import { calculators as C } from '../../../engine/index.js';
import { inverterAt } from '../../../engine/prices.js';
import { noticeCode } from '../../../engine/messages.js';

const M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

test('DEFECT MD-01: grid-tied house list (D8, no battery) sized like D7 for the same daily units', () => {
  // D8 default: 15.635 kWh/day. D7 for 15.635 kWh/day = 7 panels (4.095 kW); D8 gives 9 panels (5.265 kW)
  // because the midday power rule (P_run / PR = 4,085 / 0.78 = 5.24 kW) wins on a grid-tied page.
  const { inputs } = pageInputs('D8');
  const d8 = C.solar_from_loads(inputs, data);
  const d7 = C.solar_size({ daily_kwh: d8.daily_kwh, city: inputs.city }, data);
  assert.equal(d8.panels, d7.panels, `D8 ${d8.panels} panels vs D7 ${d7.panels} for ${d8.daily_kwh} kWh/day`);
});

test('DEFECT MD-02: D8 FAQ "Is a 5 kW solar system enough?" must not answer "Yes" when the engine needs a bigger inverter (D13 checked too)', () => {
  for (const [id, size] of [['D8', 5], ['D13', 15]]) {
    const g = J(`generated/pages/${id}.json`).content;
    const f = g.faq.find((x) => new RegExp(`Is a ${size} kW solar system enough`).test(x.q));
    const r = C.solar_from_loads(pageInputs(id).inputs, data);
    const needs = r.inverter_kw > size + 1e-9; // the page itself says installers quote by inverter size
    assert.ok(!(needs && /^Yes/.test(f.a)), `${id}: "${f.a}" while engine needs ${r.installed_kw} kW panels, ${r.inverter_kw} kW inverter`);
  }
  const s = JSON.stringify(J('generated/pages/D8.json').content);
  const r = C.solar_from_loads(pageInputs('D8').inputs, data);
  assert.ok(!(r.inverter_kw > 5 && /A five kW inverter with/.test(s)), `D8 text recommends a five kW inverter, engine minimum ${r.inverter_kw} kW`);
});

test('DEFECT MD-03: a hybrid inverter is never priced below an on-grid inverter of the same kW (H1 hybrid premium)', () => {
  const items = data.component_prices.items;
  for (let kw = 1; kw <= 10; kw += 0.5) {
    const [h] = inverterAt(items, 'hybrid_inverter', kw);
    const [o] = inverterAt(items, 'ongrid_inverter', kw);
    assert.ok(h > o, `${kw} kW: hybrid Rs ${Math.round(h)} <= on-grid Rs ${Math.round(o)}, premium clamps to 0`);
  }
});

test('DEFECT MD-04: D3 off-grid array covers the daily need in the worst month, not only on the yearly average', () => {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const { inputs } = pageInputs('D3');
  const r = C.solar_from_loads(inputs, data);
  const pv = data.cities[inputs.city].pvout_month;
  const worst = Math.min(...pv.map((p, m) => (r.installed_kw * p) / DAYS[m]));
  assert.ok(worst >= r.array_kwh - 1e-9, `Lahore worst month makes ${worst.toFixed(2)} kWh/day, off-grid need ${r.array_kwh.toFixed(2)}`);
});

test('DEFECT MD-05: hours a day above 24 are rejected (D5 hours, D15 hours, night_hours, D6 PSH), as E5 and the loads rows do', () => {
  assert.equal(C.ac_units({ ac: 'ac-split-1-5ton-inverter', hours: 25 }, data).error, 'hours_too_large'); // reference behaviour
  assert.equal(C.solar_for_ac({ ac: 'ac-split-1-5ton-inverter', hours: 25, city: 'lahore' }, data).ok, false, 'D5 hours 25');
  assert.equal(C.solar_for_pump({ hp: 10, hours: 25, city: 'multan' }, data).ok, false, 'D15 hours 25');
  assert.equal(C.solar_for_ac({ ac: 'ac-split-1-5ton-inverter', hours: 8, night_hours: 25, city: 'lahore' }, data).ok, false, 'night_hours 25');
  assert.equal(C.solar_from_loads({ loads: [{ id: 'led-bulb', hours: 6 }], night_hours: 30, off_grid: true, city: 'lahore' }, data).ok, false, 'D3 night_hours 30');
  assert.equal(C.panel_for_12v({ ah: 100, volts: 12, psh: 25 }, data).ok, false, 'D6 psh 25');
});

test('DEFECT MD-06: N6 sky label for a long-term-average sky does not depend on the PR typed in', () => {
  // ΣGTI = Lahore PSH × 1000 = 5,100 Wh/m²: the same sun as the typical day.
  const gti = [0, 0, 0, 0, 0, 0, 100, 300, 500, 650, 750, 800, 750, 600, 400, 200, 50, 0, 0, 0, 0, 0, 0, 0];
  const a = C.solar_forecast({ city: 'lahore', kwp: 5, pr: 0.78, gti_wm2: gti }, data);
  const b = C.solar_forecast({ city: 'lahore', kwp: 5, pr: 0.5, gti_wm2: gti }, data);
  assert.equal(b.sky, a.sky, `PR 0.78 -> ${a.sky} ${a.pct_of_typical.toFixed(1)}%, PR 0.5 -> ${b.sky} ${b.pct_of_typical.toFixed(1)}%`);
  const t = C.solar_forecast({ city: 'lahore', kwp: 5, pr: 0.5 }, data);
  assert.ok(Math.abs(t.units - 5 * 5.1 * 0.5) < 1e-9 || Math.abs(b.pct_of_typical - 100) < 2, `typical day ignores PR: ${t.units} units at PR 0.5`);
});

test('DEFECT MD-07: D6 above the largest standard panel still shows a panel to buy (or a notice)', () => {
  const r = C.panel_for_12v({ ah: 200, volts: 24, psh: 5 }, data); // needs 724 W > 585 W
  const shown = J('content/pages/D6.json').outputs.map((o) => o.key).filter((k) => r[k] !== undefined);
  assert.ok(shown.includes('standard_panel_w') || shown.includes('panels_of_largest') || noticeCode(r) !== '', `only ${shown.join(', ')} shown, no notice`);
});

test('DEFECT MD-08: D7 and N17 agree on the panel count for twelve equal bills (360 vs 365 days, yield rounded to 0.1)', () => {
  // Karachi 330 units every month: D7 330/30/4.6 = 2.391 kW -> 5 panels; N17 3,960/1,698 = 2.332 kW -> 4 panels.
  const d7 = C.solar_size({ monthly_units: 330, city: 'karachi' }, data);
  const n17 = C.solar_seasonal({ city: 'karachi', ...Object.fromEntries(M.map((k) => [k, 330])) }, data);
  assert.equal(d7.panels, n17.panels, `D7 ${d7.kw.toFixed(3)} kW / ${d7.panels} vs N17 ${n17.kw_annual.toFixed(3)} kW / ${n17.panels}`);
});

test('DEFECT MD-09 (WL-16 leftover): minimum sizes printed rounded UP on D6 (panel W), D15 (drive kW), D16 (amps)', async () => {
  const { fmt } = await import('../../../engine/format.js');
  const spec = (id, key) => J(`content/pages/${id}.json`).outputs.find((o) => o.key === key).spec;
  const cases = [
    ['D6', 'panel_w', C.panel_for_12v({ ah: 150, volts: 12, psh: 5 }, data).panel_w], // 271.49 -> "271"
    ['D15', 'drive_kw', C.solar_for_pump({ hp: 10, hours: 6, city: 'multan' }, data).drive_kw], // 11.6516 -> "11.65"
    ['D16', 'amps', C.charge_controller({ type: 'mppt', panel_w: 1003, battery_v: 48 }, data).amps], // 26.12 -> "26.1"
  ];
  for (const [id, key, v] of cases) {
    const shown = Number(fmt(v, spec(id, key)).replace(/,/g, ''));
    assert.ok(shown >= v - 1e-9, `${id} ${key}: ${v} printed as ${shown}`);
  }
});
