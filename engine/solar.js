// D. Solar (specs/formulas.md section D) and solar tools from section G.
import { calculator, CalcError, has, pos, frac, ceilSafe, dflt, num, appliance, bool } from './core.js';
import { sumLoads, loadRows } from './sizing.js';
import { fmt } from './format.js';

/** Next standard size at or above v (data/defaults.json list), undefined above the list (formulas.md D, WL-174). */
export const stdSize = (sizes, v) => sizes.find((s) => s >= v - 1e-9);

/** The size to buy as text: the standard size, or the minimum when it is above the list (WL-174). */
export const buyKw = (pick, kw, over = 'two units or a larger commercial one') => (pick === undefined ? `${fmt(kw, 'up2')} kW or more (above the sizes we list: ${over})` : `${fmt(pick, '2')} kW`);

/** Roof area of one panel: panel W × the area per watt of the listed size at or below it (data panel_area_m2_by_w; WL-232). */
const panelArea = (d, w) => {
  const rows = dflt(d, 'panel_area_m2_by_w');
  const [rw, ra] = rows.filter(([x]) => x <= w + 1e-9).pop() || rows[0];
  return (ra / rw) * w;
};

/**
 * One panel's string voltages at the hot and cold cell temperatures (data/defaults.json panel_*, [ENGINEER]):
 * V(T) = V_STC × (1 + coeff % / 100 × (T − 25)). Hybrid inverters need hot Voc ≥ start-up V and hot Vmp ≥ MPPT minimum.
 */
export function panelVolts(d) {
  const at = (v, tc, t) => dflt(d, v) * (1 + (dflt(d, tc) / 100) * (dflt(d, t) - 25));
  return { vmp_hot: at('panel_vmp_v', 'panel_tc_vmp_pct', 'cell_temp_hot_c'), voc_hot: at('panel_voc_v', 'panel_tc_voc_pct', 'cell_temp_hot_c'), voc_cold: at('panel_voc_v', 'panel_tc_voc_pct', 'cell_temp_cold_c') };
}

/** Fewest panels in series that start a 48 V hybrid inverter and keep it in its MPPT range on a hot day (WL-230). */
export function hybridString(d) {
  const v = panelVolts(d);
  return Math.max(ceilSafe(dflt(d, 'hybrid_pv_start_v') / v.voc_hot), ceilSafe(dflt(d, 'hybrid_pv_mppt_min_v') / v.vmp_hot));
}

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
  const psh = has(i, 'psh') ? num(i, 'psh', { min: dflt(d, 'psh_min'), max: dflt(d, 'psh_max') }) : pos(i, 'psh', undefined, 'yield_or_city_or_psh_required');
  const pr = frac(i, 'pr', dflt(d, 'pr'));
  return { yield_kwh_per_kwp_day: psh * pr, yield_source: 'psh', psh, pr };
}

/** E = monthly_units / days_per_month (or daily_kwh); kWp = E / yield; panels = ceil(kWp × 1000 / panel_W). */
export const solar_size = calculator((i, d) => {
  let daily_kwh;
  const echo = {}; // the monthly units entered, for the page text (audit WL-23)
  if (has(i, 'daily_kwh')) {
    daily_kwh = pos(i, 'daily_kwh');
    if (has(i, 'monthly_units')) echo.usage_both = true; // both boxes filled: the daily figure wins, and the page says so (WL-222)
  } else {
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
    panel_area_m2: panelArea(d, panel_w), roof_m2: panels * panelArea(d, panel_w),
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
  const psh = num(i, 'psh', { min: dflt(d, 'psh_min'), max: dflt(d, 'psh_max') }); // about one to twelve sun hours a day (WL-129, WL-224)
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
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1, max: dflt(d, 'margin_max') });
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
 * Inverter (WL-171, [ENGINEER]): an inverter that carries the load (power rule, or night hours = a hybrid with a battery)
 * is ≥ max(P_run × margin, kWp × 1000 / ratio_max) with a surge rating ≥ P_start; an on-grid inverter (no battery) runs
 * beside the grid, so it is sized by the array alone, kWp × 1000 / ratio_max, and needs no surge rating.
 * `series` (D15): panels are bought in whole strings of that many panels in series.
 */
function solarSystem(daily_kwh, running_w, surge_w, i, d, power = true, series = 0) {
  const y = yieldFor(i, d);
  const panel_w = pos(i, 'panel_w', dflt(d, 'panel_w'));
  const pr = frac(i, 'pr', dflt(d, 'pr'));
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1, max: dflt(d, 'margin_max') });
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
  const need = ceilSafe((kw * 1000) / panel_w);
  const strings = series ? ceilSafe(need / series) : 1;
  const panels = series ? strings * series : need;
  const installed_kw = (panels * panel_w) / 1000;
  const load_w = running_w * margin;
  const dc_ac_ratio_max = dflt(d, 'dc_ac_ratio_max');
  const carries = power || night_hours > 0;
  const inverter_w = Math.max(carries ? load_w : 0, (installed_kw * 1000) / dc_ac_ratio_max);
  const pick = stdSize(dflt(d, 'standard_inverter_kw'), inverter_w / 1000);
  const out = {
    daily_kwh, array_kwh, ...offgrid, running_w, surge_w, ...y, pr, panel_w, margin, kw_energy, kw_power, kw, panels, installed_kw,
    panel_area_m2: panelArea(d, panel_w), roof_m2: panels * panelArea(d, panel_w),
    monthly_kwh_estimate: installed_kw * y.yield_kwh_per_kwp_day * dflt(d, 'days_per_month'),
    inverter_kw_load: load_w / 1000,
    inverter_kw_array: installed_kw / dc_ac_ratio_max,
    dc_ac_ratio_max,
    inverter_w,
    inverter_kw: inverter_w / 1000,
    grid_tied: !carries,
    power_rule: power,
    limited_by: power && kw_power > kw_energy ? 'power' : 'energy',
  };
  // One string of every panel on a cold morning: the inverter's maximum DC input sets how many strings (WL-175, [ENGINEER]).
  out.panel_voc_cold_v = panelVolts(d).voc_cold;
  out.array_voc_cold_v = panels * out.panel_voc_cold_v;
  if (carries) out.inverter_surge_w = surge_w;
  if (pick === undefined) out.inverter_above_standard_sizes = true;
  else out.inverter_pick_kw = pick;
  if (series) Object.assign(out, { panels_energy: need, series, strings });
  if (bat) Object.assign(out, { night_hours, night_kwh, battery_v: bat.volts, battery_dod: bat.dod, battery_ah: bat.ah, battery_kwh: bat.kwh });
  // The inverter and battery steps as one sentence for the page's "how" text: it differs by system type (WL-169, WL-171).
  const f = (v, s = '2') => fmt(v, s);
  const size = buyKw(pick, out.inverter_kw);
  out.inverter_buy = size;
  out.inverter_text = (carries
    ? `Inverter: it carries the load${power ? '' : ' in a power cut'}, so the larger of ${f(running_w, 'int')} W × ${f(margin)} = ${f(out.inverter_kw_load, 'up2')} kW and ${f(installed_kw)} kW of panels ÷ ${f(dc_ac_ratio_max, '1')} = ${f(out.inverter_kw_array, 'up2')} kW: at least ${f(out.inverter_kw, 'up2')} kW, so the inverter to buy is ${size}, with a surge rating of at least ${f(surge_w, 'int')} W.`
    : `Inverter: an on-grid inverter runs beside the grid, which starts motors and covers any shortfall, so it is sized by the panels: ${f(installed_kw)} kW ÷ ${f(dc_ac_ratio_max, '1')} = at least ${f(out.inverter_kw, 'up2')} kW, so the on-grid inverter to buy is ${size}; no surge rating is needed.`)
    + (bat ? ` Battery for ${f(night_hours, '1')} h after sunset: ${f(running_w, 'int')} W × ${f(night_hours, '1')} h = ${f(night_kwh)} kWh ÷ (${f(bat.volts, '1')} V × ${f(bat.dod, 'pct')} usable × ${f(bat.inverter_eff, 'pct')} inverter) = ${f(bat.ah, 'up')} Ah, ${f(bat.kwh, '1')} kWh, on a hybrid inverter.` : '');
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
  // A blank hours box takes the AC's typical hours: the result says so (WL-221).
  return { ac: i.ac.trim(), ac_name: ac.name, ac_run_w: ac.running_w, ac_start_w: ac.starting_w, ac_avg_w: avg_w, hours, ...solarSystem(daily_kwh, ac.running_w, ac.starting_w, i, d), ...(has(i, 'hours') ? {} : { typical_used: true }) };
});

/**
 * D8: solar system from an appliance list (same rows as home_load): daily kWh and running load → panels, inverter, battery.
 * Grid-tied and hybrid lists are sized by energy; only an off-grid list (D3) keeps the midday power rule (WL-92).
 */
export const solar_from_loads = calculator((i, d) => {
  const rows = loadRows(i.loads, d);
  const { running_w, surge_w } = sumLoads(rows);
  const daily_kwh = rows.reduce((s, r) => s + r.energy_w * r.qty * r.hours, 0) / 1000;
  if (!(daily_kwh > 0)) throw new CalcError('loads_hours_required', 'loads'); // its own code: a plain "hours" box gets the field message (WL-226)
  return { appliances: rows.length, ...solarSystem(daily_kwh, running_w, surge_w, i, d, bool(i.off_grid)) };
});

/**
 * D15: solar for a tubewell / water pump run by a solar pump drive (VFD), no battery.
 * Pump input W = HP × 745.7 / motor efficiency (formulas.md A); daily kWh = input W × pumping hours;
 * array from the solar-system rule (energy and midday power), bought in whole strings: the drive gives the motor its
 * rated voltage only when the string's hot Vmp reaches pump_dc_bus_factor × motor V, so series = ceil(that ÷ panel hot Vmp)
 * (WL-172, [ENGINEER]). The drive soft-starts, so surge = running; drive ≥ max(input W × margin, motor kW), next standard
 * VFD size (WL-174); a larger array is clipped by the drive at midday [ENGINEER].
 */
export const solar_for_pump = calculator((i, d) => {
  const hp = pos(i, 'hp');
  const motor_eff = frac(i, 'motor_eff', dflt(d, 'motor_eff'));
  const hours = num(i, 'hours', { gt: 0, max: 24 });
  const motor_v = num(i, 'motor_v', { def: dflt(d, 'v_3ph'), min: 100, max: 1000 });
  // Only the listed motor voltages: the drive's DC limit is known for those (data pump_motor_v, vfd_max_dc_v).
  if (!dflt(d, 'pump_motor_v').includes(motor_v)) throw new CalcError('motor_v_invalid', 'motor_v');
  const pump_w = (hp * dflt(d, 'w_per_hp')) / motor_eff;
  const v = panelVolts(d);
  const bus_v = dflt(d, 'pump_dc_bus_factor') * motor_v;
  // Panels in series: enough for the drive's DC bus on a hot afternoon, but never above its maximum DC input on a cold
  // morning (data vfd_max_dc_v by motor voltage, Engineer Reviewer 2026-10-21); the cap wins and is flagged.
  const vmax = dflt(d, 'vfd_max_dc_v').find(([mv]) => mv >= motor_v - 1e-9)?.[1] ?? dflt(d, 'vfd_max_dc_v').at(-1)[1];
  const need = ceilSafe(bus_v / v.vmp_hot);
  const cap = Math.max(1, Math.floor(vmax / v.voc_cold + 1e-9));
  const sys = solarSystem((pump_w * hours) / 1000, pump_w, pump_w, i, d, true, Math.min(need, cap));
  const motor_kw = (hp * dflt(d, 'w_per_hp')) / 1000;
  const drive_kw = Math.max(sys.inverter_kw_load, motor_kw);
  const drive_pick_kw = stdSize(dflt(d, 'standard_vfd_kw'), drive_kw);
  const { inverter_text, inverter_pick_kw, inverter_above_standard_sizes, inverter_buy, ...rest } = sys;
  return {
    hp, motor_eff, hours, motor_v, pump_w, pump_kw: pump_w / 1000, motor_kw, ...rest, drive_kw, bus_v,
    string_vmp_hot_v: sys.series * v.vmp_hot, string_voc_cold_v: sys.series * v.voc_cold, panel_vmp_hot_v: v.vmp_hot,
    drive_max_dc_v: vmax, ...(need > cap ? { string_below_bus: true } : {}),
    drive_buy: buyKw(drive_pick_kw, drive_kw, 'one larger drive for this motor; ask the supplier'),
    ...(drive_pick_kw === undefined ? { drive_above_standard_sizes: true } : { drive_pick_kw, array_drive_ratio: sys.installed_kw / drive_pick_kw }),
  };
});
