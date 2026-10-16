const ROOT = new URL('../../../', import.meta.url).pathname;
// Re-run every default, worked example and table row of the in-scope pages through the independent reference.
import { readFileSync } from 'node:fs';
import { data, C } from './h.mjs';
import * as R from './ref.mjs';
const apps = data.appliances;
const IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'W1', 'W2', 'W3', 'W4', 'W5', 'N4', 'N11', 'N18'];
const resolve = (v) => {
  if (typeof v !== 'string' || !v.startsWith('@')) return v;
  const p = v.slice(1);
  if (p.startsWith('data.')) return p.slice(5).split('.').reduce((o, k) => o?.[k], data);
  return data.defaults[p];
};
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const ref = {
  watts_to_amps: (i) => R.watts_to_amps(i), amps_to_watts: (i) => R.amps_to_watts(i), kw_to_amps: (i) => R.kw_to_amps(i),
  amps_to_kw: (i) => (i.direction === 'kw_to_amps' ? R.kw_to_amps(i) : { kw: R.amps_to_watts(i).kw, va: R.amps_to_watts(i).va }),
  kva_to_kw: (i) => ({ kw: Number(i.kva) * Number(i.pf ?? 0.8) }), va_to_watts: (i) => ({ watts: Number(i.va) * Number(i.pf ?? 0.6) }),
  ah_to_wh: (i) => ({ wh: Number(i.ah) * Number(i.volts) }),
  battery_runtime: R.runtime, battery_bank: R.bank,
  ups_backup: (i) => ({ ...R.runtime(i), max_w: Number(i.va) * Number(i.pf ?? 0.6) }),
  generator_size: (i) => { const s = R.sum(R.rows(i.loads, apps)); return { ...s, ...R.gen(s.running_w, s.peak_w, Number(i.margin ?? 1.25), Number(i.pf ?? 0.8)) }; },
  generator_for_pump: (i) => R.pump(Number(i.hp), Number(i.other_w ?? 0), Number(i.other_start_w ?? i.other_w ?? 0), Number(i.motor_eff ?? 0.8), Number(i.start_factor ?? 3)),
  generator_for_ac: (i) => { const a = apps[i.ac]; const ow = Number(i.other_w ?? 0); const os = Number(i.other_start_w ?? ow); const run = a.running_w + ow; const peak = run + Math.max(a.starting_w - a.running_w, os - ow); return { running_w: run, peak_w: peak, ...R.gen(run, peak) }; },
  generator_capacity: (i) => { const out = {}; if (i.appliance) out.appliance_count = R.capacityCount(Number(i.kva), apps[i.appliance].running_w, apps[i.appliance].starting_w); if (i.loads?.length) { const s = R.sum(R.rows(i.loads, apps)); out.fits = s.running_w * 1.25 <= Number(i.kva) * 800 + 1e-9 && s.peak_w <= Number(i.kva) * 800 + 1e-9; } return out; },
  generator_fuel: (i) => { const f = data.generator_fuel.fuels[i.fuel ?? 'petrol']; return { l_per_h: f.intercept_l_per_h_per_kw_rated * Number(i.kva) * 0.8 + f.slope_l_per_kwh * Number(i.load_w) / 1000 }; },
  wire_size: (i) => R.wire(i, apps), breaker_size: (i) => R.mcb(i, apps), voltage_drop: R.vdrop,
  sanctioned_load: (i) => ({ recommended_kw: Math.max(1, Math.ceil(Number(i.connected_kw) * Number(i.diversity ?? 0.6) - 1e-9)) }),
  series_parallel: (i) => ({ kwh: (Number(i.n_series) * Number(i.v) * Number(i.n_parallel) * Number(i.ah)) / 1000 }),
  circuit_schedule: (i) => ({ rows: i.loads.map((row) => { const a = row.id && row.id !== 'custom' ? apps[row.id] : null; const lt = a?.load_type ?? 'sockets'; const w = row.watts ?? a.running_w; const q = row.qty ?? 1; const dw = lt === 'inverter_compressor' ? (a.starting_w * w * q) / a.running_w : w * q; return R.wire({ watts: dw, load_type: lt, circuit: lt === 'lighting' ? 'lighting' : 'other', length_m: row.length, method: i.method, ambient_c: i.ambient_c, circuits: i.circuits }, apps); }) }),
};
let checked = 0; const bad = [];
for (const id of IDS) {
  const p = JSON.parse(readFileSync(`${ROOT}content/pages/${id}.json`, 'utf8'));
  const defaults = Object.fromEntries((p.fields || []).filter((f) => f.default !== undefined && f.default !== null).map((f) => [f.name, resolve(f.default)]));
  const base = { ...(p.fixed_inputs || {}), ...defaults };
  const scenarios = [['default', base], ...(p.examples || []).map((e, k) => [`ex${k + 1}`, { ...base, ...Object.fromEntries(Object.entries(e.inputs || {}).map(([a, b]) => [a, resolve(b)])) }]), ...((p.table?.rows) || []).map((r, k) => [`row${k + 1}`, { ...base, ...Object.fromEntries(Object.entries(r).map(([a, b]) => [a, resolve(b)])) }])];
  for (const [name, inp] of scenarios) {
    const e = C[p.calc](inp, data); const f = ref[p.calc];
    if (!f) { bad.push(`${id} no ref for ${p.calc}`); break; }
    const r = f(inp);
    checked++; (globalThis.per ||= {})[id] = (globalThis.per[id] || 0) + 1;
    if (!e.ok) { bad.push(`${id} ${name} engine error ${e.error}`); continue; }
    if (r.error) { bad.push(`${id} ${name} ref error ${r.error}`); continue; }
    const cmp = (k, a, b) => { if (b === undefined) return; if (typeof b === 'number' ? !close(a, b) : a !== b) bad.push(`${id} ${name} ${k}: engine ${a} ref ${b}`); };
    if (p.calc === 'circuit_schedule') { e.rows.forEach((row, k) => { cmp(`row${k}.area`, row.area_mm2, r.rows[k].area_mm2); cmp(`row${k}.mcb`, row.breaker_a, r.rows[k].breaker_a); }); continue; }
    for (const k of Object.keys(r)) if (k in e) cmp(k, e[k], r[k]);
  }
}
console.log(JSON.stringify(globalThis.per)); console.log('page scenarios checked', checked, 'mismatches', bad.length); for (const b of bad) console.log('  ', b);
