// Edge-case fuzz for every calculator in scope: never throws, never NaN/Infinity/negative, every error has a real message.
import { data, C, errorMessage } from './h.mjs';
const GENERIC = 'Something went wrong with this calculation. Please check your inputs.';
const NASTY = [undefined, null, '', ' ', 0, -0, -1, '-1', 1e-300, 1e-12, 0.04, 0.05, 1, 0.5, 1.000001, 12, '12', ' 12 ', '12.', '.5', '1,500', '1,50,000', '1,5', '15,00', '1e3', 'abc', '0x10', 'Infinity', NaN, Infinity, -Infinity, 1e12, 1e12 + 1, 1e13, 1e308, true, false, [], {}, [5], '18%', '١٢'];
const SCOPE = {
  watts_to_amps: ['watts', 'volts', 'pf', 'mode'], amps_to_watts: ['amps', 'volts', 'pf', 'mode'], kw_to_amps: ['kw', 'volts', 'pf', 'mode'],
  amps_to_kw: ['amps', 'kw', 'volts', 'pf', 'mode', 'direction'], kva_to_kw: ['kva', 'pf'], kw_to_kva: ['kw', 'pf'], va_to_watts: ['va', 'pf'], watts_to_va: ['watts', 'pf'],
  ah_to_wh: ['ah', 'volts'], wh_to_ah: ['wh', 'volts'], kwh_to_ah: ['kwh', 'volts'], hp_to_kw: ['hp', 'motor_eff'], units: ['watts', 'hours', 'days', 'amps', 'ah', 'volts', 'tariff', 'input'],
  battery_runtime: ['ah', 'volts', 'load_w', 'dod', 'inverter_eff', 'chemistry'], battery_bank: ['load_w', 'hours', 'volts', 'battery_ah', 'battery_v', 'dod', 'inverter_eff', 'chemistry'],
  loadshedding: ['ah', 'charge_a', 'grid_hours_between', 'dod', 'charge_eff', 'chemistry'], ups_capacity: ['va', 'pf', 'load_w', 'surge_w', 'surge_rating_w'], ups_backup: ['va', 'pf', 'load_w', 'ah', 'volts', 'dod', 'inverter_eff', 'surge_w', 'surge_rating_w'],
  series_parallel: ['n_series', 'n_parallel', 'v', 'ah'],
  generator_for_pump: ['hp', 'motor_eff', 'start_factor', 'other_w', 'other_start_w', 'margin', 'pf'], generator_for_ac: ['ac', 'other_w', 'other_start_w', 'margin', 'pf'],
  generator_capacity: ['kva', 'margin', 'pf', 'appliance'], sanctioned_load: ['connected_kw', 'diversity', 'largest_start_kw'], load_check: ['total_w', 'sanctioned_kw', 'volts', 'pf'],
  generator_fuel: ['fuel', 'kva', 'pf', 'load_w', 'hours', 'days', 'price'],
  voltage_drop: ['mode', 'volts', 'pf', 'length_m', 'area_mm2', 'conductor', 'rho', 'circuit', 'amps', 'watts', 'method', 'ambient_c', 'circuits'],
  pk_cable_area: ['strands', 'strand_in'], wire_size: ['mode', 'volts', 'pf', 'length_m', 'method', 'circuit', 'rho', 'watts', 'amps', 'appliance', 'load_type', 'margin', 'ambient_c', 'circuits'],
  breaker_size: ['mode', 'volts', 'pf', 'watts', 'amps', 'appliance', 'load_type', 'margin', 'ambient_c', 'circuits', 'method'], cable_rating: ['area_mm2', 'volts', 'pf'],
};
const BASE = {
  watts_to_amps: { watts: 1500 }, amps_to_watts: { amps: 16 }, kw_to_amps: { kw: 5 }, amps_to_kw: { amps: 32 }, kva_to_kw: { kva: 5 }, kw_to_kva: { kw: 4 }, va_to_watts: { va: 1000 }, watts_to_va: { watts: 600 },
  ah_to_wh: { ah: 200, volts: 12 }, wh_to_ah: { wh: 2400, volts: 12 }, kwh_to_ah: { kwh: 5, volts: 51.2 }, hp_to_kw: { hp: 1 }, units: { watts: 1000, hours: 5 },
  battery_runtime: { ah: 200, volts: 12, load_w: 300 }, battery_bank: { load_w: 500, hours: 4, volts: 24, battery_ah: 200, battery_v: 12 }, loadshedding: { ah: 200, charge_a: 15, grid_hours_between: 4 },
  ups_capacity: { va: 1000, load_w: 300 }, ups_backup: { va: 1000, load_w: 300, ah: 150, volts: 12 }, series_parallel: { n_series: 2, n_parallel: 2, v: 12, ah: 200 },
  generator_for_pump: { hp: 1 }, generator_for_ac: { ac: 'ac-split-1-5ton-inverter', other_w: 500 }, generator_capacity: { kva: 5 }, sanctioned_load: { connected_kw: 6 }, load_check: { total_w: 3000, sanctioned_kw: 4 },
  generator_fuel: { kva: 5, load_w: 2000, hours: 4 }, voltage_drop: { watts: 3000, length_m: 30, area_mm2: 2.5 }, pk_cable_area: { strands: 7, strand_in: 0.029 },
  wire_size: { watts: 2000, length_m: 20 }, breaker_size: { watts: 2000 }, cable_rating: { area_mm2: 2.5 },
  generator_size: { loads: [{ id: 'ceiling-fan-ac', qty: 4 }] }, circuit_schedule: { loads: [{ id: 'custom', watts: 2000, length: 15 }] }, inverter_size: { loads: [{ id: 'ceiling-fan-ac', qty: 4 }] },
};
const codes = new Map();
const problems = [];
let runs = 0;
function check(calc, inp) {
  let r;
  runs++;
  try { r = C[calc](inp, data); } catch (e) { problems.push(`${calc} THREW ${e.message} for ${JSON.stringify(inp)}`); return; }
  if (r.ok) {
    const walk = (v, p) => {
      if (typeof v === 'number') { if (!Number.isFinite(v)) problems.push(`${calc} non-finite ${p} ${JSON.stringify(inp)}`); if (v < 0) problems.push(`${calc} negative ${p}=${v} ${JSON.stringify(inp)}`); }
      else if (Array.isArray(v)) v.forEach((x, k) => walk(x, `${p}[${k}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
      else if (v === '' ) problems.push(`${calc} blank string ${p}`);
    };
    walk(r, '');
  } else {
    const msg = errorMessage(r.error);
    if (!codes.has(r.error)) codes.set(r.error, { calc, msg, inp });
    if (msg === GENERIC) problems.push(`${calc} generic message for code ${r.error} (input ${JSON.stringify(inp)})`);
  }
}
for (const [calc, keys] of Object.entries(SCOPE)) {
  for (const key of keys) for (const v of NASTY) check(calc, { ...BASE[calc], [key]: v });
  // pairs of nasty values
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) for (const v of NASTY) for (const w of [0, '', 'abc', 1e12, 1e-300]) check(calc, { ...BASE[calc], [keys[a]]: v, [keys[b]]: w });
}
// list-based calculators
const ROWV = [undefined, null, '', 0, -1, 'abc', 1e13, 1.5, 25, '1,500', 1e-300];
for (const calc of ['generator_size', 'inverter_size', 'generator_capacity', 'circuit_schedule']) {
  for (const loads of [undefined, null, [], {}, 'x', [null], [{}], [{ id: 'nope' }], [{ id: 'custom' }], [{ id: 5 }], [{ id: 'ceiling-fan-ac', qty: 0 }]]) check(calc, { ...BASE[calc], loads });
  for (const col of ['watts', 'start', 'qty', 'hours', 'run', 'length']) for (const v of ROWV) {
    check(calc, { ...BASE[calc], loads: [{ id: 'custom', watts: 500, length: 10, [col]: v }] });
    check(calc, { ...BASE[calc], loads: [{ id: 'ac-split-2ton-non-inverter', length: 10 }, { id: 'water-motor-1hp', length: 10, [col]: v }] });
  }
  for (const k of ['method', 'ambient_c', 'circuits', 'volts', 'margin', 'pf', 'kva']) for (const v of NASTY) check(calc, { ...BASE[calc], [k]: v });
}
console.log('runs', runs, 'distinct error codes', codes.size);
for (const [c, o] of codes) console.log(`  ${c}  [${o.calc}]  -> ${o.msg}`);
console.log('PROBLEMS', problems.length);
const seen = new Set();
for (const p of problems) { const k = p.split(' for ')[0].split(' (input')[0].replace(/\{.*$/, ''); if (seen.has(k)) continue; seen.add(k); console.log('  ', p.slice(0, 300)); }
