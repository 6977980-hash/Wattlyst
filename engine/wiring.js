// W. Wiring (specs/formulas.md section W). Advisory only: every page shows "confirm with a licensed electrician".
import { calculator, CalcError, has, num, pos, frac, pick, dflt, appliance } from './core.js';

/**
 * I = P / (k_I × V × PF), k_I = 1 (single-phase, DC) or √3 (three-phase); ΔV = k_v × L × I × ρ / A with
 * k_v = 2 (single-phase and DC, there and back) or √3 (three-phase). ρ from the conductor (copper or aluminium)
 * unless entered. drop_pct = ΔV / V × 100; limit 3% lighting, 5% other circuits. DC needs the voltage entered.
 * Current check (copper only, data/cable-ampacity.json): the rated size is the largest table cable ≤ the entered
 * area; over_cable_rating = I > its derated ampacity for the method (default B1; three-phase column for ac3), or the
 * cable is below the table.
 */
export const voltage_drop = calculator((i, d) => {
  const mode = pick(i, 'mode', ['ac1', 'ac3', 'dc'], 'ac1');
  const volts = mode === 'dc'
    ? pos(i, 'volts', undefined, has(i, 'volts') ? undefined : 'volts_required_dc')
    : pos(i, 'volts', mode === 'ac3' ? dflt(d, 'v_3ph') : dflt(d, 'v_1ph'));
  const pf = mode === 'dc' ? 1 : frac(i, 'pf', dflt(d, 'pf_mixed'));
  const length_m = pos(i, 'length_m');
  const area_mm2 = pos(i, 'area_mm2');
  const conductor = pick(i, 'conductor', ['copper', 'aluminium'], 'copper');
  const rho = pos(i, 'rho', dflt(d, conductor === 'aluminium' ? 'rho_aluminium' : 'rho_copper'));
  const circuit = pick(i, 'circuit', ['lighting', 'other'], 'other');
  const k = mode === 'ac3' ? Math.sqrt(3) : 1;
  // DC watts are an inverter's output: the battery also supplies its loss, as in designCurrent (WL-121).
  const eff = mode === 'dc' ? frac(i, 'inverter_eff', dflt(d, 'inverter_eff_hybrid')) : 1;
  if (has(i, 'inverter_eff')) frac(i, 'inverter_eff'); // used only on DC, but a filled box is still checked (WL-223)
  // DC watts from a battery: the current at the low-battery cut-off voltage (WL-177 [ENGINEER]).
  const current_v = mode === 'dc' ? volts * dflt(d, 'dc_cutoff_ratio') : volts;
  const amps = has(i, 'amps') || !('watts' in i) ? pos(i, 'amps') : pos(i, 'watts') / (k * current_v * pf * eff);
  const kv = mode === 'ac3' ? Math.sqrt(3) : 2;
  const drop_v = (kv * length_m * amps * rho) / area_mm2;
  if (drop_v >= volts) throw new CalcError('cable_far_too_small_for_load', 'area_mm2');
  const drop_pct = (drop_v / volts) * 100;
  const limit_pct = circuit === 'lighting' ? dflt(d, 'vdrop_limit_lighting_pct') : dflt(d, 'vdrop_limit_other_pct');
  const out = { mode, volts, current_v, pf, k, kv, inverter_eff: eff, length_m, area_mm2, conductor, rho, amps, drop_v, drop_pct, limit_pct, within_limit: drop_pct <= limit_pct, voltage_at_load: volts - drop_v };
  if (conductor === 'aluminium') return { ...out, ampacity_checked: false };
  const t = cableTable(d);
  if (pick(i, 'cable', ['pvc', 'pv'], 'pvc') === 'pv') return { ...out, ...pvRating(i, t, area_mm2, amps) };
  const method = pick(i, 'method', Object.keys(t.methods), 'B1');
  const der = derating(i, t);
  const rated = [...t.cables].reverse().find((c) => c.area_mm2 <= area_mm2 + 1e-9);
  if (!rated) return { ...out, ampacity_checked: true, method, ...der, over_cable_rating: true };
  const ampacity_30c_a = ratingAt30(rated, method, mode);
  const ampacity_a = ampacity_30c_a * der.derate;
  return { ...out, ampacity_checked: true, method, ...der, rated_mm2: rated.area_mm2, ampacity_30c_a, ampacity_a, over_cable_rating: amps > ampacity_a + 1e-9 };
});

/**
 * Solar PV cable (W4, WL-180 [ENGINEER]): EN 50618 Table A.3 ratings at 60 °C air (data/cable-ampacity.json pv_cables:
 * free air, on a surface, two cables touching) × the Table A.4 factor for the roof air temperature (default pv_derating).
 */
function pvRating(i, t, area_mm2, amps) {
  const pv = t.pv_cables;
  if (!pv?.cables?.length) throw new CalcError('cable_data_missing', 'cables');
  const method = pick(i, 'method', Object.keys(pv.methods), pv.default_method);
  const amb = pv.ambient_factors;
  const ambient_c = num(i, 'ambient_c', { def: pv.default_ambient_c, min: amb[0][0], max: amb[amb.length - 1][0], code: 'ambient_out_of_range' });
  const ambient_factor = factorFor(amb, ambient_c);
  const rated = [...pv.cables].reverse().find((c) => c.area_mm2 <= area_mm2 + 1e-9);
  const base = { ampacity_checked: true, cable: 'pv', method, ambient_c, ambient_factor, derate: ambient_factor };
  if (!rated) return { ...base, over_cable_rating: true };
  const ampacity_a = rated.ampacity_a[method] * ambient_factor;
  return { ...base, rated_mm2: rated.area_mm2, ampacity_base_a: rated.ampacity_a[method], ampacity_a, over_cable_rating: amps > ampacity_a + 1e-9 };
}

/** PK designation n/d: n strands of diameter d inches. A = n × π × (d × 25.4 / 2)² mm². */
export const pk_cable_area = calculator((i) => {
  const strands = pos(i, 'strands');
  const strand_in = pos(i, 'strand_in');
  const strand_mm = strand_in * 25.4;
  return { strands, strand_in, strand_mm, area_mm2: strands * Math.PI * (strand_mm / 2) ** 2 };
});

function cableTable(d) {
  const t = d?.cables;
  if (!Array.isArray(t?.cables) || !t.cables.length) throw new CalcError('cable_data_missing', 'cables');
  return t;
}

/** Table ampacity at 30 °C: two loaded conductors (single-phase, DC) or three (three-phase, ac3). */
const ratingAt30 = (c, method, mode) => (mode === 'ac3' ? c.ampacity_3ph_a : c.ampacity_a)[method];

/** Factor of the first [value, factor] row at or above v (between rows: the next row up, never interpolated). */
const factorFor = (rows, v) => rows.find(([x]) => x >= v - 1e-9)?.[1];

/**
 * Correction factors (data/cable-ampacity.json derating, IEC 60364-5-52 B.52.14 and B.52.17):
 * ambient air temperature (default a hot-climate design value [ENGINEER]) and circuits grouped together (default 1).
 * derate = f_ambient × f_group multiplies every table rating.
 */
function derating(i, t) {
  const g = t.derating;
  if (!g) throw new CalcError('cable_data_missing', 'cables');
  const amb = g.ambient_factors;
  const grp = g.grouping_factors;
  const ambient_c = num(i, 'ambient_c', { def: g.default_ambient_c, min: amb[0][0], max: amb[amb.length - 1][0], code: 'ambient_out_of_range' });
  const circuits = num(i, 'circuits', { def: g.default_circuits, min: 1, max: grp[grp.length - 1][0], code: 'circuits_out_of_range' });
  const ambient_factor = factorFor(amb, ambient_c);
  const group_factor = factorFor(grp, circuits);
  return { ambient_c, circuits, ambient_factor, group_factor, derate: ambient_factor * group_factor };
}

/**
 * Design current for a load given as watts, amps or an appliance id; k = √3 for three-phase.
 * An appliance sets the load type too; an inverter AC is designed at its maximum rated input
 * (starting_w = full-speed draw), other appliances at their running watts. A blank PF on an appliance takes
 * the PF of its load type (data/defaults.json pf_by_load_type), as does a load type picked by hand, so W1, W3 and E4
 * print the same breaker for the same AC.
 * DC has no standard voltage: a blank voltage is an error, never a silent 230 V. DC watts are what an inverter on the
 * battery delivers, so the battery current is W ÷ (η_inv × V), η_inv default inverter_eff_hybrid; 1 for a DC load
 * wired straight to the battery (full audit WL-121, [ENGINEER]).
 */
function designCurrent(i, d, t) {
  const mode = pick(i, 'mode', ['ac1', 'ac3', 'dc'], 'ac1');
  const volts = mode === 'dc'
    ? pos(i, 'volts', undefined, has(i, 'volts') ? undefined : 'volts_required_dc')
    : pos(i, 'volts', mode === 'ac3' ? dflt(d, 'v_3ph') : dflt(d, 'v_1ph'));
  const a = has(i, 'appliance') && String(i.appliance).trim() !== 'custom' ? appliance(d, i.appliance) : null;
  const load_type = pick(i, 'load_type', Object.keys(t.curve_by_load), a?.load_type ?? 'sockets');
  const pf = mode === 'dc' ? 1 : frac(i, 'pf', d?.defaults?.pf_by_load_type?.[load_type] || dflt(d, 'pf_mixed'));
  const k = mode === 'ac3' ? Math.sqrt(3) : 1;
  const eff = mode === 'dc' ? frac(i, 'inverter_eff', dflt(d, 'inverter_eff_hybrid')) : 1;
  if (has(i, 'inverter_eff')) frac(i, 'inverter_eff'); // used only on DC, but a filled box is still checked (WL-223)
  const out = { mode, volts, pf, k, inverter_eff: eff };
  let watts;
  let ib;
  if (a) {
    watts = a.load_type === 'inverter_compressor' ? a.starting_w : a.running_w;
    ib = watts / (k * volts * pf);
    Object.assign(out, { appliance: String(i.appliance).trim(), appliance_name: a.name, appliance_load_type: a.load_type });
  } else if (has(i, 'amps')) {
    ib = pos(i, 'amps');
    watts = ib * k * volts * pf;
  } else {
    watts = pos(i, 'watts');
    // DC: the battery current at the low-battery cut-off, where it is highest (data/defaults.json dc_cutoff_ratio, WL-177).
    const current_v = mode === 'dc' ? volts * dflt(d, 'dc_cutoff_ratio') : volts;
    ib = watts / (k * current_v * pf * eff);
    out.current_v = current_v;
  }
  return { current_v: volts, ...out, watts, ib_a: ib, load_type };
}

/**
 * Breaker I_n = next standard size ≥ I_b (≥ I_b × margin for motor-type loads, which run near full
 * current for long periods) and the cable ampacity it needs: I_z ≥ max(I_b × margin, I_n).
 */
function breakerFor(dc, i, d, t) {
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1, max: dflt(d, 'margin_max') });
  const motor = (t.breaker_margin_load_types || []).includes(dc.load_type);
  const breaker_design_a = motor ? dc.ib_a * margin : dc.ib_a;
  // DC battery feeds above the largest MCB take a DC fuse (data/defaults.json standard_dc_fuse_a, WL-121).
  const sizes = dc.mode === 'dc' ? [...dflt(d, 'standard_breaker_a'), ...dflt(d, 'standard_dc_fuse_a')] : dflt(d, 'standard_breaker_a');
  const breaker = sizes.find((s) => s >= breaker_design_a - 1e-9);
  if (breaker === undefined) throw new CalcError(dc.mode === 'dc' ? 'dc_load_above_cable_table' : 'load_above_standard_breakers', 'watts');
  return { margin, breaker_design_a, breaker_a: breaker, min_cable_a: Math.max(dc.ib_a * margin, breaker) };
}

const minArea = (t, circuit) => t.min_area_mm2?.[circuit] ?? 0;

/**
 * Pakistani n/d size for a standard cable: the smallest one whose real area is at least the IEC size (formulas.md W),
 * so its voltage drop is never above the one computed for the IEC size and W5 rates it at least as that size.
 */
const pkFor = (t, mm2) => t.pk_sizes?.find((p) => p.area_mm2 >= mm2 - 1e-9);
// The shop's metric name is added when it differs from the size shown, e.g. 7/64 is sold as 16 mm² (WL-180).
const pkLabel = (p, mm2) => (p.sold_as_mm2 && Math.abs(p.sold_as_mm2 - mm2) > 1e-9 ? `${p.name}, sold as ${p.sold_as_mm2} mm²` : p.name);
const pkSizeFor = (t, mm2) => { const p = pkFor(t, mm2); return p ? pkLabel(p, mm2) : 'none'; };
// A DC battery feed above the table is not split into circuits like an AC load (WL-170).
const aboveTable = (dc) => (dc.mode === 'dc' ? 'dc_load_above_cable_table' : 'load_above_cable_table');

/**
 * W2/W1: smallest copper cable (data/cable-ampacity.json) whose derated ampacity for the installation method
 * covers max(I_b × margin, I_n) AND whose voltage drop over the run stays within the limit (formulas.md W).
 */
export const wire_size = calculator((i, d) => {
  const t = cableTable(d);
  const method = pick(i, 'method', Object.keys(t.methods), 'B1');
  const length_m = pos(i, 'length_m');
  const rho = pos(i, 'rho', dflt(d, 'rho_copper'));
  const dc = designCurrent(i, d, t);
  // A lighting load is a lighting circuit (its minimum size and drop limit), as on W3, unless the circuit is entered (WL-125).
  const circuit = pick(i, 'circuit', ['lighting', 'other'], dc.load_type === 'lighting' ? 'lighting' : 'other');
  const br = breakerFor(dc, i, d, t);
  const der = derating(i, t);
  const iz = (c) => ratingAt30(c, method, dc.mode) * der.derate;
  const limit_pct = circuit === 'lighting' ? dflt(d, 'vdrop_limit_lighting_pct') : dflt(d, 'vdrop_limit_other_pct');
  const kv = dc.mode === 'ac3' ? Math.sqrt(3) : 2;
  const dropOf = (mm2) => (kv * length_m * dc.ib_a * rho) / mm2;
  const min_mm2 = minArea(t, circuit);
  let chosen = null;
  let by_ampacity = null;
  for (const c of t.cables) {
    if (c.area_mm2 < min_mm2 - 1e-9 || !(iz(c) >= br.min_cable_a - 1e-9)) continue;
    if (by_ampacity === null) by_ampacity = c;
    if ((dropOf(c.area_mm2) / dc.volts) * 100 <= limit_pct + 1e-9) { chosen = c; break; }
  }
  if (!chosen) throw new CalcError(by_ampacity ? 'run_too_long_for_table' : aboveTable(dc), 'length_m');
  const drop_v = dropOf(chosen.area_mm2);
  return {
    ...dc, length_m, method, circuit, rho, ...br, ...der, min_mm2, area_mm2: chosen.area_mm2, ampacity_30c_a: ratingAt30(chosen, method, dc.mode), ampacity_a: iz(chosen), pk_size: pkSizeFor(t, chosen.area_mm2),
    drop_v, drop_pct: (drop_v / dc.volts) * 100, limit_pct, voltage_at_load: dc.volts - drop_v,
    limited_by: chosen === by_ampacity ? 'ampacity' : 'voltage_drop', ampacity_only_mm2: by_ampacity.area_mm2,
  };
});

/**
 * W3: MCB rating = next standard size ≥ I_b; curve by load type (IEC 60898-1 B/C/D from data/cable-ampacity.json);
 * matching cable = smallest size whose derated ampacity (method B1) ≥ max(I_b × margin, I_n).
 */
export const breaker_size = calculator((i, d) => {
  const t = cableTable(d);
  const dc = designCurrent(i, d, t);
  const br = breakerFor(dc, i, d, t);
  const curve = t.curve_by_load[dc.load_type];
  const cv = t.mcb_curves[curve];
  const method = pick(i, 'method', Object.keys(t.methods), 'B1');
  const der = derating(i, t);
  const iz = (c) => ratingAt30(c, method, dc.mode) * der.derate;
  const min_mm2 = minArea(t, dc.load_type === 'lighting' ? 'lighting' : 'other');
  const cable = t.cables.find((c) => c.area_mm2 >= min_mm2 - 1e-9 && iz(c) >= br.min_cable_a - 1e-9);
  if (!cable) throw new CalcError(aboveTable(dc), 'watts');
  return {
    ...dc, ...br, ...der, curve, trip_min: cv.trip_min, trip_max: cv.trip_max, trip_min_a: cv.trip_min * br.breaker_a, trip_max_a: cv.trip_max * br.breaker_a, curve_use: cv.use,
    method, min_mm2, area_mm2: cable.area_mm2, ampacity_30c_a: ratingAt30(cable, method, dc.mode), ampacity_a: iz(cable), pk_size: pkSizeFor(t, cable.area_mm2),
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
  const der = derating(i, t); // formulas.md W: derated everywhere (WL-126)
  const b1 = c.ampacity_a.B1 * der.derate;
  const cm = c.ampacity_a.C * der.derate;
  const out = { area_mm2: c.area_mm2, ...der, ampacity_30c_b1_a: c.ampacity_a.B1, ampacity_30c_c_a: c.ampacity_a.C, ampacity_b1_a: b1, ampacity_c_a: cm, volts, pf, max_w_b1: b1 * volts * pf, max_w_c: cm * volts * pf };
  if (pk) Object.assign(out, { pk_size: pkLabel(pk, c.area_mm2), pk_area_mm2: pk.area_mm2, pk_strands: pk.strands, pk_strand_mm: pk.strand_in * 25.4 });
  return out;
});
