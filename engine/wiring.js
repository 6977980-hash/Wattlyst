// W. Wiring (specs/formulas.md section W). Advisory only: every page shows "confirm with a licensed electrician".
import { calculator, CalcError, has, num, pos, frac, pick, dflt, appliance } from './core.js';

/**
 * I = P / (k_I × V × PF); ΔV = k_v × L × I × ρ / A with k_v = 2 (single-phase, there and back) or √3 (three-phase).
 * drop_pct = ΔV / V × 100; limit 3% lighting, 5% other circuits.
 */
export const voltage_drop = calculator((i, d) => {
  const mode = pick(i, 'mode', ['ac1', 'ac3', 'dc'], 'ac1');
  const volts = pos(i, 'volts', mode === 'ac3' ? dflt(d, 'v_3ph') : dflt(d, 'v_1ph'));
  const pf = mode === 'dc' ? 1 : frac(i, 'pf', dflt(d, 'pf_mixed'));
  const length_m = pos(i, 'length_m');
  const area_mm2 = pos(i, 'area_mm2');
  const rho = pos(i, 'rho', dflt(d, 'rho_copper'));
  const circuit = pick(i, 'circuit', ['lighting', 'other'], 'other');
  const amps = has(i, 'amps')
    ? pos(i, 'amps')
    : pos(i, 'watts') / ((mode === 'ac3' ? Math.sqrt(3) : 1) * volts * pf);
  const kv = mode === 'ac3' ? Math.sqrt(3) : 2;
  const drop_v = (kv * length_m * amps * rho) / area_mm2;
  if (drop_v >= volts) throw new CalcError('cable_far_too_small_for_load', 'area_mm2');
  const drop_pct = (drop_v / volts) * 100;
  const limit_pct = circuit === 'lighting' ? dflt(d, 'vdrop_limit_lighting_pct') : dflt(d, 'vdrop_limit_other_pct');
  return { mode, volts, pf, length_m, area_mm2, rho, amps, drop_v, drop_pct, limit_pct, within_limit: drop_pct <= limit_pct, voltage_at_load: volts - drop_v };
});

/** PK designation n/d: n strands of diameter d inches. A = n × π × (d × 25.4 / 2)² mm². */
export const pk_cable_area = calculator((i) => {
  const strands = pos(i, 'strands');
  const strand_in = pos(i, 'strand_in');
  const strand_mm = strand_in * 25.4;
  return { strands, strand_in, strand_mm, area_mm2: strands * Math.PI * (strand_mm / 2) ** 2 };
});

/**
 * Design current I_b = P / (V × PF). Breaker I_n = next standard size ≥ I_b.
 * Cable ampacity I_z ≥ max(I_b × margin, I_n) so that I_b ≤ I_n ≤ I_z always holds.
 */
export const design_current = calculator((i, d) => {
  const watts = pos(i, 'watts');
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const ib = watts / (volts * pf);
  const sizes = dflt(d, 'standard_breaker_a');
  const breaker = sizes.find((s) => s >= ib - 1e-9);
  if (breaker === undefined) {
    return { watts, volts, pf, margin, ib_a: ib, min_cable_a: ib * margin, above_standard_sizes: true };
  }
  return { watts, volts, pf, margin, ib_a: ib, min_breaker_a: breaker, min_cable_a: Math.max(ib * margin, breaker), above_standard_sizes: false };
});

function cableTable(d) {
  const t = d?.cables;
  if (!Array.isArray(t?.cables) || !t.cables.length) throw new CalcError('cable_data_missing', 'cables');
  return t;
}

/**
 * Design current for a load given as watts, amps or an appliance id; k = √3 for three-phase.
 * An appliance sets the load type too; an inverter AC is designed at its maximum rated input
 * (starting_w = full-speed draw), other appliances at their running watts.
 */
function designCurrent(i, d, t) {
  const mode = pick(i, 'mode', ['ac1', 'ac3', 'dc'], 'ac1');
  const volts = pos(i, 'volts', mode === 'ac3' ? dflt(d, 'v_3ph') : dflt(d, 'v_1ph'));
  const pf = mode === 'dc' ? 1 : frac(i, 'pf', dflt(d, 'pf_mixed'));
  const k = mode === 'ac3' ? Math.sqrt(3) : 1;
  const out = { mode, volts, pf, k };
  let watts;
  let ib;
  if (has(i, 'appliance') && String(i.appliance).trim() !== 'custom') {
    const a = appliance(d, i.appliance);
    watts = a.load_type === 'inverter_compressor' ? a.starting_w : a.running_w;
    ib = watts / (k * volts * pf);
    Object.assign(out, { appliance: String(i.appliance).trim(), appliance_name: a.name, appliance_load_type: a.load_type });
  } else if (has(i, 'amps')) {
    ib = pos(i, 'amps');
    watts = ib * k * volts * pf;
  } else {
    watts = pos(i, 'watts');
    ib = watts / (k * volts * pf);
  }
  const load_type = pick(i, 'load_type', Object.keys(t.curve_by_load), out.appliance_load_type ?? 'sockets');
  return { ...out, watts, ib_a: ib, load_type };
}

/**
 * Breaker I_n = next standard size ≥ I_b (≥ I_b × margin for motor-type loads, which run near full
 * current for long periods) and the cable ampacity it needs: I_z ≥ max(I_b × margin, I_n).
 */
function breakerFor(dc, i, d, t) {
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const motor = (t.breaker_margin_load_types || []).includes(dc.load_type);
  const breaker_design_a = motor ? dc.ib_a * margin : dc.ib_a;
  const breaker = dflt(d, 'standard_breaker_a').find((s) => s >= breaker_design_a - 1e-9);
  if (breaker === undefined) throw new CalcError('load_above_standard_breakers', 'watts');
  return { margin, breaker_design_a, breaker_a: breaker, min_cable_a: Math.max(dc.ib_a * margin, breaker) };
}

const minArea = (t, circuit) => t.min_area_mm2?.[circuit] ?? 0;

/** Pakistani n/d size for a standard cable: the exact one, else the next size up (never smaller). */
const pkSizeFor = (t, mm2) => t.pk_sizes?.find((p) => p.rated_as_mm2 >= mm2 - 1e-9)?.name ?? 'none';

/**
 * W2/W1: smallest copper cable (data/cable-ampacity.json) whose ampacity for the installation method
 * covers max(I_b × margin, I_n) AND whose voltage drop over the run stays within the limit (formulas.md W).
 */
export const wire_size = calculator((i, d) => {
  const t = cableTable(d);
  const method = pick(i, 'method', Object.keys(t.methods), 'B1');
  const circuit = pick(i, 'circuit', ['lighting', 'other'], 'other');
  const length_m = pos(i, 'length_m');
  const rho = pos(i, 'rho', dflt(d, 'rho_copper'));
  const dc = designCurrent(i, d, t);
  const br = breakerFor(dc, i, d, t);
  const limit_pct = circuit === 'lighting' ? dflt(d, 'vdrop_limit_lighting_pct') : dflt(d, 'vdrop_limit_other_pct');
  const kv = dc.mode === 'ac3' ? Math.sqrt(3) : 2;
  const dropOf = (mm2) => (kv * length_m * dc.ib_a * rho) / mm2;
  const min_mm2 = minArea(t, circuit);
  let chosen = null;
  let by_ampacity = null;
  for (const c of t.cables) {
    const iz = c.ampacity_a[method];
    if (c.area_mm2 < min_mm2 - 1e-9 || !(iz >= br.min_cable_a - 1e-9)) continue;
    if (by_ampacity === null) by_ampacity = c;
    if ((dropOf(c.area_mm2) / dc.volts) * 100 <= limit_pct + 1e-9) { chosen = c; break; }
  }
  if (!chosen) throw new CalcError(by_ampacity ? 'run_too_long_for_table' : 'load_above_cable_table', 'length_m');
  const drop_v = dropOf(chosen.area_mm2);
  return {
    ...dc, length_m, method, circuit, rho, ...br, min_mm2, area_mm2: chosen.area_mm2, ampacity_a: chosen.ampacity_a[method], pk_size: pkSizeFor(t, chosen.area_mm2),
    drop_v, drop_pct: (drop_v / dc.volts) * 100, limit_pct, voltage_at_load: dc.volts - drop_v,
    limited_by: chosen === by_ampacity ? 'ampacity' : 'voltage_drop', ampacity_only_mm2: by_ampacity.area_mm2,
  };
});

/**
 * W3: MCB rating = next standard size ≥ I_b; curve by load type (IEC 60898-1 B/C/D from data/cable-ampacity.json);
 * matching cable = smallest size whose ampacity (method B1) ≥ max(I_b × margin, I_n).
 */
export const breaker_size = calculator((i, d) => {
  const t = cableTable(d);
  const dc = designCurrent(i, d, t);
  const br = breakerFor(dc, i, d, t);
  const curve = t.curve_by_load[dc.load_type];
  const cv = t.mcb_curves[curve];
  const method = pick(i, 'method', Object.keys(t.methods), 'B1');
  const min_mm2 = minArea(t, dc.load_type === 'lighting' ? 'lighting' : 'other');
  const cable = t.cables.find((c) => c.area_mm2 >= min_mm2 - 1e-9 && c.ampacity_a[method] >= br.min_cable_a - 1e-9);
  if (!cable) throw new CalcError('load_above_cable_table', 'watts');
  return {
    ...dc, ...br, curve, trip_min: cv.trip_min, trip_max: cv.trip_max, trip_min_a: cv.trip_min * br.breaker_a, trip_max_a: cv.trip_max * br.breaker_a, curve_use: cv.use,
    method, min_mm2, area_mm2: cable.area_mm2, ampacity_a: cable.ampacity_a[method], pk_size: pkSizeFor(t, cable.area_mm2),
  };
});

/** Reference rows for the wire-size tables: ampacity per method and the PK size of every standard cable. */
export const cable_rating = calculator((i, d) => {
  const t = cableTable(d);
  const area_mm2 = pos(i, 'area_mm2');
  const c = t.cables.find((x) => Math.abs(x.area_mm2 - area_mm2) < 1e-9);
  if (!c) throw new CalcError('cable_size_unknown', 'area_mm2');
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const pk = t.pk_sizes.find((p) => p.rated_as_mm2 === c.area_mm2);
  const out = { area_mm2: c.area_mm2, ampacity_b1_a: c.ampacity_a.B1, ampacity_c_a: c.ampacity_a.C, volts, pf, max_w_b1: c.ampacity_a.B1 * volts * pf, max_w_c: c.ampacity_a.C * volts * pf };
  if (pk) Object.assign(out, { pk_size: pk.name, pk_area_mm2: pk.area_mm2, pk_strands: pk.strands, pk_strand_mm: pk.strand_in * 25.4 });
  return out;
});
