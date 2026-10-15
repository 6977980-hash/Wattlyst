// Full audit 15 Oct 2026, fix Phase 4 (battery, generator, wiring, solar tools): MA-01 to MA-16 and MD-02, MD-04 to MD-09
// moved from the audit branch (audit/2026-10-15/mathA/audit-math-a.test.js and mathD/defects.test.mjs; all failed on
// v0.8.19 except MD-08, already fixed by WL-106) and adapted to tests/load-data.js. MD-04 checks the [ENGINEER] default
// (show the weakest month) instead of worst-month sizing. Rules: specs/formulas.md B, W, D, N6 and the WL-1xx bullets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { data, root } from './load-data.js';
import { calculators as C } from '../engine/index.js';
import { errorMessage, noticeCode } from '../engine/messages.js';
import { fmt } from '../engine/format.js';
import { inverterAt } from '../engine/prices.js';
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const page = (id) => J(`generated/pages/${id}.json`);
const content = (id) => J(`content/pages/${id}.json`);
const text = (id) => JSON.stringify(page(id).content);
const lookup = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function pageInputs(id) {
  const c = content(id); const inp = {};
  for (const f of c.fields) { let v = f.default; if (typeof v === 'string' && v.startsWith('@')) { const p = v.slice(1); v = p.startsWith('data.') ? lookup(data, p.slice(5)) : data.defaults[p]; } if (v !== undefined) inp[f.name] = v; }
  Object.assign(inp, c.fixed_inputs || {}); return { calc: c.calc, inputs: inp, content: c };
}
const M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// ================================================================ DEFECTS (fail today)
test('MA-01 (Medium): C5 says a 1 hp pump generator "also carries a few lights and fans", but any running light pushes it up a size', () => {
  const alone = C.generator_for_pump({ hp: 1 }, data).standard_kva;
  const withLights = C.generator_for_pump({ hp: 1, other_w: 40 }, data).standard_kva; // one fan or a few LED bulbs
  const claims = /also carries a few lights and fans|rarely changes the size/.test(text('C5'));
  assert.ok(!(claims && withLights > alone), `C5 text claims the size holds, engine: ${alone} kVA alone, ${withLights} kVA with 40 W`);
});

test('MA-02 (Medium): UPS/battery runtime ignores the inverter no-load draw (data says 30 W), so low-load backup is overstated up to 3.5x', () => {
  const idle = data.appliances['ups-idle'].running_w; // 30 W
  const r = C.ups_backup({ va: 1000, ah: 150, volts: 12, load_w: 10 }, data);
  const expected = (150 * 12 * 0.5) / (10 / 0.85 + idle); // 21.55 h
  assert.ok(r.hours <= expected * 1.1, `engine ${r.hours} h, expected about ${expected.toFixed(2)} h with the idle draw`);
});

test('MA-03 (Medium): DC battery-to-inverter design current omits inverter efficiency; W2 example 63 A device is below the real 69 A', () => {
  const ex = C.wire_size({ mode: 'dc', volts: 48, watts: 3000, length_m: 3 }, data); // W2 example 4
  const realIb = 3000 / (data.defaults.inverter_eff_hybrid * 48); // 69.4 A at nominal 48 V
  assert.ok(ex.breaker_a >= realIb && ex.ampacity_a >= realIb * 1.25, `breaker ${ex.breaker_a} A, cable ${ex.ampacity_a.toFixed(1)} A vs battery current ${realIb.toFixed(1)} A`);
});

test('MA-04 (Low): A10 says 2.4 kWh runs a 1,000 W inverter "well under an hour"; the engine (B1/B3) gives 1 h 1 min', () => {
  const h = C.battery_runtime({ ah: 200, volts: 12, load_w: 1000 }, data).hours;
  assert.ok(!(/well under an hour/.test(text('A10')) && h >= 1), `engine ${fmt(h, 'hm')}`);
});

test('MA-05 (Low, WL-16 residual): minimum sizes printed rounded to nearest on B4 (kWh) and C1/C3 (kVA)', () => {
  const spec = (id, key) => content(id).outputs.find((o) => o.key === key).spec;
  assert.equal(spec('B4', 'kwh_required'), 'up1', 'B4 prints 4.7 kWh for 4.706 kWh needed');
  assert.equal(spec('C1', 'recommended_kva'), 'up2', 'C1 prints 3.25 kVA for 3.2547 kVA needed (custom 2,083 W)');
  assert.equal(spec('C3', 'recommended_kva'), 'up2');
});

test('MA-06 (Low): A4 gives an inverter AC PF 0.8 and running watts and says "Use the running amps for the cable"; W1/W3/E4/N18 use 1,900 W at PF 0.9', () => {
  const t = text('A4');
  assert.ok(!/Use the running amps for the cable/.test(t), 'A4 tells users to size the cable on running amps (7.88 A); W1 designs on 9.18 A');
});

test('MA-07 (Low): W4 FAQ says the page "does not check the current rating", but the engine flags over_cable_rating and the page shows that warning', () => {
  const r = C.voltage_drop({ ...content('W4').fixed_inputs, amps: 30, volts: 420, length_m: 25, area_mm2: 4, circuit: 'lighting' }, data);
  assert.ok(!(r.over_cable_rating === true && /does not check the current rating/i.test(text('W4'))));
});

test('MA-08 (Low): N18 "clipped on the surface" example names the geyser as the circuit that changes; it is the 2 ton AC', () => {
  const loads = content('N18').fields.find((f) => f.name === 'loads').default;
  const b1 = C.circuit_schedule({ loads }, data); const c = C.circuit_schedule({ loads, method: 'C' }, data);
  const geyser = (r) => r.rows.find((x) => /geyser/i.test(x.name)).area_mm2;
  const ex = page('N18').content.examples.find((e) => /clipped on the surface/.test(e.title)).text;
  assert.ok(!(/geyser/i.test(ex) && geyser(b1) === geyser(c)), `geyser ${geyser(b1)} mm² in conduit and ${geyser(c)} mm² clipped`);
});

test('MA-09 (Low): C6 "one inverter AC, fans, lights and a fridge → 3.5 kVA is the usual size"; with the common non-inverter fridge it is 5 kVA', () => {
  const r = C.generator_size({ loads: [{ id: 'ac-split-1-5ton-inverter' }, { id: 'refrigerator-non-inverter' }, { id: 'custom', watts: 300 }] }, data);
  assert.ok(!(/a 3\.5 kVA generator is the usual size/.test(text('C6')) && r.standard_kva !== 3.5), `engine ${r.standard_kva} kVA`);
});

test('MA-10 (Low): C5 "pumps larger than those listed need a generator above 30 kVA"; 6 to 8.5 hp fit 25 or 30 kVA', () => {
  const r = C.generator_for_pump({ hp: 6 }, data);
  assert.ok(!(/above 30 kVA/.test(text('C5')) && r.standard_kva <= 30), `6 hp -> ${r.standard_kva} kVA`);
});

test('MA-11 (Low): B5 says an online UPS gives "closer to one W per VA" while A9 says online UPS are rated 0.8', () => {
  assert.ok(!(/closer to one W per VA/.test(text('B5')) && /online UPS or inverter rated at 0\.8/.test(text('A9'))));
});

test('MA-12 (Low, WL-29 residual): a too-large watts in a list row loses or mis-numbers the row in the message', () => {
  const g = C.generator_size({ loads: [{ id: 'ceiling-fan-ac' }, { id: 'custom', watts: 1e13 }] }, data);
  assert.match(errorMessage(g.error), /^Appliance 2:/, `C1-C4: code ${g.error} -> "${errorMessage(g.error)}"`);
  const n = C.circuit_schedule({ loads: [{ id: 'custom', watts: 1e13, length: 10 }] }, data);
  assert.match(errorMessage(n.error), /^Appliance 1:/, `N18: code ${n.error} -> "${errorMessage(n.error)}"`);
});

test('MA-13 (Low): battery_bank returns 0 batteries for a positive load (absolute 1e-9 in ceilSafe)', () => {
  const r = C.battery_bank({ load_w: 0.001, hours: 0.001, volts: 24, battery_ah: 200, battery_v: 12 }, data);
  assert.ok(r.batteries >= 2, `batteries ${r.batteries}, strings ${r.strings}`);
});

test('MA-14 (Low): the same 400 W lighting load gets 2.5 mm² on W2 but 1 mm² on W3 (W2 minimum follows "circuit", W3 follows load type)', () => {
  const w2 = C.wire_size({ watts: 400, load_type: 'lighting', length_m: 5 }, data); const w3 = C.breaker_size({ watts: 400, load_type: 'lighting' }, data);
  assert.equal(w2.area_mm2, w3.area_mm2);
});

test('MA-15 (Low): cable_rating (registered calculator) publishes 30 °C ratings, undeprated, against formulas.md W "derated everywhere"', () => {
  const r = C.cable_rating({ area_mm2: 2.5 }, data);
  assert.ok(r.max_w_b1 <= 24 * 0.79 * 230 * 0.8 + 1e-6, `max_w_b1 ${r.max_w_b1} W uses ${r.ampacity_b1_a} A at 30 °C`);
});

test('MA-16 (Low): units (E6 converter) hours error says "for at least one appliance"', () => {
  const r = C.units({ watts: 100 }, data);
  assert.ok(!/appliance/.test(errorMessage(r.error)), errorMessage(r.error));
});

test('MD-02: D8 FAQ "Is a 5 kW solar system enough?" must not answer "Yes" when the engine needs a bigger inverter (D13 checked too)', () => {
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

test('MD-04 (WL-128, [ENGINEER] default): D3 shows the weakest month and its shortfall; sizing stays on the yearly yield', () => {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const { calc, inputs, content: c } = pageInputs('D3');
  assert.equal(calc, 'solar_offgrid');
  const r = C[calc](inputs, data);
  const pv = data.cities[inputs.city].pvout_month;
  const day = pv.map((p, m) => (r.installed_kw * p) / DAYS[m]);
  const worst = Math.min(...day);
  assert.ok(Math.abs(r.worst_month_kwh - worst) < 1e-9);
  assert.ok(Math.abs(r.worst_short_kwh - Math.max(0, r.array_kwh - worst)) < 1e-9, 'Lahore January makes about 5.2 kWh a day against 6.6 needed');
  assert.equal(r.installed_kw, C.solar_from_loads({ ...inputs, off_grid: true }, data).installed_kw, 'sizing unchanged until the engineer decides');
  for (const k of ['worst_month', 'worst_month_kwh', 'worst_short_pct']) assert.ok(c.outputs.some((o) => o.key === k), `D3 shows ${k}`);
  const t = text('D3');
  assert.match(t, new RegExp(`in ${r.worst_month} the same panels make about`));
});
test('MD-05: hours a day above 24 are rejected (D5 hours, D15 hours, night_hours, D6 PSH), as E5 and the loads rows do', () => {
  assert.equal(C.ac_units({ ac: 'ac-split-1-5ton-inverter', hours: 25 }, data).error, 'hours_too_large'); // reference behaviour
  assert.equal(C.solar_for_ac({ ac: 'ac-split-1-5ton-inverter', hours: 25, city: 'lahore' }, data).ok, false, 'D5 hours 25');
  assert.equal(C.solar_for_pump({ hp: 10, hours: 25, city: 'multan' }, data).ok, false, 'D15 hours 25');
  assert.equal(C.solar_for_ac({ ac: 'ac-split-1-5ton-inverter', hours: 8, night_hours: 25, city: 'lahore' }, data).ok, false, 'night_hours 25');
  assert.equal(C.solar_from_loads({ loads: [{ id: 'led-bulb', hours: 6 }], night_hours: 30, off_grid: true, city: 'lahore' }, data).ok, false, 'D3 night_hours 30');
  assert.equal(C.panel_for_12v({ ah: 100, volts: 12, psh: 25 }, data).ok, false, 'D6 psh 25');
});

test('MD-06: N6 sky label for a long-term-average sky does not depend on the PR typed in', () => {
  // ΣGTI = Lahore PSH × 1000 = 5,100 Wh/m²: the same sun as the typical day.
  const gti = [0, 0, 0, 0, 0, 0, 100, 300, 500, 650, 750, 800, 750, 600, 400, 200, 50, 0, 0, 0, 0, 0, 0, 0];
  const a = C.solar_forecast({ city: 'lahore', kwp: 5, pr: 0.78, gti_wm2: gti }, data);
  const b = C.solar_forecast({ city: 'lahore', kwp: 5, pr: 0.5, gti_wm2: gti }, data);
  assert.equal(b.sky, a.sky, `PR 0.78 -> ${a.sky} ${a.pct_of_typical.toFixed(1)}%, PR 0.5 -> ${b.sky} ${b.pct_of_typical.toFixed(1)}%`);
  const t = C.solar_forecast({ city: 'lahore', kwp: 5, pr: 0.5 }, data);
  assert.ok(Math.abs(t.units - 5 * 5.1 * 0.5) < 1e-9 || Math.abs(b.pct_of_typical - 100) < 2, `typical day ignores PR: ${t.units} units at PR 0.5`);
});

test('MD-07: D6 above the largest standard panel still shows a panel to buy (or a notice)', () => {
  const r = C.panel_for_12v({ ah: 200, volts: 24, psh: 5 }, data); // needs 724 W > 585 W
  const shown = J('content/pages/D6.json').outputs.map((o) => o.key).filter((k) => r[k] !== undefined);
  assert.ok(shown.includes('standard_panel_w') || shown.includes('panels_of_largest') || noticeCode(r) !== '', `only ${shown.join(', ')} shown, no notice`);
});

test('MD-08: D7 and N17 agree on the panel count for twelve equal bills (360 vs 365 days, yield rounded to 0.1)', () => {
  // Karachi 330 units every month: D7 330/30/4.6 = 2.391 kW -> 5 panels; N17 3,960/1,698 = 2.332 kW -> 4 panels.
  const d7 = C.solar_size({ monthly_units: 330, city: 'karachi' }, data);
  const n17 = C.solar_seasonal({ city: 'karachi', ...Object.fromEntries(M.map((k) => [k, 330])) }, data);
  assert.equal(d7.panels, n17.panels, `D7 ${d7.kw.toFixed(3)} kW / ${d7.panels} vs N17 ${n17.kw_annual.toFixed(3)} kW / ${n17.panels}`);
});

test('MD-09 (WL-16 leftover): minimum sizes printed rounded UP on D6 (panel W), D15 (drive kW), D16 (amps)', async () => {
  
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
