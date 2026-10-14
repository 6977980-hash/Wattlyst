// B. Battery / UPS (specs/formulas.md section B) and battery tools from section G.
import { calculator, CalcError, has, pos, frac, nonneg, pick, ceilSafe, dflt, num } from './core.js';

const CHEMISTRIES = ['tubular', 'lead_acid', 'agm', 'gel', 'lifepo4'];

/** Usable DoD: explicit input wins, else the chemistry default from data/defaults.json. */
function dodFor(i, d) {
  const chemistry = pick(i, 'chemistry', CHEMISTRIES, 'tubular');
  const def = chemistry === 'lifepo4' ? dflt(d, 'dod_lifepo4') : dflt(d, 'dod_lead_acid');
  return { chemistry, dod: frac(i, 'dod', def) };
}

function chargeEffFor(chemistry, i, d) {
  const def = chemistry === 'lifepo4' ? dflt(d, 'charge_eff_lifepo4') : dflt(d, 'charge_eff_lead_acid');
  return frac(i, 'charge_eff', def);
}

/** t_h = (Ah × V_bank × DoD × η_inv) / P_load. DC load: pass inverter_eff = 1. */
export const battery_runtime = calculator((i, d) => {
  const ah = pos(i, 'ah');
  const volts = pos(i, 'volts');
  const { chemistry, dod } = dodFor(i, d);
  const inverter_eff = frac(i, 'inverter_eff', dflt(d, 'inverter_eff_ups'));
  const load_w = pos(i, 'load_w', undefined, 'load_must_be_positive');
  const usable_wh = ah * volts * dod * inverter_eff;
  const hours = usable_wh / load_w;
  return { chemistry, ah, volts, dod, inverter_eff, load_w, usable_wh, hours, minutes: hours * 60 };
});

/**
 * Ah = (P_load × t_h) / (V_bank × DoD × η_inv).
 * If battery_ah and battery_v are given: batteries = ceil(Ah / battery_ah) parallel strings × (V_bank / battery_v) in series.
 */
export const battery_bank = calculator((i, d) => {
  const load_w = pos(i, 'load_w', undefined, 'load_must_be_positive');
  const hours = pos(i, 'hours');
  const volts = pos(i, 'volts');
  const { chemistry, dod } = dodFor(i, d);
  const inverter_eff = frac(i, 'inverter_eff', dflt(d, 'inverter_eff_ups'));
  const ah_required = (load_w * hours) / (volts * dod * inverter_eff);
  const out = { chemistry, load_w, hours, volts, dod, inverter_eff, load_kwh: (load_w * hours) / 1000, ah_required, kwh_required: (ah_required * volts) / 1000 };
  if (has(i, 'battery_ah')) {
    const battery_ah = pos(i, 'battery_ah');
    const battery_v = pos(i, 'battery_v');
    const series = volts / battery_v;
    if (Math.abs(series - Math.round(series)) > 1e-9) throw new CalcError('bank_voltage_not_multiple_of_battery', 'battery_v');
    const strings = ceilSafe(ah_required / battery_ah);
    Object.assign(out, { battery_ah, battery_v, series: Math.round(series), strings, batteries: strings * Math.round(series) });
  }
  return out;
});

/** t_recharge = (Ah × DoD) / (I_charge × η_chg); fully recharged if t_recharge ≤ grid hours between outages. */
export const loadshedding = calculator((i, d) => {
  const ah = pos(i, 'ah');
  const { chemistry, dod } = dodFor(i, d);
  const charge_a = pos(i, 'charge_a');
  const charge_eff = chargeEffFor(chemistry, i, d);
  const grid_hours_between = nonneg(i, 'grid_hours_between');
  const recharge_hours = (ah * dod) / (charge_a * charge_eff);
  return { ah, dod, charge_a, charge_eff, grid_hours_between, recharge_hours, fully_recharged: recharge_hours <= grid_hours_between };
});

/** P_max = VA × PF; ok if load ≤ P_max and (if given) surge ≤ surge rating. */
export const ups_capacity = calculator((i, d) => {
  const va = pos(i, 'va');
  const pf = frac(i, 'pf', dflt(d, 'pf_ups_line_interactive'));
  const load_w = pos(i, 'load_w', undefined, 'load_must_be_positive');
  const max_w = va * pf;
  let ok = load_w <= max_w;
  const out = { va, pf, load_w, max_w, load_pct: (load_w / max_w) * 100 };
  if (has(i, 'surge_w') || has(i, 'surge_rating_w')) {
    const surge_w = nonneg(i, 'surge_w');
    const surge_rating_w = pos(i, 'surge_rating_w');
    out.surge_ok = surge_w <= surge_rating_w;
    ok = ok && out.surge_ok;
  }
  out.can_run = ok;
  return out;
});

/**
 * B5: UPS backup = capacity check (P_max = VA × PF, load must fit) + runtime of its battery through the inverter.
 * The load is rejected when it exceeds the UPS rating, because the UPS would trip, not run shorter.
 */
export const ups_backup = calculator((i, d) => {
  const cap = ups_capacity.raw(i, d);
  if (!cap.can_run) throw new CalcError(cap.surge_ok === false ? 'surge_exceeds_ups_rating' : 'load_exceeds_ups_rating', 'load_w');
  const run = battery_runtime.raw(i, d);
  return { ...cap, ...run };
});

/** N11: V_total = n_series × V; Ah_total = n_parallel × Ah; kWh = V_total × Ah_total / 1000. Identical batteries only. */
export const series_parallel = calculator((i) => {
  const n_series = num(i, 'n_series', { min: 1 });
  const n_parallel = num(i, 'n_parallel', { min: 1 });
  if (!Number.isInteger(n_series)) throw new CalcError('n_series_must_be_whole', 'n_series');
  if (!Number.isInteger(n_parallel)) throw new CalcError('n_parallel_must_be_whole', 'n_parallel');
  const v = pos(i, 'v');
  const ah = pos(i, 'ah');
  const v_total = n_series * v;
  const ah_total = n_parallel * ah;
  return { n_series, n_parallel, batteries: n_series * n_parallel, v_total, ah_total, kwh: (v_total * ah_total) / 1000 };
});

/** N8: kWh_charge = Ah × V / 1000 / η_charger; Rs/charge = kWh × tariff; Rs/km = Rs/charge / range. */
export const ebike = calculator((i, d) => {
  const v = pos(i, 'v');
  const ah = pos(i, 'ah');
  const eta = frac(i, 'eta', dflt(d, 'ebike_charger_eff'));
  const tariff = nonneg(i, 'tariff');
  const range_km = pos(i, 'range_km');
  const kwh = (ah * v) / 1000 / eta;
  const rs_per_charge = kwh * tariff;
  return { v, ah, eta, tariff, range_km, kwh, rs_per_charge, rs_per_km: rs_per_charge / range_km };
});
