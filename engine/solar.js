// D. Solar (specs/formulas.md section D) and solar tools from section G.
import { calculator, CalcError, has, pos, frac, ceilSafe, dflt, num, appliance, bool } from './core.js';
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

/** E = monthly_units / days_per_month (or daily_kwh); kWp = E / yield; panels = ceil(kWp × 1000 / panel_W). */
export const solar_size = calculator((i, d) => {
  let daily_kwh;
  const echo = {}; // the monthly units entered, for the page text (audit WL-23)
  if (has(i, 'daily_kwh')) daily_kwh = pos(i, 'daily_kwh');
  else {
    echo.monthly_units = pos(i, 'monthly_units', undefined, 'usage_required');
    daily_kwh = echo.monthly_units / dflt(d, 'days_per_month');
  }
  const y = yieldFor(i, d);
  const panel_w = pos(i, 'panel_w', dflt(d, 'panel_w'));
  const kw = daily_kwh / y.yield_kwh_per_kwp_day;
  const panels = ceilSafe((kw * 1000) / panel_w);
  const installed_kw = (panels * panel_w) / 1000;
  return {
    ...echo, daily_kwh, ...y, panel_w, kw, panels, installed_kw,
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
  const psh = num(i, 'psh', { gt: 0, max: dflt(d, 'psh_max') }); // a day has at most about twelve sun hours (WL-129)
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
    out.panel_above_standard_sizes = true; // the notice says the sizes shown are minimums (WL-131)
    fitted_w = out.panels_of_largest * sizes[sizes.length - 1];
  }
  // Charging time with the fitted panel on a sunny day, and the MPPT controller it needs (formulas.md D).
  out.fitted_panel_w = fitted_w;
  out.panels_fitted = out.panels_of_largest ?? 1;
  out.charge_hours = (ah * volts * dod) / charge_eff / (fitted_w * pr);
  out.charge_days = out.charge_hours / psh;
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  out.margin = margin;
  out.controller_a = (fitted_w / volts) * margin;
  const controllers = dflt(d, 'standard_controller_a');
  const standard_controller_a = controllers.find((s) => s >= out.controller_a - 1e-9);
  if (standard_controller_a !== undefined) out.standard_controller_a = standard_controller_a;
  else out.controller_above_standard_sizes = true;
  return out;
});

/**
 * Panels, inverter and (optional) night battery for a daily energy and a running/starting load. `power` = the array
 * must also carry the running load at midday (off-grid D3, solar-only loads D5 and D15); a grid-tied or hybrid array
 * (D8 house lists, H1) is sized by energy only, because the grid covers the midday peak (audit WL-92, [ENGINEER]).
 */
function solarSystem(daily_kwh, running_w, surge_w, i, d, power = true) {
  const y = yieldFor(i, d);
  const panel_w = pos(i, 'panel_w', dflt(d, 'panel_w'));
  const pr = frac(i, 'pr', dflt(d, 'pr'));
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  const night_hours = num(i, 'night_hours', { def: 0, min: 0, max: 24 });
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
  if (bool(i.off_grid) && bat) {
    const charge_eff = frac(i, 'charge_eff', bat.dod > dflt(d, 'dod_lead_acid') ? dflt(d, 'charge_eff_lifepo4') : dflt(d, 'charge_eff_lead_acid'));
    const load_kwh = Math.max(daily_kwh, night_kwh);
    array_kwh = load_kwh - night_kwh + night_kwh / (bat.inverter_eff * charge_eff);
    offgrid = { off_grid: true, charge_eff, battery_inverter_eff: bat.inverter_eff, load_kwh, day_kwh: load_kwh - night_kwh };
  }
  // Energy: the array must make the day's kWh. Power: where it applies, at midday it must also carry the running
  // load (kWp × PR ≥ P_run); kw_power is still returned for the pages that show it next to the energy rule.
  const kw_energy = array_kwh / y.yield_kwh_per_kwp_day;
  const kw_power = running_w / 1000 / pr;
  const kw = power ? Math.max(kw_energy, kw_power) : kw_energy;
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
    power_rule: power,
    limited_by: power && kw_power > kw_energy ? 'power' : 'energy',
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
  const hours = num(i, 'hours', { def: ac.typical_hours_per_day ?? 0, min: 0, max: 24 });
  const avg_w = ac.avg_w ?? ac.running_w;
  const daily_kwh = (avg_w * hours) / 1000;
  return { ac: i.ac.trim(), ac_name: ac.name, ac_run_w: ac.running_w, ac_start_w: ac.starting_w, ac_avg_w: avg_w, hours, ...solarSystem(daily_kwh, ac.running_w, ac.starting_w, i, d) };
});

/**
 * D8: solar system from an appliance list (same rows as home_load): daily kWh and running load → panels, inverter, battery.
 * Grid-tied and hybrid lists are sized by energy; only an off-grid list (D3) keeps the midday power rule (WL-92).
 */
export const solar_from_loads = calculator((i, d) => {
  const rows = loadRows(i.loads, d);
  const { running_w, surge_w } = sumLoads(rows);
  const daily_kwh = rows.reduce((s, r) => s + r.energy_w * r.qty * r.hours, 0) / 1000;
  if (!(daily_kwh > 0)) throw new CalcError('hours_required', 'loads');
  return { appliances: rows.length, ...solarSystem(daily_kwh, running_w, surge_w, i, d, bool(i.off_grid)) };
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
  const hours = num(i, 'hours', { gt: 0, max: 24 });
  const pump_w = (hp * dflt(d, 'w_per_hp')) / motor_eff;
  const sys = solarSystem((pump_w * hours) / 1000, pump_w, pump_w, i, d);
  // motor_kw = rated shaft output; the drive is chosen at or above it (and the nameplate current), never below the input × margin floor.
  return { hp, motor_eff, hours, pump_w, pump_kw: pump_w / 1000, motor_kw: (hp * dflt(d, 'w_per_hp')) / 1000, ...sys, drive_kw: sys.inverter_kw };
});
