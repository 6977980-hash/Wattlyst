const ROOT = new URL('../../../', import.meta.url).pathname;
// Audit Math A (2026-10-15): independent verification of conversions, battery, generator, fuel, wiring, N4, N11, N18.
// Run: node --test /tmp/claude-0/-home-user-wattlyst/10a88ae1-cea1-556c-b13a-8987bcd472f7/scratchpad/mathA/audit-math-a.test.js
// Tests named "DEFECT MA-xx" document a confirmed defect: they FAIL on the current code and pass once it is fixed.
// Every other test checks correct behaviour and passes today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from '../../../tests/load-data.js';
import { calculators as C } from '../../../engine/index.js';
import { errorMessage } from '../../../engine/messages.js';
import { fmt } from '../../../engine/format.js';
import * as R from './ref.mjs';

const apps = data.appliances;
const page = (id) => JSON.parse(readFileSync(`${ROOT}generated/pages/${id}.json`, 'utf8'));
const content = (id) => JSON.parse(readFileSync(`${ROOT}content/pages/${id}.json`, 'utf8'));
const text = (id) => JSON.stringify(page(id).content);
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const GENERIC = 'Something went wrong with this calculation. Please check your inputs.';

// ---------------------------------------------------------------- data integrity
test('cable data equals IEC 60364-5-52 B.52.4 / B.52.5 / B.52.14 / B.52.17 and PK n/d areas', () => {
  for (const c of data.cables.cables) for (const m of ['B1', 'C']) {
    assert.equal(c.ampacity_a[m], R.IEC[2][m][c.area_mm2], `2 loaded ${m} ${c.area_mm2}`);
    assert.equal(c.ampacity_3ph_a[m], R.IEC[3][m][c.area_mm2], `3 loaded ${m} ${c.area_mm2}`);
  }
  assert.deepEqual(data.cables.derating.ambient_factors, R.AMB);
  assert.deepEqual(data.cables.derating.grouping_factors, R.GRP);
  for (const p of data.cables.pk_sizes) {
    const mine = R.PK.find((x) => x.name === p.name).area;
    assert.ok(Math.abs(mine - p.area_mm2) < 0.006, `${p.name} ${mine}`);
    assert.equal([...R.SIZES].reverse().find((s) => s <= mine), p.rated_as_mm2);
  }
  assert.equal(data.defaults.rho_copper, R.RHO_CU);
  assert.equal(data.defaults.w_per_hp, 745.7);
  assert.deepEqual(data.defaults.standard_breaker_a, R.POLICY.breakers);
  assert.deepEqual(data.cables.mcb_curves.B.trip_min * 1 + data.cables.mcb_curves.C.trip_min + data.cables.mcb_curves.D.trip_min, 3 + 5 + 10);
});

test('generator fuel coefficients re-fit from the cited source points', () => {
  for (const ft of ['petrol', 'diesel']) {
    const r = R.fuel(5, 0, ft);
    assert.ok(Math.abs(r.slope - data.generator_fuel.fuels[ft].slope_l_per_kwh) < 0.01, ft);
    assert.ok(Math.abs(r.icpt - data.generator_fuel.fuels[ft].intercept_l_per_h_per_kw_rated) < 0.005, ft);
  }
});

// ---------------------------------------------------------------- spec cases vs physics
test('every numeric spec case for in-scope calculators agrees with the independent reference', () => {
  const cases = JSON.parse(readFileSync(ROOT + 'specs/calculator-test-cases.json', 'utf8'));
  const refs = {
    watts_to_amps: R.watts_to_amps, amps_to_watts: R.amps_to_watts, kw_to_amps: R.kw_to_amps, battery_runtime: R.runtime, battery_bank: R.bank,
    wire_size: (i) => R.wire(i, apps), breaker_size: (i) => R.mcb(i, apps), voltage_drop: R.vdrop,
  };
  let n = 0;
  for (const c of cases) {
    const f = refs[c.calc];
    if (!f || 'error' in c.expected || Object.values(c.inputs).some((v) => typeof v === 'string' && v.includes(','))) continue;
    const r = f(c.inputs);
    for (const [k, want] of Object.entries(c.expected)) if (k in r && typeof want === 'number') { n++; assert.ok(Math.abs(r[k] - want) <= c.tolerance + 1e-6, `${c.calc} ${c.name} ${k}: ref ${r[k]} spec ${want}`); }
  }
  assert.ok(n > 100);
});

// ---------------------------------------------------------------- independent differential tests
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const any = (a) => a[Math.floor(rnd() * a.length)];

test('A: watts/amps/kW conversions equal P = k·V·I·PF for DC, 1-phase, 3-phase (2,000 random cases) and round-trip', () => {
  for (let k = 0; k < 2000; k++) {
    const mode = any(['dc', 'ac1', 'ac3']);
    const i = { mode, volts: mode === 'dc' ? any([12, 24, 48]) : any([undefined, 230, 400, 120]), pf: mode === 'dc' ? undefined : any([undefined, 0.8, 1]), watts: Math.round(rnd() * 20000), amps: Math.round(rnd() * 600) / 10, kw: Math.round(rnd() * 300) / 10 };
    assert.ok(close(C.watts_to_amps(i, data).amps, R.watts_to_amps(i).amps));
    assert.ok(close(C.amps_to_watts(i, data).watts, R.amps_to_watts(i).watts));
    assert.ok(close(C.kw_to_amps(i, data).amps, R.kw_to_amps(i).amps));
    const a = C.watts_to_amps(i, data).amps;
    assert.ok(close(C.amps_to_watts({ ...i, amps: a }, data).watts, i.watts));
  }
  assert.ok(close(C.kva_to_kw({ kva: 5 }, data).kw, 4));
  assert.ok(close(C.kw_to_kva({ kw: C.kva_to_kw({ kva: 7.5, pf: 0.85 }, data).kw, pf: 0.85 }, data).kva, 7.5));
  assert.ok(close(C.watts_to_va({ watts: C.va_to_watts({ va: 1000 }, data).watts }, data).va, 1000));
  assert.ok(close(C.wh_to_ah({ wh: C.ah_to_wh({ ah: 200, volts: 12 }, data).wh, volts: 12 }, data).ah, 200));
  assert.ok(close(C.hp_to_kw({ hp: 1 }, data).input_kw, 0.932125));
});

test('A3 = A1 in DC at 12 V, A4 = A1 at 230 V (same engine, same inputs)', () => {
  assert.equal(C.watts_to_amps({ ...content('A3').fixed_inputs, watts: 100, volts: 12 }, data).amps, C.watts_to_amps({ mode: 'dc', watts: 100, volts: 12 }, data).amps);
  assert.ok(close(C.watts_to_amps({ ...content('A3').fixed_inputs, watts: 100, volts: 12 }, data).amps, 100 / 12));
  assert.ok(close(C.watts_to_amps({ watts: 1500, volts: 230 }, data).amps, 1500 / (230 * 0.8)));
});

test('B: runtime = Ah·V·DoD·η/P and bank = P·t/(V·DoD·η), batteries = ceil(Ah/Ah_b)·V/V_b (2,000 random cases)', () => {
  for (let k = 0; k < 2000; k++) {
    const i = { chemistry: any(['tubular', 'lifepo4', 'agm']), ah: any([100, 150, 200]), volts: any([12, 24, 48, 51.2]), load_w: 1 + Math.round(rnd() * 3000), inverter_eff: any([undefined, 1, 0.9]), hours: any([1, 3.5, 8]), battery_ah: any([100, 200]), battery_v: 12 };
    assert.ok(close(C.battery_runtime(i, data).hours, R.runtime(i).hours));
    const e = C.battery_bank(i, data); const r = R.bank(i);
    if (Math.abs(r.series - Math.round(r.series)) > 1e-9) { assert.equal(e.error, 'bank_voltage_not_multiple_of_battery'); continue; }
    assert.ok(close(e.ah_required, r.ah_required)); assert.equal(e.batteries, r.batteries);
  }
  assert.equal(C.ups_backup({ va: 1000, load_w: 601, ah: 150, volts: 12 }, data).error, 'load_exceeds_ups_rating');
  assert.equal(C.ups_backup({ va: 1000, load_w: 600, ah: 150, volts: 12 }, data).ok, true); // boundary: VA × PF exactly
  assert.ok(close(C.series_parallel({ n_series: 4, n_parallel: 2, v: 12, ah: 200 }, data).kwh, 19.2));
  assert.equal(C.series_parallel({ n_series: 1.5, n_parallel: 1, v: 12, ah: 200 }, data).error, 'n_series_must_be_whole');
});

test('C: generator kVA = max(1.25·P_run, P_run + largest step)/0.8, next standard size (2,000 random lists); C6 = C1', () => {
  const ids = Object.keys(apps);
  for (let k = 0; k < 2000; k++) {
    const loads = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ id: any(ids), qty: any([1, 2]) }));
    const e = C.generator_size({ loads }, data); const s = R.sum(R.rows(loads, apps)); const g = R.gen(s.running_w, s.peak_w);
    assert.ok(close(e.recommended_kva, g.recommended_kva)); assert.equal(e.standard_kva, g.standard_kva);
  }
  for (const ac of ids.filter((x) => /^ac-/.test(x))) {
    const c6 = C.generator_for_ac({ ac, other_w: 0 }, data); const c1 = C.generator_size({ loads: [{ id: ac }] }, data);
    assert.equal(c6.standard_kva, c1.standard_kva); assert.ok(close(c6.recommended_kva, c1.recommended_kva));
  }
  // boundary: exactly a standard size stays on it (1 ton window AC: 4,000 W / 0.8 = 5.0 kVA)
  assert.equal(C.generator_size({ loads: [{ id: 'ac-window-1ton' }] }, data).standard_kva, 5);
  assert.equal(C.generator_size({ loads: [{ id: 'custom', watts: 24001 }] }, data).above_standard_sizes, true);
  for (const hp of [0.5, 1, 2, 3, 5]) assert.equal(C.generator_for_pump({ hp }, data).standard_kva, R.pump(hp).standard_kva);
  for (const kva of [2.5, 3, 5, 7, 10]) for (const id of ['ac-split-1-5ton-inverter', 'refrigerator-non-inverter', 'ac-split-1-5ton-non-inverter'])
    assert.equal(C.generator_capacity({ kva, appliance: id }, data).appliance_count, R.capacityCount(kva, apps[id].running_w, apps[id].starting_w));
});

test('C8: L/h = 0.1·kW_rated + 0.48·kW_load (petrol), 0.05/0.25 (diesel); page default 1.36 L/h, Rs 542', () => {
  const r = C.generator_fuel({ kva: 5, load_w: 2000, hours: 4 }, data);
  assert.ok(close(r.l_per_h, 0.1 * 4 + 0.48 * 2)); assert.ok(close(r.rs_per_h, 1.36 * 398.3));
  assert.ok(close(C.generator_fuel({ kva: 5, load_w: 2000, fuel: 'diesel' }, data).l_per_h, 0.7));
  assert.equal(C.generator_fuel({ kva: 5, load_w: 4001 }, data).error, 'load_above_generator');
  assert.equal(C.generator_fuel({ kva: 5, load_w: 4000 }, data).ok, true);
});

test('W: wire size, MCB, drop equal the IEC procedure (10,000 random cases); Ib ≤ In ≤ Iz and drop ≤ limit always', () => {
  const types = ['sockets', 'lighting', 'resistive', 'motor', 'compressor', 'inverter_compressor', 'electronic', 'high_inrush'];
  for (let k = 0; k < 10000; k++) {
    const mode = any(['ac1', 'ac3', 'dc']);
    const i = { mode, volts: mode === 'dc' ? any([12, 48, 420]) : undefined, length_m: any([3, 15, 30, 80]), method: any(['B1', 'C']), ambient_c: any([undefined, 30, 46, 55]), circuits: any([undefined, 1, 3, 10]), circuit: any(['other', 'lighting']), watts: 10 + Math.round(rnd() * 15000), load_type: any(types) };
    const e = C.wire_size(i, data); const r = R.wire(i, apps);
    if (r.error) { assert.equal(e.error, r.error, JSON.stringify(i)); continue; }
    assert.equal(e.area_mm2, r.area_mm2, JSON.stringify(i)); assert.equal(e.breaker_a, r.breaker_a); assert.equal(e.pk_size, r.pk_size); assert.ok(close(e.drop_pct, r.drop_pct));
    assert.ok(e.ib_a <= e.breaker_a + 1e-9 && e.breaker_a <= e.ampacity_a + 1e-9 && e.ib_a * 1.25 <= e.ampacity_a + 1e-9 && e.drop_pct <= e.limit_pct + 1e-9);
    if (mode !== 'dc') { const m = C.breaker_size(i, data); const rm = R.mcb(i, apps); if (!rm.error) { assert.equal(m.breaker_a, rm.breaker_a); assert.equal(m.curve, rm.curve); assert.equal(m.breaker_a, e.breaker_a, 'W2 and W3 print the same MCB'); } }
  }
});

test('W5: ΔV = 2·L·I·ρ/A (DC, 1-phase), √3·L·I·ρ/A (3-phase); current check against derated rating', () => {
  const r = C.voltage_drop({ watts: 3000, length_m: 30, area_mm2: 2.5 }, data);
  assert.ok(close(r.drop_v, (2 * 30 * (3000 / 184) * 0.0225) / 2.5));
  assert.ok(close(C.voltage_drop({ mode: 'ac3', amps: 27.1, length_m: 50, area_mm2: 6 }, data).drop_v, (Math.sqrt(3) * 50 * 27.1 * 0.0225) / 6));
  assert.ok(close(C.voltage_drop({ mode: 'dc', volts: 12, amps: 20, length_m: 5, area_mm2: 6 }, data).drop_pct, 6.25));
  assert.equal(C.voltage_drop({ amps: 19, length_m: 1, area_mm2: 2.5 }, data).over_cable_rating, true); // 24 × 0.79 = 18.96 A
  assert.equal(C.voltage_drop({ amps: 18.9, length_m: 1, area_mm2: 2.98 }, data).over_cable_rating, false); // 7/29 rated as 2.5
  assert.equal(C.voltage_drop({ amps: 10, length_m: 2000, area_mm2: 1 }, data).error, 'cable_far_too_small_for_load');
});

test('N18 rows equal W2/W1 for the same circuit (2,000 random rows)', () => {
  const ids = Object.keys(apps);
  for (let k = 0; k < 2000; k++) {
    const id = any(['custom', ...ids]); const row = { id, length: any([5, 20, 60]), qty: any([1, 2]) };
    if (id === 'custom') row.watts = 50 + Math.round(rnd() * 4000);
    const e = C.circuit_schedule({ loads: [row] }, data); const a = apps[id]; const lt = a?.load_type ?? 'sockets'; const w = row.watts ?? a.running_w;
    const dw = lt === 'inverter_compressor' ? (a.starting_w * w * row.qty) / a.running_w : w * row.qty;
    const r = R.wire({ watts: dw, load_type: lt, circuit: lt === 'lighting' ? 'lighting' : 'other', length_m: row.length }, apps);
    if (r.error) { assert.equal(e.ok, false); continue; }
    assert.equal(e.rows[0].area_mm2, r.area_mm2); assert.equal(e.rows[0].breaker_a, r.breaker_a);
  }
});

test('N4: recommended = max(1, ceil(connected × 0.6)); ToU flag at ≥ 5 kW; boundaries', () => {
  assert.equal(C.sanctioned_load({ connected_kw: 6 }, data).recommended_kw, 4);
  assert.equal(C.sanctioned_load({ connected_kw: 5 / 0.6 }, data).recommended_kw, 5); // 5.0000 kW demand stays 5
  assert.equal(C.sanctioned_load({ connected_kw: 5 / 0.6 }, data).tou_warning, true);
  assert.equal(C.sanctioned_load({ connected_kw: 6.6 }, data).tou_warning, false); // 3.96 -> 4
  assert.equal(C.sanctioned_load({ connected_kw: 0.1 }, data).recommended_kw, 1);
});

// ---------------------------------------------------------------- every page default, worked example and table row
test('all 408 defaults / worked examples / table rows of the 31 in-scope pages match the reference', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [new URL('./pages.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /mismatches 0/);
});

// ---------------------------------------------------------------- robustness
test('no in-scope calculator throws, returns NaN/Infinity/negative, or an error without a real message (fuzz)', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [new URL('./fuzz.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /PROBLEMS 0/);
});

test('monotonicity and idempotence: more load / longer run / hotter air never gives a smaller wire, MCB or generator', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [new URL('./mono.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /violations 0/);
});

test('input readers: commas, decimals, junk, caps (core.js num/pos/frac/pick)', () => {
  const w = (v) => C.watts_to_amps({ watts: v }, data);
  assert.ok(close(w('1,500').amps, w(1500).amps)); assert.ok(close(w('1,50,000').amps, w(150000).amps)); assert.ok(close(w(' 12. ').amps, w(12).amps));
  for (const bad of ['1,5', '15,00', 'abc', '1e3', '0x10', 'Infinity', NaN, Infinity, true, [5], {}]) assert.equal(w(bad).error, 'watts_invalid', String(bad));
  assert.equal(w(1e12 + 1).error, 'watts_too_large'); assert.equal(w(-1).error, 'watts_too_small');
  assert.equal(C.watts_to_amps({ watts: 100, pf: 0.04 }, data).error, 'pf_too_small');
  assert.equal(C.watts_to_amps({ watts: 100, pf: 1.01 }, data).error, 'pf_too_large');
  assert.equal(C.watts_to_amps({ watts: 100, volts: 0.9 }, data).error, 'volts_too_small');
  assert.equal(C.watts_to_amps({ watts: 100, mode: 'dc' }, data).error, 'volts_required_dc');
  assert.equal(C.watts_to_amps({ watts: 100, mode: 'AC1' }, data).error, 'mode_invalid');
});

test('format.js: up* rounds minimum sizes up, hm floors runtimes', () => {
  assert.equal(fmt(196.0784, 'up'), '197'); assert.equal(fmt(196.0000000001, 'up'), '196'); assert.equal(fmt(3.2546875, 'up2'), '3.26');
  assert.equal(fmt(3.4, 'hm'), '3 h 24 min'); assert.equal(fmt(1.9999, 'hm'), '1 h 59 min'); assert.equal(fmt(1e-6, 'hm'), '< 1 min'); assert.equal(fmt(-0, '2'), '0');
});

// ================================================================ DEFECTS (fail today)
test('DEFECT MA-01 (Medium): C5 says a 1 hp pump generator "also carries a few lights and fans", but any running light pushes it up a size', () => {
  const alone = C.generator_for_pump({ hp: 1 }, data).standard_kva;
  const withLights = C.generator_for_pump({ hp: 1, other_w: 40 }, data).standard_kva; // one fan or a few LED bulbs
  const claims = /also carries a few lights and fans|rarely changes the size/.test(text('C5'));
  assert.ok(!(claims && withLights > alone), `C5 text claims the size holds, engine: ${alone} kVA alone, ${withLights} kVA with 40 W`);
});

test('DEFECT MA-02 (Medium): UPS/battery runtime ignores the inverter no-load draw (data says 30 W), so low-load backup is overstated up to 3.5x', () => {
  const idle = data.appliances['ups-idle'].running_w; // 30 W
  const r = C.ups_backup({ va: 1000, ah: 150, volts: 12, load_w: 10 }, data);
  const expected = (150 * 12 * 0.5) / (10 / 0.85 + idle); // 21.55 h
  assert.ok(r.hours <= expected * 1.1, `engine ${r.hours} h, expected about ${expected.toFixed(2)} h with the idle draw`);
});

test('DEFECT MA-03 (Medium): DC battery-to-inverter design current omits inverter efficiency; W2 example 63 A device is below the real 69 A', () => {
  const ex = C.wire_size({ mode: 'dc', volts: 48, watts: 3000, length_m: 3 }, data); // W2 example 4
  const realIb = 3000 / (data.defaults.inverter_eff_hybrid * 48); // 69.4 A at nominal 48 V
  assert.ok(ex.breaker_a >= realIb && ex.ampacity_a >= realIb * 1.25, `breaker ${ex.breaker_a} A, cable ${ex.ampacity_a.toFixed(1)} A vs battery current ${realIb.toFixed(1)} A`);
});

test('DEFECT MA-04 (Low): A10 says 2.4 kWh runs a 1,000 W inverter "well under an hour"; the engine (B1/B3) gives 1 h 1 min', () => {
  const h = C.battery_runtime({ ah: 200, volts: 12, load_w: 1000 }, data).hours;
  assert.ok(!(/well under an hour/.test(text('A10')) && h >= 1), `engine ${fmt(h, 'hm')}`);
});

test('DEFECT MA-05 (Low, WL-16 residual): minimum sizes printed rounded to nearest on B4 (kWh) and C1/C3 (kVA)', () => {
  const spec = (id, key) => content(id).outputs.find((o) => o.key === key).spec;
  assert.equal(spec('B4', 'kwh_required'), 'up1', 'B4 prints 4.7 kWh for 4.706 kWh needed');
  assert.equal(spec('C1', 'recommended_kva'), 'up2', 'C1 prints 3.25 kVA for 3.2547 kVA needed (custom 2,083 W)');
  assert.equal(spec('C3', 'recommended_kva'), 'up2');
});

test('DEFECT MA-06 (Low): A4 gives an inverter AC PF 0.8 and running watts and says "Use the running amps for the cable"; W1/W3/E4/N18 use 1,900 W at PF 0.9', () => {
  const t = text('A4');
  assert.ok(!/Use the running amps for the cable/.test(t), 'A4 tells users to size the cable on running amps (7.88 A); W1 designs on 9.18 A');
});

test('DEFECT MA-07 (Low): W4 FAQ says the page "does not check the current rating", but the engine flags over_cable_rating and the page shows that warning', () => {
  const r = C.voltage_drop({ ...content('W4').fixed_inputs, amps: 30, volts: 420, length_m: 25, area_mm2: 4, circuit: 'lighting' }, data);
  assert.ok(!(r.over_cable_rating === true && /does not check the current rating/i.test(text('W4'))));
});

test('DEFECT MA-08 (Low): N18 "clipped on the surface" example names the geyser as the circuit that changes; it is the 2 ton AC', () => {
  const loads = content('N18').fields.find((f) => f.name === 'loads').default;
  const b1 = C.circuit_schedule({ loads }, data); const c = C.circuit_schedule({ loads, method: 'C' }, data);
  const geyser = (r) => r.rows.find((x) => /geyser/i.test(x.name)).area_mm2;
  const ex = page('N18').content.examples.find((e) => /clipped on the surface/.test(e.title)).text;
  assert.ok(!(/geyser/i.test(ex) && geyser(b1) === geyser(c)), `geyser ${geyser(b1)} mm² in conduit and ${geyser(c)} mm² clipped`);
});

test('DEFECT MA-09 (Low): C6 "one inverter AC, fans, lights and a fridge → 3.5 kVA is the usual size"; with the common non-inverter fridge it is 5 kVA', () => {
  const r = C.generator_size({ loads: [{ id: 'ac-split-1-5ton-inverter' }, { id: 'refrigerator-non-inverter' }, { id: 'custom', watts: 300 }] }, data);
  assert.ok(!(/a 3\.5 kVA generator is the usual size/.test(text('C6')) && r.standard_kva !== 3.5), `engine ${r.standard_kva} kVA`);
});

test('DEFECT MA-10 (Low): C5 "pumps larger than those listed need a generator above 30 kVA"; 6 to 8.5 hp fit 25 or 30 kVA', () => {
  const r = C.generator_for_pump({ hp: 6 }, data);
  assert.ok(!(/above 30 kVA/.test(text('C5')) && r.standard_kva <= 30), `6 hp -> ${r.standard_kva} kVA`);
});

test('DEFECT MA-11 (Low): B5 says an online UPS gives "closer to one W per VA" while A9 says online UPS are rated 0.8', () => {
  assert.ok(!(/closer to one W per VA/.test(text('B5')) && /online UPS or inverter rated at 0\.8/.test(text('A9'))));
});

test('DEFECT MA-12 (Low, WL-29 residual): a too-large watts in a list row loses or mis-numbers the row in the message', () => {
  const g = C.generator_size({ loads: [{ id: 'ceiling-fan-ac' }, { id: 'custom', watts: 1e13 }] }, data);
  assert.match(errorMessage(g.error), /^Appliance 2:/, `C1-C4: code ${g.error} -> "${errorMessage(g.error)}"`);
  const n = C.circuit_schedule({ loads: [{ id: 'custom', watts: 1e13, length: 10 }] }, data);
  assert.match(errorMessage(n.error), /^Appliance 1:/, `N18: code ${n.error} -> "${errorMessage(n.error)}"`);
});

test('DEFECT MA-13 (Low): battery_bank returns 0 batteries for a positive load (absolute 1e-9 in ceilSafe)', () => {
  const r = C.battery_bank({ load_w: 0.001, hours: 0.001, volts: 24, battery_ah: 200, battery_v: 12 }, data);
  assert.ok(r.batteries >= 2, `batteries ${r.batteries}, strings ${r.strings}`);
});

test('DEFECT MA-14 (Low): the same 400 W lighting load gets 2.5 mm² on W2 but 1 mm² on W3 (W2 minimum follows "circuit", W3 follows load type)', () => {
  const w2 = C.wire_size({ watts: 400, load_type: 'lighting', length_m: 5 }, data); const w3 = C.breaker_size({ watts: 400, load_type: 'lighting' }, data);
  assert.equal(w2.area_mm2, w3.area_mm2);
});

test('DEFECT MA-15 (Low): cable_rating (registered calculator) publishes 30 °C ratings, undeprated, against formulas.md W "derated everywhere"', () => {
  const r = C.cable_rating({ area_mm2: 2.5 }, data);
  assert.ok(r.max_w_b1 <= 24 * 0.79 * 230 * 0.8 + 1e-6, `max_w_b1 ${r.max_w_b1} W uses ${r.ampacity_b1_a} A at 30 °C`);
});

test('DEFECT MA-16 (Low): units (E6 converter) hours error says "for at least one appliance"', () => {
  const r = C.units({ watts: 100 }, data);
  assert.ok(!/appliance/.test(errorMessage(r.error)), errorMessage(r.error));
});

test('messages: every code from the fuzz run has its own text (no generic fallback)', () => {
  for (const code of ['volts_required_dc', 'load_above_standard_breakers', 'run_too_long_for_table', 'load_above_cable_table', 'ambient_out_of_range', 'circuits_out_of_range', 'cable_far_too_small_for_load', 'bank_voltage_not_multiple_of_battery', 'load_exceeds_ups_rating', 'surge_exceeds_ups_rating', 'load_above_generator', 'load_0_length_run_too_long_for_table', 'load_2_load_above_cable_table', 'n_series_must_be_whole', 'internal_non_finite'])
    assert.notEqual(errorMessage(code), GENERIC, code);
});
