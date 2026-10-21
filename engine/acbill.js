// Load tools priced as a whole bill: N16 (what one AC adds) and E1's bill (home_load_bill). Their own module, so the
// appliance pages on load.js do not ship the bill engine.
import { calculator, CalcError, has, nonneg, dflt, bool } from './core.js';
import { fmt } from './format.js';
import { bill_total } from './bill.js';
import { ac_units, home_load } from './load.js';

/**
 * N16 AC bill impact: what one AC adds to the whole monthly bill (formulas.md "Owner-approved tools").
 * AC units from E5 (ac_units); bill before = section F bill_total of the other units; bill after = bill_total of
 * other + AC units. A protected home whose total passes the protected limit is billed unprotected, and stays
 * unprotected for the next protected_months bills: lock_extra_rs = months × (other units billed unprotected − bill before).
 */
export const ac_bill_impact = calculator((i, d) => {
  const ac = ac_units.raw(i, d);
  const other_units = nonneg(i, 'other_units');
  const was_protected = bool(i.protected);
  const limit = dflt(d, 'protected_max_units');
  if (was_protected && other_units > limit) throw new CalcError(`protected_max_${limit}_units`, 'other_units');
  const total_units = other_units + ac.monthly_units;
  const protected_lost = was_protected && total_units > limit;
  const addons = {};
  for (const k of ['sanctioned_kw', 'period', 'fc_surcharge_per_unit', 'qta_per_unit', 'fpa_per_unit', 'gst_pct']) if (has(i, k)) addons[k] = i[k];
  const bill = (units, prot) => bill_total.raw({ ...addons, units, protected: prot }, d);
  const before = bill(other_units, was_protected);
  const after = bill(total_units, was_protected && !protected_lost);
  // More units never lower a real bill; a large negative FPA credit could, so the extra is floored at 0.
  const extra_rs = Math.max(0, after.total_rs - before.total_rs);
  const lock_months = protected_lost ? dflt(d, 'protected_months') : 0;
  const lock_per_month = protected_lost ? Math.max(0, bill(other_units, false).total_rs - before.total_rs) : 0;
  const lock_extra_rs = lock_months * lock_per_month;
  // The tariff each bill is on, for the how text: the slab category, or ToU at 5 kW and above (WL-162 c).
  const tou = after.category === 'tou', T = d.tariff.tou;
  const name = (b) => (tou ? 'ToU' : b.category);
  return {
    ac_name: ac.ac_name ?? 'Custom AC', ...(ac.ac_rated_w ? { ac_rated_w: ac.ac_rated_w } : {}), avg_kw: ac.avg_kw, hours: ac.hours, days: ac.days, daily_units: ac.daily_units,
    ac_units: ac.monthly_units, other_units, total_units, sanctioned_kw: after.sanctioned_kw,
    before_rs: before.total_rs, after_rs: after.total_rs, extra_rs, rs_per_ac_unit: ac.monthly_units > 0 ? extra_rs / ac.monthly_units : 0,
    before_rate: before.rate, after_rate: after.rate, before_category: before.category, after_category: after.category,
    before_tariff: `${name(before)} tariff`,
    after_tariff: tou ? `ToU tariff (${fmt(dflt(d, 'tou_peak_share'), 'pct')} of the units in the peak hours at ${fmt(T.peak, 'rs2')}, the rest at ${fmt(T.offpeak, 'rs2')})` : `${after.category} tariff (top slab rate ${fmt(after.rate, 'rs2')} per unit)`,
    tou, tou_share_estimate: tou,
    slab_jump: after.band_index > before.band_index || after.category !== before.category,
    protected_lost, protected_limit: limit, lock_months, lock_per_month, lock_extra_rs,
    // The AC alone above the sanctioned load: the page warns (a higher sanctioned load first, WL-118).
    ac_above_sanctioned: (ac.ac_rated_w ?? ac.avg_kw * 1000) / 1000 > after.sanctioned_kw,
  };
});

/**
 * E1: home load (home_load) with its monthly units priced as a whole unprotected bill at the slab they reach
 * (section F bill_total, default add-ons, sanctioned load blank = the default kW), so E1 and F1 give the same bill (WL-112).
 */
export const home_load_bill = calculator((i, d) => {
  const out = home_load.raw(i, d);
  const b = bill_total.raw({ units: out.monthly_units, sanctioned_kw: i.sanctioned_kw, protected: false }, d);
  return { ...out, bill_kw: b.sanctioned_kw, bill_rate: b.rate, bill_energy_rs: b.energy_rs, bill_calc: b.energy_calc, bill_fixed: b.fixed_basis, bill_tariff: b.category === 'tou' ? 'ToU tariff' : 'unprotected', monthly_rs: b.total_rs, tou: b.category === 'tou', tou_share_estimate: b.category === 'tou' };
});
