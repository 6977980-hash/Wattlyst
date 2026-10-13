// E. Load, AC, units (specs/formulas.md section E) and load/cost tools from section G.
import { calculator, CalcError, pos, frac, nonneg, num, dflt } from './core.js';

/** units_day = avg_kW × hours; monthly = daily × days. */
export const ac_units = calculator((i, d) => {
  const avg_kw = pos(i, 'avg_kw');
  const hours = nonneg(i, 'hours');
  const days = nonneg(i, 'days', dflt(d, 'days_per_month'));
  const daily_units = avg_kw * hours;
  const out = { avg_kw, hours, days, daily_units, monthly_units: daily_units * days };
  if (i.tariff !== undefined && i.tariff !== '') out.monthly_rs = out.monthly_units * nonneg(i, 'tariff');
  return out;
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
  if (i.gas_price !== undefined && i.gas_price !== '') {
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
  const t_old = num(i, 't_old', { min: 16, max: 30 });
  const t_new = num(i, 't_new', { min: 16, max: 30 });
  const per_degree = num(i, 'per_degree', { def: dflt(d, 'ac_saving_per_degree'), min: 0, max: 0.2 });
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
  if (i.life_years !== undefined && i.life_years !== '') {
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
