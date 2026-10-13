// C. Inverter & generator sizing (specs/formulas.md section C), sanctioned load (G, N4).
import { calculator, CalcError, num, pos, frac, nonneg, ceilSafe, dflt } from './core.js';

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

/** Generator: kVA = max(P_run × margin, P_surge) / PF / 1000. PF 0.8 nameplate convention. */
export const generator_size = calculator((i, d) => {
  const { running_w, surge_w } = sumLoads(i.loads);
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const pf = frac(i, 'pf', dflt(d, 'pf_generator'));
  const sized_w = Math.max(running_w * margin, surge_w);
  return { running_w, peak_w: surge_w, margin, pf, sized_w, recommended_kva: sized_w / pf / 1000, recommended_kw: sized_w / 1000 };
});

/**
 * N4: demand = connected × diversity; recommended = ceil(max(demand, largest motor start kW)).
 * ≥ 5 kW: ToU meter mandatory and not protected. Net-billing cap = sanctioned kW.
 */
export const sanctioned_load = calculator((i, d) => {
  let connected_kw;
  if (Array.isArray(i.appliances_w)) {
    connected_kw = i.appliances_w.reduce((s, w, idx) => s + num({ w }, 'w', { min: 0, code: `appliance_${idx}_invalid` }), 0) / 1000;
  } else {
    connected_kw = pos(i, 'connected_kw');
  }
  const diversity = frac(i, 'diversity', dflt(d, 'diversity_home'));
  const largest_start_kw = nonneg(i, 'largest_start_kw', 0);
  const demand_kw = connected_kw * diversity;
  const recommended_kw = Math.max(1, ceilSafe(Math.max(demand_kw, largest_start_kw)));
  const tou_kw = dflt(d, 'tou_threshold_kw');
  return { connected_kw, diversity, demand_kw, largest_start_kw, recommended_kw, tou_warning: recommended_kw >= tou_kw, net_billing_cap_kw: recommended_kw };
});

/** E: load check against sanctioned kW; amps = W / (V × PF). */
export const load_check = calculator((i, d) => {
  const total_w = pos(i, 'total_w', undefined, 'load_must_be_positive');
  const sanctioned_kw = pos(i, 'sanctioned_kw');
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  return { total_w, sanctioned_kw, volts, pf, total_kw: total_w / 1000, amps: total_w / (volts * pf), within_sanctioned: total_w / 1000 <= sanctioned_kw, load_pct: (total_w / 1000 / sanctioned_kw) * 100 };
});
