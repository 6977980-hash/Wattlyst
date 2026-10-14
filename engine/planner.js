// Home Power Planner (specs/formulas.md "Phase 4 tools"): one appliance list carried through the chain
// load -> inverter -> battery -> solar -> net billing -> generator. Every step calls the calculator that
// owns its formula; this file only passes numbers along and adds the monthly solar split.
import { calculator, CalcError, frac, nonneg, pos, dflt, has } from './core.js';
import { inverter_size, generator_size } from './sizing.js';
import { solar_from_loads, solar_battery } from './solar.js';
import { bill_energy, net_billing } from './bill.js';

/**
 * Monthly solar split: self-used = min(solar, use × day share); export = solar − self-used;
 * import = use − self-used, with the array capped at the sanctioned kW (net-billing limit). Bills are
 * energy charges at the slab tariff only; fixed charge, per-unit surcharges and GST are left out, so the
 * real saving is somewhat higher than this estimate.
 */
export const home_plan = calculator((i, d) => {
  const inv = inverter_size.raw(i, d);
  const sun = solar_from_loads.raw(i, d);
  const days = dflt(d, 'days_per_month');
  const monthly_units = sun.daily_kwh * days;
  // Inverter: the running load × margin (section C), but never so small that the planned array is more
  // than dc_ac_ratio_max times it (section D, D5/D8 rule): continuous = max(P_run × margin, kWp × 1000 / ratio).
  const inverter_w = Math.max(inv.continuous_w, sun.inverter_kw_array * 1000);

  const backup_w = pos(i, 'backup_w');
  const backup_hours = nonneg(i, 'backup_hours');
  const battery_v = pos(i, 'battery_v', dflt(d, 'battery_v_default'));
  const lithium = (i.chemistry ?? 'lifepo4') === 'lifepo4';
  if (!['lifepo4', 'tubular'].includes(i.chemistry ?? 'lifepo4')) throw new CalcError('chemistry_invalid', 'chemistry');
  const out = {
    running_w: inv.running_w, peak_w: inv.surge_w, daily_kwh: sun.daily_kwh, monthly_units,
    margin: inv.margin, dc_ac_ratio_max: sun.dc_ac_ratio_max,
    inverter_kw_load: inv.continuous_w / 1000, inverter_kw_array: sun.inverter_kw_array,
    inverter_w, inverter_kw: inverter_w / 1000, inverter_kva: inverter_w / inv.pf / 1000, inverter_surge_w: inv.surge_w,
    backup_w, backup_hours, battery_v, chemistry: lithium ? 'lifepo4' : 'tubular',
    city_yield: sun.yield_kwh_per_kwp_day, panel_w: sun.panel_w, solar_kw: sun.kw, panels: sun.panels, installed_kw: sun.installed_kw,
    roof_m2: sun.roof_m2, solar_kw_energy: sun.kw_energy, solar_kw_power: sun.kw_power, pr: sun.pr, solar_limited_by: sun.limited_by,
    monthly_solar_kwh: sun.monthly_kwh_estimate,
  };
  if (backup_hours > 0) {
    const bat = solar_battery.raw({ night_kwh: (backup_w * backup_hours) / 1000, volts: battery_v, dod: lithium ? dflt(d, 'dod_lifepo4') : dflt(d, 'dod_lead_acid'), inverter_eff: dflt(d, 'inverter_eff_hybrid') }, d);
    Object.assign(out, { backup_kwh: bat.night_kwh, battery_dod: bat.dod, battery_ah: bat.ah, battery_kwh: bat.kwh });
  } else {
    Object.assign(out, { backup_kwh: 0, battery_dod: lithium ? dflt(d, 'dod_lifepo4') : dflt(d, 'dod_lead_acid'), battery_ah: 0, battery_kwh: 0 });
  }

  const day_share = frac(i, 'day_share', dflt(d, 'planner_day_share'));
  const bill = { sanctioned_kw: i.sanctioned_kw, protected: false };
  const before = bill_energy.raw({ ...bill, units: monthly_units }, d);
  // Net billing allows an array up to the sanctioned load: above it, only the whole panels that fit are billed.
  const above = out.installed_kw > before.sanctioned_kw + 1e-9;
  const nb_panels = above ? Math.floor((before.sanctioned_kw * 1000) / out.panel_w + 1e-9) : out.panels;
  const nb_kw = (nb_panels * out.panel_w) / 1000;
  const nb_solar_kwh = nb_kw * out.city_yield * days;
  const self_used = Math.min(nb_solar_kwh, monthly_units * day_share);
  const export_units = nb_solar_kwh - self_used;
  const import_units = monthly_units - self_used;
  const nb = net_billing.raw({ ...bill, import_units, export_units, buyback_rs: has(i, 'buyback_rs') ? i.buyback_rs : undefined }, d);
  Object.assign(out, {
    net_billing_panels: nb_panels, net_billing_kw: nb_kw, net_billing_solar_kwh: nb_solar_kwh,
    day_share, self_used_units: self_used, export_units, import_units, sanctioned_kw: before.sanctioned_kw, buyback_rs: nb.buyback_rs,
    bill_before_rs: before.energy_rs, rate_before: before.rate, bill_after_rs: nb.net_energy_rs, carry_forward_rs: nb.carry_forward_rs,
    saving_rs: Math.max(0, before.energy_rs - nb.net_energy_rs),
    solar_above_sanctioned: above,
  });

  const gen = generator_size.raw(i, d);
  // Next standard size from data/defaults.json; above the largest size the exact kVA is shown with the flag.
  Object.assign(out, { generator_kva: gen.recommended_kva, generator_pick_kva: gen.standard_kva ?? gen.recommended_kva, generator_above_standard_sizes: gen.above_standard_sizes });
  return out;
});
