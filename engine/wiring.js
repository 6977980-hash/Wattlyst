// W. Wiring (specs/formulas.md section W). Advisory only: every page shows "confirm with a licensed electrician".
import { calculator, CalcError, has, num, pos, frac, pick, dflt } from './core.js';

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
