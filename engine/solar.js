// D. Solar (specs/formulas.md section D) and solar tools from section G.
import { calculator, CalcError, has, pos, frac, nonneg, ceilSafe, dflt, num, appliance, pick } from './core.js';
import { sumLoads, loadRows } from './sizing.js';

/** Specific yield (kWh/kWp/day): explicit input > city from data/cities-pk.json > PSH × PR. */
function yieldFor(i, d) {
  if (has(i, 'yield_kwh_per_kwp_day')) {
    return { yield_kwh_per_kwp_day: pos(i, 'yield_kwh_per_kwp_day'), yield_source: 'input' };
  }
  if (i.city) {
    const c = d?.cities?.[String(i.city).trim().toLowerCase()];
    if (!c || !(c.yield > 0)) throw new CalcError('city_unknown', 'city');
    return { yield_kwh_per_kwp_day: c.yield, yield_source: 'city' };
  }
  const psh = pos(i, 'psh', undefined, 'yield_or_city_or_psh_required');
  const pr = frac(i, 'pr', dflt(d, 'pr'));
  return { yield_kwh_per_kwp_day: psh * pr, yield_source: 'psh', psh, pr };
}

/** E = monthly_units / 30 (or daily_kwh); kWp = E / yield; panels = ceil(kWp × 1000 / panel_W). */
export const solar_size = calculator((i, d) => {
  let daily_kwh;
  if (has(i, 'daily_kwh')) daily_kwh = pos(i, 'daily_kwh');
  else daily_kwh = pos(i, 'monthly_units', undefined, 'usage_required') / dflt(d, 'days_per_month');
  const y = yieldFor(i, d);
  const panel_w = pos(i, 'panel_w', dflt(d, 'panel_w'));
  const kw = daily_kwh / y.yield_kwh_per_kwp_day;
  const panels = ceilSafe((kw * 1000) / panel_w);
  const installed_kw = (panels * panel_w) / 1000;
  return {
    daily_kwh, ...y, panel_w, kw, panels, installed_kw,
    roof_m2: panels * dflt(d, 'panel_area_m2'),
    monthly_kwh_estimate: installed_kw * y.yield_kwh_per_kwp_day * dflt(d, 'days_per_month'),
  };
});

/** Solar battery: Ah = (E_night × days) / (V_bank × DoD × η_inv). */
export const solar_battery = calculator((i, d) => {
  const night_kwh = pos(i, 'night_kwh');
  const days = pos(i, 'days', 1);
  const volts = pos(i, 'volts');
  const dod = frac(i, 'dod', dflt(d, 'dod_lifepo4'));
  const inverter_eff = frac(i, 'inverter_eff', dflt(d, 'inverter_eff_hybrid'));
  const ah = (night_kwh * 1000 * days) / (volts * dod * inverter_eff);
  return { night_kwh, days, volts, dod, inverter_eff, ah, kwh: (ah * volts) / 1000 };
});

/** Panel for a battery: W = (Ah × V × DoD / η_chg) / (PSH × PR), then next standard panel size. PR covers heat, dust, wiring and PWM losses. */
export const panel_for_12v = calculator((i, d) => {
  const ah = pos(i, 'ah');
  const volts = pos(i, 'volts');
  const dod = frac(i, 'dod', dflt(d, 'dod_lead_acid'));
  const psh = pos(i, 'psh');
  const charge_eff = frac(i, 'charge_eff', dflt(d, 'charge_eff_lead_acid'));
  const pr = frac(i, 'pr', dflt(d, 'pr'));
  const panel_w = (ah * volts * dod) / charge_eff / (psh * pr);
  const sizes = dflt(d, 'standard_panel_w');
  const standard_panel_w = sizes.find((s) => s >= panel_w - 1e-9) ?? null;
  const out = { ah, volts, dod, psh, pr, charge_eff, panel_w };
  let fitted_w;
  if (standard_panel_w !== null) {
    out.standard_panel_w = standard_panel_w;
    fitted_w = standard_panel_w;
  } else {
    out.panels_of_largest = ceilSafe(panel_w / sizes[sizes.length - 1]);
    fitted_w = out.panels_of_largest * sizes[sizes.length - 1];
  }
  // Charging time with the fitted panel on a sunny day, and the MPPT controller it needs (formulas.md D).
  out.fitted_panel_w = fitted_w;
  out.charge_hours = (ah * volts * dod) / charge_eff / (fitted_w * pr);
  out.charge_days = out.charge_hours / psh;
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  out.controller_a = (fitted_w / volts) * margin;
  const controllers = dflt(d, 'standard_controller_a');
  const standard_controller_a = controllers.find((s) => s >= out.controller_a - 1e-9);
  if (standard_controller_a !== undefined) out.standard_controller_a = standard_controller_a;
  else out.controller_above_standard_sizes = true;
  return out;
});

/** Panels, inverter and (optional) night battery for a daily energy and a running/starting load. */
function solarSystem(daily_kwh, running_w, surge_w, i, d) {
  const y = yieldFor(i, d);
  const panel_w = pos(i, 'panel_w', dflt(d, 'panel_w'));
  const pr = frac(i, 'pr', dflt(d, 'pr'));
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const night_hours = nonneg(i, 'night_hours', 0);
  let bat = null;
  let night_kwh = 0;
  if (night_hours > 0) {
    night_kwh = (running_w * night_hours) / 1000;
    const volts = pos(i, 'battery_v', dflt(d, 'battery_v_default'));
    bat = { volts, ...solar_battery.raw({ night_kwh, volts, dod: i.dod, inverter_eff: i.inverter_eff }, d) };
  }
  // Off-grid: the panels alone must run the day's load and refill the battery for the night, which loses
  // energy in charging and in the inverter: E_array = (E_load − E_night) + E_night / (η_inv × η_charge),
  // with E_load = max(E_day, E_night) so the night assumption can never exceed the whole day.
  let array_kwh = daily_kwh;
  let offgrid = {};
  if (i.off_grid === true && bat) {
    const charge_eff = frac(i, 'charge_eff', bat.dod > dflt(d, 'dod_lead_acid') ? dflt(d, 'charge_eff_lifepo4') : dflt(d, 'charge_eff_lead_acid'));
    const load_kwh = Math.max(daily_kwh, night_kwh);
    array_kwh = load_kwh - night_kwh + night_kwh / (bat.inverter_eff * charge_eff);
    offgrid = { off_grid: true, charge_eff, battery_inverter_eff: bat.inverter_eff, load_kwh, day_kwh: load_kwh - night_kwh };
  }
  // Energy: the array must make the day's kWh. Power: at midday it must also carry the running load (kWp × PR ≥ P_run).
  const kw_energy = array_kwh / y.yield_kwh_per_kwp_day;
  const kw_power = running_w / 1000 / pr;
  const kw = Math.max(kw_energy, kw_power);
  const panels = ceilSafe((kw * 1000) / panel_w);
  const installed_kw = (panels * panel_w) / 1000;
  // Inverter continuous rating: carry the running load with margin, and do not let the array exceed the
  // inverter by more than the usual DC/AC oversize (formulas.md D5/D8): ≥ max(P_run × margin, kWp × 1000 / ratio_max).
  const load_w = running_w * margin;
  const dc_ac_ratio_max = dflt(d, 'dc_ac_ratio_max');
  const inverter_w = Math.max(load_w, (installed_kw * 1000) / dc_ac_ratio_max);
  const out = {
    daily_kwh, array_kwh, ...offgrid, running_w, surge_w, ...y, pr, panel_w, margin, kw_energy, kw_power, kw, panels, installed_kw,
    roof_m2: panels * dflt(d, 'panel_area_m2'),
    monthly_kwh_estimate: installed_kw * y.yield_kwh_per_kwp_day * dflt(d, 'days_per_month'),
    inverter_kw_load: load_w / 1000,
    inverter_kw_array: installed_kw / dc_ac_ratio_max,
    dc_ac_ratio_max,
    inverter_w,
    inverter_kw: inverter_w / 1000,
    inverter_surge_w: surge_w,
    limited_by: kw_power > kw_energy ? 'power' : 'energy',
  };
  if (bat) Object.assign(out, { night_hours, night_kwh, battery_v: bat.volts, battery_dod: bat.dod, battery_ah: bat.ah, battery_kwh: bat.kwh });
  return out;
}

/**
 * D5: solar to run an air conditioner. Daily kWh = average draw (avg_w, else running watts) × hours;
 * array = max(energy-based, power-based) so the AC runs on sun alone at midday; inverter ≥ running × margin, surge ≥ starting.
 */
export const solar_for_ac = calculator((i, d) => {
  const ac = appliance(d, i.ac, 'ac');
  const hours = nonneg(i, 'hours', ac.typical_hours_per_day ?? 0);
  const avg_w = ac.avg_w ?? ac.running_w;
  const daily_kwh = (avg_w * hours) / 1000;
  return { ac: i.ac.trim(), ac_name: ac.name, ac_run_w: ac.running_w, ac_start_w: ac.starting_w, ac_avg_w: avg_w, hours, ...solarSystem(daily_kwh, ac.running_w, ac.starting_w, i, d) };
});

/** D8: solar system from an appliance list (same rows as home_load): daily kWh and running load → panels, inverter, battery. */
export const solar_from_loads = calculator((i, d) => {
  const rows = loadRows(i.loads, d);
  const { running_w, surge_w } = sumLoads(rows);
  const daily_kwh = rows.reduce((s, r) => s + r.energy_w * r.qty * r.hours, 0) / 1000;
  if (!(daily_kwh > 0)) throw new CalcError('hours_required', 'loads');
  return { appliances: rows.length, ...solarSystem(daily_kwh, running_w, surge_w, i, d) };
});

/**
 * D15: solar for a tubewell / water pump run by a solar pump drive (VFD), no battery.
 * Pump input W = HP × 745.7 / motor efficiency (formulas.md A); daily kWh = input W × pumping hours;
 * array from the solar-system rule (energy and midday power); the drive soft-starts, so surge = running
 * [ENGINEER]; drive size ≥ input W × margin.
 */
export const solar_for_pump = calculator((i, d) => {
  const hp = pos(i, 'hp');
  const motor_eff = frac(i, 'motor_eff', dflt(d, 'motor_eff'));
  const hours = pos(i, 'hours');
  const pump_w = (hp * dflt(d, 'w_per_hp')) / motor_eff;
  const sys = solarSystem((pump_w * hours) / 1000, pump_w, pump_w, i, d);
  // motor_kw = rated shaft output; the drive is chosen at or above it (and the nameplate current), never below the input × margin floor.
  return { hp, motor_eff, hours, pump_w, pump_kw: pump_w / 1000, motor_kw: (hp * dflt(d, 'w_per_hp')) / 1000, ...sys, drive_kw: sys.inverter_kw };
});

/** MPPT: A = P_array / V_battery × margin. PWM: A = Isc × N_parallel × margin. */
export const charge_controller = calculator((i, d) => {
  const type = i.type ?? 'mppt';
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  let amps;
  if (type === 'mppt') {
    amps = (pos(i, 'panel_w') / pos(i, 'battery_v')) * margin;
  } else if (type === 'pwm') {
    const n_parallel = num(i, 'n_parallel', { def: 1, min: 1 });
    if (!Number.isInteger(n_parallel)) throw new CalcError('n_parallel_must_be_whole', 'n_parallel');
    amps = pos(i, 'isc') * n_parallel * margin;
  } else throw new CalcError('type_invalid', 'type');
  const sizes = dflt(d, 'standard_controller_a');
  const standard_a = sizes.find((s) => s >= amps - 1e-9);
  return standard_a === undefined ? { type, margin, amps, above_standard_sizes: true } : { type, margin, amps, standard_a, above_standard_sizes: false };
});

/**
 * N12: soiling = min(rate × days, cap); loss kWh/day = kWp × yield × soiling; Rs lost = loss × tariff.
 * If cleaning_cost given: first day where cumulative Rs lost since cleaning > cleaning cost.
 */
export const cleaning_loss = calculator((i, d) => {
  const kwp = pos(i, 'kwp');
  const y = pos(i, 'yield');
  const rate = num(i, 'rate', { def: dflt(d, 'soiling_rate_per_day'), min: 0, max: dflt(d, 'soiling_rate_max_per_day'), code: 'soiling_rate_invalid' });
  const days = nonneg(i, 'days');
  const tariff = nonneg(i, 'tariff');
  const cap = dflt(d, 'soiling_cap');
  const soiling = Math.min(rate * days, cap);
  const loss_kwh_day = kwp * y * soiling;
  const out = { kwp, yield: y, rate, days, tariff, soiling, soiling_capped: rate * days > cap, loss_kwh_day, rs_lost_day: loss_kwh_day * tariff };
  if (has(i, 'cleaning_cost')) {
    const cleaning_cost = nonneg(i, 'cleaning_cost');
    let cum = 0;
    let clean_after_days = null;
    for (let day = 1; day <= 365; day++) {
      cum += kwp * y * Math.min(rate * day, cap) * tariff;
      if (cum > cleaning_cost) { clean_after_days = day; break; }
    }
    out.cleaning_cost = cleaning_cost;
    out.clean_worth_it_within_year = clean_after_days !== null;
    if (clean_after_days !== null) out.clean_after_days = clean_after_days;
  }
  return out;
});

/** N14: days = (Ah × V × DoD × η_inv) / (daily load Wh − cloudy-day solar Wh); optional bank Ah for target_days. */
export const autonomy = calculator((i, d) => {
  const ah = pos(i, 'ah');
  const v = pos(i, 'v');
  const dod = frac(i, 'dod', dflt(d, 'dod_lead_acid'));
  const eta = frac(i, 'eta', dflt(d, 'inverter_eff_ups'));
  const load_wh = pos(i, 'load_wh', undefined, 'load_must_be_positive');
  const solar_wh = nonneg(i, 'solar_wh', 0);
  const deficit_wh = load_wh - solar_wh;
  if (deficit_wh <= 0) throw new CalcError('solar_covers_load', 'solar_wh');
  const usable_wh = ah * v * dod * eta;
  const out = { ah, v, dod, eta, load_wh, solar_wh, usable_wh, deficit_wh, days: usable_wh / deficit_wh };
  // Bank for a chosen number of cloudy days: Ah = days × (E_load − E_solar) ÷ (V × DoD × η).
  if (has(i, 'target_days')) {
    out.target_days = pos(i, 'target_days');
    out.target_ah = (out.target_days * deficit_wh) / (v * dod * eta);
  }
  return out;
});
