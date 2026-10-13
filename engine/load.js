// E. Load, AC, units (specs/formulas.md section E) and load/cost tools from section G.
import { calculator, CalcError, has, pos, frac, nonneg, num, dflt, appliance } from './core.js';
import { sumLoads, loadRows } from './sizing.js';
import { breaker_size } from './wiring.js';

/**
 * E5: units_day = avg_kW × hours; monthly = daily × days.
 * `ac` = an air conditioner id from data/appliances.json (its avg_w is the planning average, formulas.md E)
 * or "custom" (then avg_kw is required).
 */
export const ac_units = calculator((i, d) => {
  const out = {};
  let avg_kw;
  if (has(i, 'ac') && String(i.ac).trim() !== 'custom') {
    const ac = appliance(d, i.ac, 'ac');
    if (!(ac.avg_w > 0)) throw new CalcError('appliance_unknown', 'ac');
    avg_kw = ac.avg_w / 1000;
    Object.assign(out, { ac: String(i.ac).trim(), ac_name: ac.name, ac_rated_w: ac.running_w });
  } else {
    avg_kw = pos(i, 'avg_kw');
  }
  const hours = nonneg(i, 'hours');
  const days = nonneg(i, 'days', dflt(d, 'days_per_month'));
  const daily_units = avg_kw * hours;
  Object.assign(out, { avg_kw, hours, days, daily_units, monthly_units: daily_units * days });
  if (has(i, 'tariff')) {
    const tariff = nonneg(i, 'tariff');
    Object.assign(out, { tariff, hourly_rs: avg_kw * tariff, daily_rs: daily_units * tariff, monthly_rs: out.monthly_units * tariff });
  }
  return out;
});

/**
 * E1: home load from an appliance list. Running W = Σ run × qty; peak W adds the largest starting step
 * (formulas.md C); amps = W / (V × PF); daily units = Σ run × qty × hours / 1000; monthly = daily × days.
 */
export const home_load = calculator((i, d) => {
  const rows = loadRows(i.loads, d);
  const { running_w, surge_w } = sumLoads(rows);
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const days = nonneg(i, 'days', dflt(d, 'days_per_month'));
  const daily_kwh = rows.reduce((s, r) => s + r.energy_w * r.qty * r.hours, 0) / 1000;
  const out = {
    appliances: rows.length, items: rows.reduce((s, r) => s + r.qty, 0), running_w, running_kw: running_w / 1000, peak_w: surge_w, volts, pf,
    amps: running_w / (volts * pf), peak_amps: surge_w / (volts * pf), days, daily_kwh, monthly_units: daily_kwh * days,
    largest_w: Math.max(...rows.map((r) => r.run)),
  };
  if (has(i, 'tariff')) {
    out.tariff = nonneg(i, 'tariff');
    out.monthly_rs = out.monthly_units * out.tariff;
  }
  if (has(i, 'sanctioned_kw')) {
    out.sanctioned_kw = pos(i, 'sanctioned_kw');
    out.within_sanctioned = running_w / 1000 <= out.sanctioned_kw;
    out.load_pct = (running_w / 1000 / out.sanctioned_kw) * 100;
  }
  return out;
});

/**
 * E4: can the home take another AC? New total = current running W + the AC's running W; peak adds its
 * starting step; amps = W / (V × PF); checked against the sanctioned load; MCB and cable for the AC's own circuit from breaker_size (formulas.md W).
 */
export const add_ac_check = calculator((i, d) => {
  const current_w = nonneg(i, 'current_w');
  const ac = appliance(d, i.ac, 'ac');
  const sanctioned_kw = pos(i, 'sanctioned_kw', dflt(d, 'default_sanctioned_kw'));
  const volts = pos(i, 'volts', dflt(d, 'v_1ph'));
  const pf = frac(i, 'pf', dflt(d, 'pf_mixed'));
  const new_total_w = current_w + ac.running_w;
  const peak_w = current_w + ac.starting_w;
  // The AC's own circuit follows the wiring pages' rule (formulas.md W): inverter AC at its maximum input, motor-type margin on the MCB.
  const circuit = breaker_size.raw({ appliance: i.ac, volts, pf, margin: i.margin }, d);
  return {
    current_w, ac: i.ac.trim(), ac_name: ac.name, ac_run_w: ac.running_w, ac_start_w: ac.starting_w, sanctioned_kw, volts, pf,
    new_total_w, new_total_kw: new_total_w / 1000, peak_w, amps_now: current_w / (volts * pf), amps_after: new_total_w / (volts * pf), peak_amps: peak_w / (volts * pf),
    within_sanctioned: new_total_w / 1000 <= sanctioned_kw, load_pct: (new_total_w / 1000 / sanctioned_kw) * 100, headroom_kw: Math.max(0, sanctioned_kw - new_total_w / 1000),
    ac_run_amps: ac.running_w / (volts * pf), ac_ib_a: circuit.ib_a, ac_design_w: circuit.watts, ac_breaker_a: circuit.breaker_a, ac_curve: circuit.curve, ac_cable_a: circuit.min_cable_a, ac_cable_mm2: circuit.area_mm2, ac_pk_size: circuit.pk_size,
  };
});

/**
 * N5 heating cost per hour for heat output Q (kW):
 * AC heat pump = Q / COP × tariff; electric heater = Q × tariff; gas = Q / η_gas × 3.6 / CV × gas_price (Rs/m³).
 */
export const heating_cost = calculator((i, d) => {
  const q_kw = pos(i, 'q_kw');
  const cop = pos(i, 'cop', dflt(d, 'heat_pump_cop'));
  const tariff = nonneg(i, 'tariff');
  const out = { q_kw, cop, tariff, ac_rs_per_h: (q_kw / cop) * tariff, heater_rs_per_h: q_kw * tariff };
  if (has(i, 'gas_price')) {
    const gas_price = nonneg(i, 'gas_price');
    const eta_gas = frac(i, 'eta_gas', dflt(d, 'gas_heater_eff'));
    const cv = pos(i, 'cv_mj_m3', dflt(d, 'gas_cv_mj_m3'));
    const m3_per_h = ((q_kw / eta_gas) * 3.6) / cv;
    Object.assign(out, { gas_price, eta_gas, cv_mj_m3: cv, gas_m3_per_h: m3_per_h, gas_rs_per_h: m3_per_h * gas_price });
  }
  return out;
});

/**
 * N9 rule of thumb: saving% = per_degree × (T_new − T_old), capped at 100%.
 * Lowering the set point returns extra_pct / extra_units instead of a negative saving.
 */
export const ac_temp = calculator((i, d) => {
  const [tmin, tmax] = dflt(d, 'ac_setpoint_range_c');
  const t_old = num(i, 't_old', { min: tmin, max: tmax });
  const t_new = num(i, 't_new', { min: tmin, max: tmax });
  const per_degree = num(i, 'per_degree', { def: dflt(d, 'ac_saving_per_degree'), min: 0, max: dflt(d, 'ac_saving_per_degree_max') });
  const monthly_units = nonneg(i, 'monthly_units');
  const pct = Math.min(1, per_degree * Math.abs(t_new - t_old));
  if (t_new >= t_old) return { t_old, t_new, per_degree, monthly_units, saving_pct: pct, units_saved: monthly_units * pct };
  return { t_old, t_new, per_degree, monthly_units, saving_pct: 0, units_saved: 0, extra_pct: pct, extra_units: monthly_units * pct };
});

/** N10: annual saving = (kW_noninv − kW_inv) × hours/yr × tariff; payback months = price diff / (saving / 12). */
export const ac_payback = calculator((i) => {
  const kw_noninv = pos(i, 'kw_noninv');
  const kw_inv = pos(i, 'kw_inv');
  if (kw_inv >= kw_noninv) throw new CalcError('inverter_ac_must_use_less', 'kw_inv');
  const hours_year = pos(i, 'hours_year');
  const tariff = pos(i, 'tariff');
  const price_diff = nonneg(i, 'price_diff');
  const annual_units_saved = (kw_noninv - kw_inv) * hours_year;
  const annual_saving = annual_units_saved * tariff;
  return { kw_noninv, kw_inv, hours_year, tariff, price_diff, annual_units_saved, annual_saving, payback_months: price_diff / (annual_saving / 12) };
});

/**
 * N7 total cost of ownership over `years`:
 * TCO = capex + years × (energy_cost_per_year + maintenance_per_year) + replacements × replacement_cost.
 * replacements = floor((years − ε) / life_years) (no replacement in the final year of life).
 */
export const tco = calculator((i) => {
  const capex = nonneg(i, 'capex');
  const years = pos(i, 'years');
  const energy_cost_per_year = nonneg(i, 'energy_cost_per_year', 0);
  const maintenance_per_year = nonneg(i, 'maintenance_per_year', 0);
  let replacements = 0;
  let replacement_cost = 0;
  if (has(i, 'life_years')) {
    const life_years = pos(i, 'life_years');
    replacement_cost = nonneg(i, 'replacement_cost');
    replacements = Math.max(0, Math.floor((years - 1e-9) / life_years));
  }
  const running = years * (energy_cost_per_year + maintenance_per_year);
  return { capex, years, running_rs: running, replacements, replacements_rs: replacements * replacement_cost, tco_rs: capex + running + replacements * replacement_cost };
});

/** UPS grid recharge energy: kWh drawn = backup kWh / (η_chg × η_inv). */
export const ups_recharge_energy = calculator((i, d) => {
  const backup_kwh = nonneg(i, 'backup_kwh');
  const charge_eff = frac(i, 'charge_eff', dflt(d, 'charge_eff_lead_acid'));
  const inverter_eff = frac(i, 'inverter_eff', dflt(d, 'inverter_eff_ups'));
  return { backup_kwh, charge_eff, inverter_eff, grid_kwh: backup_kwh / (charge_eff * inverter_eff) };
});
