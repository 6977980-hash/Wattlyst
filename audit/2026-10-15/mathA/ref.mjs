// Independent reference implementations for the audit (Math A). Written from first principles and the
// published IEC tables typed here by the auditor; they do NOT import engine/ code. Policy defaults that are
// owner/engineer choices (PF 0.8, DoD, margin 1.25 ...) are restated here as constants so a silent change in
// data/defaults.json is caught too.
export const SQRT3 = Math.sqrt(3);
export const W_PER_HP = 745.7; // mechanical horsepower
export const RHO_CU = 0.0225; // IEC 60364-5-52 Annex G: 1.25 x 0.018 ohm.mm2/m
export const RHO_AL = 0.036; // 1.25 x 0.029 (rounded as in Annex G)
export const POLICY = {
  v1: 230, v3: 400, pf_mixed: 0.8, pf_gen: 0.8, pf_ups: 0.6, eff_ups: 0.85, eff_hybrid: 0.9,
  dod_la: 0.5, dod_li: 0.9, chg_la: 0.85, chg_li: 0.95, margin: 1.25, motor_eff: 0.8, start_motor: 3,
  diversity: 0.6, min_kw: 1, tou_kw: 5,
  gen_kva: [2.5, 3, 3.5, 5, 6.5, 7.5, 10, 12.5, 15, 20, 25, 30],
  breakers: [6, 10, 16, 20, 25, 32, 40, 50, 63],
  pf_by_type: { inverter_compressor: 0.9, compressor: 0.8, resistive: 1.0 },
  margin_types: ['motor', 'compressor', 'inverter_compressor', 'high_inrush'],
  curve: { lighting: 'B', resistive: 'B', electronic: 'B', sockets: 'C', inverter_compressor: 'C', compressor: 'C', motor: 'C', high_inrush: 'D' },
  min_area: { lighting: 1, other: 2.5 },
  vd: { lighting: 3, other: 5 },
};
// IEC 60364-5-52:2009 Table B.52.4 (PVC, Cu, 2 loaded) and B.52.5 (3 loaded), 30 C; 1 mm2 row from BS 7671 4D1A.
export const IEC = {
  2: { B1: { 1: 13.5, 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125 }, C: { 1: 15.5, 1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138 } },
  3: { B1: { 1: 12, 1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68, 25: 89, 35: 110 }, C: { 1: 14, 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 96, 35: 119 } },
};
export const SIZES = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35];
// Table B.52.14 (PVC, ambient air) and B.52.17 row 1.
export const AMB = [[10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5]];
export const GRP = [[1, 1], [2, 0.8], [3, 0.7], [4, 0.65], [5, 0.6], [6, 0.57], [7, 0.54], [8, 0.52], [9, 0.5], [12, 0.45], [16, 0.41], [20, 0.38]];
const nextRow = (rows, v) => rows.find(([x]) => x >= v - 1e-12)[1];
// PK n/d sizes: area from strands and strand diameter in thou.
export const PK = [[3, 29], [7, 29], [7, 36], [7, 44], [7, 52], [7, 64], [19, 44], [19, 52], [19, 64]].map(([n, d]) => ({ name: `${n}/${d}`, area: n * Math.PI * ((d * 0.0254) / 2) ** 2 }));
export const pkFor = (mm2) => PK.find((p) => p.area >= mm2 - 1e-9)?.name ?? 'none';

const n = (v, def) => (v === undefined || v === null || v === '' ? def : Number(v));

export function circuit(i) {
  const mode = i.mode ?? 'ac1';
  const volts = n(i.volts, mode === 'dc' ? undefined : mode === 'ac3' ? POLICY.v3 : POLICY.v1);
  const pf = mode === 'dc' ? 1 : n(i.pf, POLICY.pf_mixed);
  const k = mode === 'ac3' ? SQRT3 : 1;
  return { mode, volts, pf, k };
}
export const watts_to_amps = (i) => { const c = circuit(i); return { amps: n(i.watts) / (c.k * c.volts * c.pf) }; };
export const amps_to_watts = (i) => { const c = circuit(i); const w = c.k * c.volts * n(i.amps) * c.pf; return { watts: w, kw: w / 1000, va: c.k * c.volts * n(i.amps) }; };
export const kw_to_amps = (i) => { const c = circuit(i); return { amps: (n(i.kw) * 1000) / (c.k * c.volts * c.pf) }; };

// ---- B. battery
export function dod(i) { return n(i.dod, i.chemistry === 'lifepo4' ? POLICY.dod_li : POLICY.dod_la); }
export function runtime(i) {
  const wh = n(i.ah) * n(i.volts) * dod(i) * n(i.inverter_eff, POLICY.eff_ups);
  return { usable_wh: wh, hours: wh / n(i.load_w) };
}
export function bank(i) {
  const ah = (n(i.load_w) * n(i.hours)) / (n(i.volts) * dod(i) * n(i.inverter_eff, POLICY.eff_ups));
  const out = { ah_required: ah, kwh_required: (ah * n(i.volts)) / 1000 };
  if (i.battery_ah !== undefined) {
    const series = n(i.volts) / n(i.battery_v);
    const strings = Math.ceil(ah / n(i.battery_ah) - 1e-9);
    Object.assign(out, { series, strings, batteries: series * strings });
  }
  return out;
}
// ---- C. generators
export function rows(loads, apps) {
  return loads.map((r) => {
    const a = r.id && r.id !== 'custom' ? apps[r.id] : null;
    const run = r.run !== undefined && r.watts === undefined ? n(r.run) : r.watts !== undefined && r.watts !== '' ? n(r.watts) : a.running_w;
    let start = a ? (a.starting_w * run) / a.running_w : run;
    if (r.start !== undefined && r.start !== '') start = n(r.start);
    return { run, start, qty: n(r.qty, 1) };
  });
}
export function sum(rs) {
  let run = 0; let step = 0;
  for (const r of rs) { run += r.run * r.qty; if (r.qty > 0) step = Math.max(step, r.start - r.run); }
  return { running_w: run, peak_w: run + step };
}
export function gen(running_w, peak_w, margin = POLICY.margin, pf = POLICY.pf_gen) {
  const sized = Math.max(running_w * margin, peak_w);
  const kva = sized / pf / 1000;
  return { sized_w: sized, recommended_kva: kva, standard_kva: POLICY.gen_kva.find((s) => s >= kva - 1e-9) };
}
export function pump(hp, other_w = 0, other_start = other_w, eff = POLICY.motor_eff, sf = POLICY.start_motor) {
  const run = (hp * W_PER_HP) / eff;
  const start = run * sf;
  const running = run + other_w;
  const peak = running + Math.max(start - run, other_start - other_w);
  return { pump_run_w: run, pump_start_w: start, running_w: running, peak_w: peak, ...gen(running, peak) };
}
export function capacityCount(kva, run, start, margin = POLICY.margin, pf = POLICY.pf_gen) {
  const cap = kva * 1000 * pf;
  // largest n with n*run*margin <= cap and (n-1)*run + start <= cap
  let k = 0;
  while ((k + 1) * run * margin <= cap + 1e-9 && k * run + start <= cap + 1e-9) k += 1;
  return k;
}
export function fuel(kva, load_w, fuelType = 'petrol', pf = POLICY.pf_gen) {
  // Coefficients re-derived from the source points (Honda EU2200i / EU7000iS; diesel chart 20 kW).
  const petrolPts = [[3.6 / 8.1 / 1.8, 3.6 / 3.2 / 1.8], [19.3 / 18 / 5.5, 19.3 / 6.5 / 5.5]];
  const q = (petrolPts[0][0] + petrolPts[1][0]) / 2; const f = (petrolPts[0][1] + petrolPts[1][1]) / 2;
  const slope = fuelType === 'petrol' ? (f - q) / 0.75 : (6.1 - 2.3) / 15;
  const icpt = fuelType === 'petrol' ? q - 0.25 * slope : (2.3 - 5 * slope) / 20;
  const rated = kva * pf;
  return { slope, icpt, l_per_h: icpt * rated + slope * (load_w / 1000) };
}
// ---- W. wiring
export function design(i, apps) {
  const c = circuit(i);
  const a = i.appliance && i.appliance !== 'custom' ? apps[i.appliance] : null;
  const load_type = i.load_type ?? a?.load_type ?? 'sockets';
  const pf = c.mode === 'dc' ? 1 : n(i.pf, POLICY.pf_by_type[load_type] ?? POLICY.pf_mixed);
  let watts; let ib;
  if (a) { watts = a.load_type === 'inverter_compressor' ? a.starting_w : a.running_w; ib = watts / (c.k * c.volts * pf); }
  else if (i.amps !== undefined) { ib = n(i.amps); watts = ib * c.k * c.volts * pf; }
  else { watts = n(i.watts); ib = watts / (c.k * c.volts * pf); }
  return { ...c, pf, load_type, watts, ib };
}
export function derate(i) {
  return nextRow(AMB, n(i.ambient_c, 45)) * nextRow(GRP, n(i.circuits, 1));
}
export function breaker(ib, load_type, margin = POLICY.margin) {
  const bd = POLICY.margin_types.includes(load_type) ? ib * margin : ib;
  const br = POLICY.breakers.find((s) => s >= bd - 1e-9);
  return { breaker_a: br, min_cable_a: br === undefined ? undefined : Math.max(ib * margin, br) };
}
export function wire(i, apps) {
  const d = design(i, apps);
  const method = i.method ?? 'B1';
  const circ = i.circuit ?? 'other';
  const L = n(i.length_m);
  const rho = n(i.rho, RHO_CU);
  const b = breaker(d.ib, d.load_type, n(i.margin, POLICY.margin));
  if (b.breaker_a === undefined) return { error: 'load_above_standard_breakers' };
  const f = derate(i);
  const col = IEC[d.mode === 'ac3' ? 3 : 2][method];
  const kv = d.mode === 'ac3' ? SQRT3 : 2;
  let byAmp = null;
  for (const s of SIZES) {
    if (s < POLICY.min_area[circ] - 1e-9 || col[s] * f < b.min_cable_a - 1e-9) continue;
    byAmp = byAmp ?? s;
    const drop = (kv * L * d.ib * rho) / s;
    if ((drop / d.volts) * 100 <= POLICY.vd[circ] + 1e-9) return { ...d, ...b, area_mm2: s, ampacity_a: col[s] * f, drop_v: drop, drop_pct: (drop / d.volts) * 100, pk_size: pkFor(s) };
  }
  return { error: byAmp ? 'run_too_long_for_table' : 'load_above_cable_table' };
}
export function mcb(i, apps) {
  const d = design(i, apps);
  const b = breaker(d.ib, d.load_type, n(i.margin, POLICY.margin));
  if (b.breaker_a === undefined) return { error: 'load_above_standard_breakers' };
  const f = derate(i);
  const col = IEC[d.mode === 'ac3' ? 3 : 2][i.method ?? 'B1'];
  const minA = POLICY.min_area[d.load_type === 'lighting' ? 'lighting' : 'other'];
  const s = SIZES.find((x) => x >= minA - 1e-9 && col[x] * f >= b.min_cable_a - 1e-9);
  if (s === undefined) return { error: 'load_above_cable_table' };
  return { ...d, ...b, curve: POLICY.curve[d.load_type], area_mm2: s };
}
export function vdrop(i) {
  const c = circuit(i);
  const amps = i.amps !== undefined ? n(i.amps) : n(i.watts) / (c.k * c.volts * c.pf);
  const rho = n(i.rho, i.conductor === 'aluminium' ? RHO_AL : RHO_CU);
  const kv = c.mode === 'ac3' ? SQRT3 : 2;
  const drop = (kv * n(i.length_m) * amps * rho) / n(i.area_mm2);
  const out = { amps, drop_v: drop, drop_pct: (drop / c.volts) * 100 };
  if (i.conductor !== 'aluminium') {
    const rated = [...SIZES].reverse().find((s) => s <= n(i.area_mm2) + 1e-9);
    out.over_cable_rating = rated === undefined ? true : amps > IEC[c.mode === 'ac3' ? 3 : 2][i.method ?? 'B1'][rated] * derate(i) + 1e-9;
  }
  return out;
}
