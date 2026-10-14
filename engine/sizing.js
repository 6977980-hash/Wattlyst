// C. Inverter & generator sizing (specs/formulas.md section C), sanctioned load (G, N4).
import { calculator, CalcError, num, pos, frac, nonneg, ceilSafe, dflt, appliance, has, pick } from './core.js';

/**
 * loads: [{ name, run, start, qty }] for appliances ON AT THE SAME TIME. start defaults to run.
 * P_run = Σ run × qty; P_surge = P_run + max(start − run) (only the largest motor starts at once).
 */
export function sumLoads(loads) {
  if (!Array.isArray(loads) || loads.length === 0) throw new CalcError('loads_required', 'loads');
  let running = 0;
  let maxStep = 0;
  loads.forEach((l, idx) => {
    const run = num(l, 'run', { min: 0, code: `load_${idx}_run_invalid` });
    const start = num(l, 'start', { def: run, min: 0, code: `load_${idx}_start_invalid` });
    const qty = num(l, 'qty', { def: 1, min: 0, code: `load_${idx}_qty_invalid` });
    if (start < run) throw new CalcError(`load_${idx}_start_below_run`, 'loads');
    running += run * qty;
    if (qty > 0) maxStep = Math.max(maxStep, start - run);
  });
  if (!(running > 0)) throw new CalcError('load_must_be_positive', 'loads');
  return { running_w: running, surge_w: running + maxStep };
}

/**
 * Appliance rows for the load, inverter, generator and solar tools: [{ id, watts, start, qty, hours }] (or plain { run, start, qty } rows). `id` picks running/starting watts and the
 * typical hours from data/appliances.json ("custom" or blank = the watts entered); `watts` overrides the
 * running watts (starting watts scale with it); `start` (optional, blank = auto) sets the starting watts, e.g. a custom
 * motor's surge (custom rows otherwise start at their running watts); qty defaults to 1; hours per day defaults to the appliance's typical hours.
 */
export function loadRows(loads, d) {
  if (!Array.isArray(loads) || loads.length === 0) throw new CalcError('loads_required', 'loads');
  try {
    return loads.map((row, idx) => rowOf(row, idx, d));
  } catch (e) {
    if (e instanceof CalcError) throw new CalcError(e.code, 'loads'); // the UI points at the list, not a field name
    throw e;
  }
}

function rowOf(row, idx, d) {
  {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    const item = id && id !== 'custom' ? appliance(d, id, 'loads') : null;
    const qty = num(row, 'qty', { def: 1, min: 0, code: `load_${idx}_qty_invalid` });
    let run;
    if (has(row, 'run') && !has(row, 'watts')) run = num(row, 'run', { min: 0, code: `load_${idx}_run_invalid` });
    else if (has(row, 'watts') || !item) run = num(row, 'watts', { min: 0, code: item ? `load_${idx}_watts_invalid` : `load_${idx}_watts_required` });
    else run = item.running_w;
    let start = item ? (item.starting_w * run) / item.running_w : run;
    if (has(row, 'start')) start = num(row, 'start', { min: 0, code: `load_${idx}_start_invalid` });
    if (start < run) throw new CalcError(`load_${idx}_start_below_run`, 'loads');
    // Energy uses the average draw where one is known (inverter ACs cycle well below their rated input, formulas.md E).
    const energy_w = item?.avg_w ? (item.avg_w * run) / item.running_w : run;
    const hours = num(row, 'hours', { def: item?.typical_hours_per_day ?? 0, min: 0, max: 24, code: `load_${idx}_hours_invalid` });
    return { id: item ? id : 'custom', name: item?.name ?? 'Custom load', run, start, energy_w, qty, hours };
  }
}

/** Inverter: continuous ≥ P_run × margin; surge ≥ P_surge; kVA = P_run × margin / PF / 1000. */
export const inverter_size = calculator((i, d) => {
  const rows = loadRows(i.loads, d);
  const { running_w, surge_w } = sumLoads(rows);
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const continuous_w = running_w * margin;
  return { appliances: rows.length, items: rows.reduce((t, r) => t + r.qty, 0), running_w, surge_w, margin, pf, continuous_w, kva: continuous_w / pf / 1000 };
});

/** Generator: kVA = max(P_run × margin, P_surge) / PF / 1000. PF 0.8 nameplate convention; next standard size from data/defaults.json. */
function generatorFor(loads, i, d) {
  const { running_w, surge_w } = sumLoads(loads);
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const pf = frac(i, 'pf', dflt(d, 'pf_generator'));
  const sized_w = Math.max(running_w * margin, surge_w);
  const recommended_kva = sized_w / pf / 1000;
  const sizes = dflt(d, 'standard_generator_kva');
  const standard_kva = sizes.find((s) => s >= recommended_kva - 1e-9);
  const out = { running_w, peak_w: surge_w, margin, pf, running_margin_w: running_w * margin, sized_w, recommended_kva, recommended_kw: sized_w / 1000, above_standard_sizes: standard_kva === undefined };
  if (standard_kva !== undefined) out.standard_kva = standard_kva;
  return out;
}

export const generator_size = calculator((i, d) => generatorFor(loadRows(i.loads, d), i, d));

/**
 * C7: what a generator of a given kVA can run (the generator rule above, solved for the load).
 * Capacity W = kVA × 1000 × PF. Running load must satisfy P_run × margin ≤ capacity and the peak
 * (running + the largest starting step) P_surge ≤ capacity. Optional appliance rows are checked
 * against both limits; optional `appliance` id gives how many of that appliance it runs:
 * n = floor(min(capacity / (run × margin), (capacity − start) / run + 1)), never below 0.
 */
export const generator_capacity = calculator((i, d) => {
  const kva = pos(i, 'kva');
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const pf = frac(i, 'pf', dflt(d, 'pf_generator'));
  const capacity_w = kva * 1000 * pf;
  const out = { kva, pf, margin, capacity_w, max_running_w: capacity_w / margin, max_start_w: capacity_w };
  if (Array.isArray(i.loads) && i.loads.length) {
    const { running_w, surge_w } = sumLoads(loadRows(i.loads, d));
    const running_ok = running_w * margin <= capacity_w + 1e-9;
    const start_ok = surge_w <= capacity_w + 1e-9;
    Object.assign(out, { running_w, peak_w: surge_w, running_ok, start_ok, fits: running_ok && start_ok, load_pct: ((running_w * margin) / capacity_w) * 100, spare_running_w: Math.max(0, capacity_w / margin - running_w) });
  }
  if (has(i, 'appliance')) {
    const a = appliance(d, i.appliance, 'appliance');
    const n = Math.floor(Math.min(capacity_w / (a.running_w * margin), (capacity_w - a.starting_w) / a.running_w + 1) + 1e-9);
    Object.assign(out, { appliance: String(i.appliance).trim(), appliance_name: a.name, appliance_run_w: a.running_w, appliance_start_w: a.starting_w, appliance_count: Math.max(0, n) });
  }
  return out;
});

/** Other loads running at the same time as the main appliance: run watts and (optional) starting watts. */
function otherLoads(i) {
  const other_w = nonneg(i, 'other_w', 0);
  const other_start_w = nonneg(i, 'other_start_w', other_w);
  if (other_start_w < other_w) throw new CalcError('other_start_below_run', 'other_start_w');
  return other_w > 0 ? [{ name: 'other', run: other_w, start: other_start_w }] : [];
}

/** C6: generator for an air conditioner (data/appliances.json running/starting watts) plus other loads. */
export const generator_for_ac = calculator((i, d) => {
  const ac = appliance(d, i.ac, 'ac');
  const loads = [{ name: ac.name, run: ac.running_w, start: ac.starting_w }, ...otherLoads(i)];
  const other_w = loads[1]?.run ?? 0;
  return { ac: i.ac.trim(), ac_name: ac.name, ac_run_w: ac.running_w, ac_start_w: ac.starting_w, other_w, ...generatorFor(loads, i, d) };
});

/**
 * C5: generator for a pump motor. Running input W = HP × 745.7 / motor efficiency (formulas.md A);
 * starting W = running × start factor (defaults start_factors.motor, engineer to confirm).
 */
export const generator_for_pump = calculator((i, d) => {
  const hp = pos(i, 'hp');
  const motor_eff = frac(i, 'motor_eff', dflt(d, 'motor_eff'));
  const start_factor = num(i, 'start_factor', { def: dflt(d, 'start_factors').motor, min: 1 });
  const shaft_w = hp * dflt(d, 'w_per_hp');
  const pump_run_w = shaft_w / motor_eff;
  const pump_start_w = pump_run_w * start_factor;
  const loads = [{ name: 'pump', run: pump_run_w, start: pump_start_w }, ...otherLoads(i)];
  return { hp, motor_eff, start_factor, shaft_w, pump_run_w, pump_start_w, other_w: loads[1]?.run ?? 0, ...generatorFor(loads, i, d) };
});

/**
 * N4: demand = connected (running) kW × diversity; recommended = max(min kW, ceil(demand)).
 * A motor's starting surge lasts seconds and does not register on the MDI, so it does not raise the
 * sanctioned load; it is returned only as a note for inverter/generator sizing. [ENGINEER]
 * ≥ 5 kW: ToU meter mandatory and not protected. Net-billing cap = sanctioned kW.
 */
export const sanctioned_load = calculator((i, d) => {
  let connected_kw;
  if (Array.isArray(i.appliances_w)) {
    connected_kw = i.appliances_w.reduce((s, w, idx) => s + num({ w }, 'w', { min: 0, code: `appliance_${idx}_invalid` }), 0) / 1000;
    if (!(connected_kw > 0)) throw new CalcError('loads_required', 'appliances_w');
  } else {
    connected_kw = pos(i, 'connected_kw');
  }
  const diversity = frac(i, 'diversity', dflt(d, 'diversity_home'));
  const largest_start_kw = nonneg(i, 'largest_start_kw', 0);
  const demand_kw = connected_kw * diversity;
  const recommended_kw = Math.max(dflt(d, 'min_sanctioned_kw'), ceilSafe(demand_kw));
  const tou_kw = dflt(d, 'tou_threshold_kw');
  return { connected_kw, diversity, demand_kw, largest_start_kw, start_exceeds_sanctioned: largest_start_kw > recommended_kw, recommended_kw, tou_warning: recommended_kw >= tou_kw, net_billing_cap_kw: recommended_kw };
});

/** E: load check against sanctioned kW; amps = W / (V × PF). */
export const load_check = calculator((i, d) => {
  const total_w = pos(i, 'total_w', undefined, 'load_must_be_positive');
  const sanctioned_kw = pos(i, 'sanctioned_kw');
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  return { total_w, sanctioned_kw, volts, pf, total_kw: total_w / 1000, amps: total_w / (volts * pf), within_sanctioned: total_w / 1000 <= sanctioned_kw, load_pct: (total_w / 1000 / sanctioned_kw) * 100 };
});
