// N16. What one AC adds to the monthly bill (specs/formulas.md G "AC bill impact"). Its own module, so the
// appliance-list pages on load.js do not ship the bill engine.
import { calculator, CalcError, has, nonneg, dflt, bool } from './core.js';
import { bill_total } from './bill.js';
import { ac_units } from './load.js';

/**
 * N16 AC bill impact: what one AC adds to the whole monthly bill (formulas.md G "AC bill impact").
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
  return {
    ac_name: ac.ac_name ?? 'Custom AC', ...(ac.ac_rated_w ? { ac_rated_w: ac.ac_rated_w } : {}), avg_kw: ac.avg_kw, hours: ac.hours, days: ac.days, daily_units: ac.daily_units,
    ac_units: ac.monthly_units, other_units, total_units, sanctioned_kw: after.sanctioned_kw,
    before_rs: before.total_rs, after_rs: after.total_rs, extra_rs, rs_per_ac_unit: ac.monthly_units > 0 ? extra_rs / ac.monthly_units : 0,
    before_rate: before.rate, after_rate: after.rate, before_category: before.category, after_category: after.category,
    slab_jump: after.band_index > before.band_index || after.category !== before.category,
    protected_lost, protected_limit: limit, lock_months, lock_per_month, lock_extra_rs,
  };
});
