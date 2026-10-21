// Home Power Planner (specs/formulas.md "Phase 4 tools"): one appliance list carried through the chain
// load -> inverter -> battery -> solar -> net billing -> generator. Every step calls the calculator that
// owns its formula; this file only passes numbers along and adds the monthly solar split.
import { calculator, CalcError, frac, nonneg, num, pos, dflt, has } from './core.js';
import { inverter_size, generator_size, loadRows } from './sizing.js';
import { solar_from_loads, solar_battery, stdSize, buyKw } from './solar.js';
import { bill_energy, bill_total, net_billing } from './bill.js';

/**
 * Monthly solar split: self-used = min(solar, use × day share); export = solar − self-used;
 * import = use − self-used, with the array capped at the sanctioned kW (net-billing limit). Two bill
 * comparisons: energy charge only, and the whole bill (section F bill_total: energy + fixed + FC surcharge
 * + QTA + FPA, GST on that), where the import bill carries every charge and the export credit is set
 * against the bill after GST.
 */
export const home_plan = calculator((i, d) => {
  const inv = inverter_size.raw(i, d);
  const sun = solar_from_loads.raw(i, d);
  const days = dflt(d, 'days_per_month');
  const monthly_units = sun.daily_kwh * days;
  // Inverter: the running load × margin (section C), but never so small that the planned array is more
  // than dc_ac_ratio_max times it (section D, D5/D8 rule): continuous = max(P_run × margin, kWp × 1000 / ratio).
  const inverter_w = Math.max(inv.continuous_w, sun.inverter_kw_array * 1000);

  const backup_hours = num(i, 'backup_hours', { min: 0, max: 24 });
  // Backup watts are needed only with backup hours (WL-105). The backup load is part of the list, so it can be no more
  // than the list's running load and its energy no more than the day's use (WL-103).
  const backup_w = backup_hours > 0 ? pos(i, 'backup_w') : nonneg(i, 'backup_w', 0);
  if (backup_w > inv.running_w + 1e-9 || (backup_w * backup_hours) / 1000 > sun.daily_kwh + 1e-9) throw new CalcError('backup_above_home', 'backup_w');
  const battery_v = pos(i, 'battery_v', dflt(d, 'battery_v_default'));
  const lithium = (i.chemistry ?? 'lifepo4') === 'lifepo4';
  if (!['lifepo4', 'tubular'].includes(i.chemistry ?? 'lifepo4')) throw new CalcError('chemistry_invalid', 'chemistry');
  const out = {
    running_w: inv.running_w, peak_w: inv.surge_w, daily_kwh: sun.daily_kwh, monthly_units,
    margin: inv.margin, dc_ac_ratio_max: sun.dc_ac_ratio_max,
    inverter_kw_load: inv.continuous_w / 1000, inverter_kw_array: sun.inverter_kw_array,
    inverter_w, inverter_kw: inverter_w / 1000, inverter_buy: buyKw(stdSize(dflt(d, 'standard_inverter_kw'), inverter_w / 1000), inverter_w / 1000), inverter_kva: inverter_w / inv.pf / 1000, inverter_surge_w: inv.surge_w,
    // Starting peak of the backup load: any motor whose running watts fit in it may start on it (C1 rule, WL-96).
    backup_w, backup_surge_w: backup_w + loadRows(i.loads, d).reduce((m, r) => (r.qty > 0 && r.run <= backup_w + 1e-9 ? Math.max(m, r.start - r.run) : m), 0),
    backup_hours, battery_v, chemistry: lithium ? 'lifepo4' : 'tubular',
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
    // The inverter rule above for the array net billing accepts (the decision step prices solar at it, WL-91).
    net_billing_inverter_kw: Math.max(out.inverter_kw_load, nb_kw / out.dc_ac_ratio_max),
    day_share, self_used_units: self_used, export_units, import_units, sanctioned_kw: before.sanctioned_kw, buyback_rs: nb.buyback_rs,
    bill_before_rs: before.energy_rs, rate_before: before.rate, bill_after_rs: nb.net_energy_rs, carry_forward_rs: nb.carry_forward_rs,
    saving_rs: Math.max(0, before.energy_rs - nb.net_energy_rs),
    solar_above_sanctioned: above,
  });
  // Whole bill: the same add-on defaults as the bill calculator (section F). Under net billing the imported
  // units carry the fixed charge, surcharges and GST; the export credit is then set against that bill.
  const full_before = bill_total.raw({ ...bill, units: monthly_units }, d);
  const full_import = bill_total.raw({ ...bill, units: import_units }, d);
  const full_diff = full_import.total_rs - nb.export_credit_rs;
  Object.assign(out, {
    full_before_rs: full_before.total_rs, full_import_rs: full_import.total_rs, export_credit_rs: nb.export_credit_rs,
    full_after_rs: Math.max(0, full_diff), full_carry_forward_rs: Math.max(0, -full_diff),
    full_saving_rs: Math.max(0, full_before.total_rs - Math.max(0, full_diff)),
    fixed_before_rs: full_before.fixed_rs, fixed_after_rs: full_import.fixed_rs, gst_pct: full_before.gst_pct,
  });

  const gen = generator_size.raw(i, d);
  // Next standard size from data/defaults.json; above the largest size the exact kVA is shown with the flag.
  Object.assign(out, { generator_kva: gen.recommended_kva, generator_pick_kva: gen.standard_kva ?? gen.recommended_kva, generator_above_standard_sizes: gen.above_standard_sizes });
  return out;
});

/**
 * Whole-bill saving a month of the planner's net-billed array (formulas.md H1 decision engine): only `sun` of the solar
 * is made and used (an on-grid inverter stops in a cut), only `exp` of the export reaches the grid (a hybrid cannot export
 * in a cut), and `extra` units are added to the import (a UPS recharge) or taken off it (units a generator supplies).
 */
export function netSaving(p, d, sun, exp, extra) {
  const s = p.net_billing_solar_kwh * sun;
  // In a cut the on-grid inverter is off, so only the daytime use while the grid is on can take its solar.
  const self = Math.min(s, p.monthly_units * p.day_share * sun);
  const units = Math.max(0, p.monthly_units - self + extra);
  return p.full_before_rs - Math.max(0, bill_total.raw({ sanctioned_kw: p.sanctioned_kw, protected: false, units }, d).total_rs - (s - self) * exp * p.buyback_rs);
}
