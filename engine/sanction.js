// Sanctioned load (specs/formulas.md N4, E3 load check, E4 add an AC): one rule for the kW a home needs (WL-110).
// Its own module, so the appliance pages on load.js do not ship it.
import { calculator, CalcError, num, pos, frac, nonneg, ceilSafe, dflt, appliance } from './core.js';
import { breaker_size } from './wiring.js';

/** N4 rule, shared with E4 (WL-110): demand = connected kW × diversity; sanctioned load = max(min kW, ceil(demand)). [ENGINEER] */
export function sanctionedFor(connected_kw, diversity, d) {
  const demand_kw = connected_kw * diversity;
  return { demand_kw, recommended_kw: Math.max(dflt(d, 'min_sanctioned_kw'), ceilSafe(demand_kw)) };
}

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
  const { demand_kw, recommended_kw } = sanctionedFor(connected_kw, diversity, d);
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

/**
 * E4: can the home take another AC? New total = current running W + the AC's running W; peak adds its
 * starting step; amps = W / (V × PF); the sanctioned load it needs follows the N4 rule (demand = new total × diversity,
 * rounded up to a whole kW, WL-110) and is checked against the bill's sanctioned load; MCB and cable for the AC's own
 * circuit from breaker_size (formulas.md W).
 */
export const add_ac_check = calculator((i, d) => {
  const current_w = nonneg(i, 'current_w');
  const ac = appliance(d, i.ac, 'ac');
  const sanctioned_kw = pos(i, 'sanctioned_kw', dflt(d, 'default_sanctioned_kw'));
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const new_total_w = current_w + ac.running_w;
  const peak_w = current_w + ac.starting_w;
  const diversity = frac(i, 'diversity', dflt(d, 'diversity_home'));
  const { demand_kw, recommended_kw: needed_kw } = sanctionedFor(new_total_w / 1000, diversity, d);
  // The AC's own circuit follows the wiring pages' rule (formulas.md W): inverter AC at its maximum input, the AC's own
  // power factor (not the home's mixed PF), motor-type margin on the MCB, cable derated as on the wiring pages.
  const circuit = breaker_size.raw({ appliance: i.ac, volts, margin: i.margin, ambient_c: i.ambient_c, circuits: i.circuits }, d);
  return {
    current_w, ac: i.ac.trim(), ac_name: ac.name, ac_run_w: ac.running_w, ac_start_w: ac.starting_w, sanctioned_kw, volts, pf,
    new_total_w, new_total_kw: new_total_w / 1000, peak_w, amps_now: current_w / (volts * pf), amps_after: new_total_w / (volts * pf), peak_amps: peak_w / (volts * pf),
    diversity, demand_kw, needed_kw, needed_tou: needed_kw >= dflt(d, 'tou_threshold_kw'),
    verdict: needed_kw <= sanctioned_kw ? 'is within the sanctioned load' : `needs a higher sanctioned load first, at least ${needed_kw} kW`,
    within_sanctioned: needed_kw <= sanctioned_kw, load_pct: (demand_kw / sanctioned_kw) * 100, headroom_kw: Math.max(0, sanctioned_kw - demand_kw),
    ac_run_amps: ac.running_w / (volts * circuit.pf), ac_ib_a: circuit.ib_a, ac_design_w: circuit.watts, ac_breaker_a: circuit.breaker_a, ac_curve: circuit.curve, ac_cable_a: circuit.min_cable_a, ac_pf: circuit.pf, ac_cable_mm2: circuit.area_mm2, ac_cable_rating_a: circuit.ampacity_a, ac_pk_size: circuit.pk_size, ambient_c: circuit.ambient_c,
  };
});
