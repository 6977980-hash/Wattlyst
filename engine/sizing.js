// C. Inverter & generator sizing (specs/formulas.md section C), sanctioned load (G, N4).
import { calculator, CalcError, num, pos, frac, nonneg, ceilSafe, dflt, appliance } from './core.js';

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

/** Inverter: continuous ≥ P_run × margin; surge ≥ P_surge; kVA = P_run × margin / PF / 1000. */
export const inverter_size = calculator((i, d) => {
  const { running_w, surge_w } = sumLoads(i.loads);
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const continuous_w = running_w * margin;
  return { running_w, surge_w, margin, pf, continuous_w, kva: continuous_w / pf / 1000 };
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
  const out = { running_w, peak_w: surge_w, margin, pf, sized_w, recommended_kva, recommended_kw: sized_w / 1000, above_standard_sizes: standard_kva === undefined };
  if (standard_kva !== undefined) out.standard_kva = standard_kva;
  return out;
}

export const generator_size = calculator((i, d) => generatorFor(i.loads, i, d));

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
