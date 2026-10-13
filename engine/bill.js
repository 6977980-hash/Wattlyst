// F. Pakistan A-1 domestic bill (specs/formulas.md section F). All rates come from data/tariff-pk-2026.json.
import { calculator, CalcError, num, pos, nonneg, dflt } from './core.js';

function tariffOf(d) {
  const t = d?.tariff;
  if (!t?.unprotected?.length || !t?.protected?.length) throw new CalcError('tariff_data_missing', 'tariff');
  return t;
}

/** Index of the band whose range contains units (bands sorted, last upto = null means "and above"). */
function bandIndex(bands, units) {
  const idx = bands.findIndex((b) => b.upto === null || units <= b.upto);
  return idx === -1 ? bands.length - 1 : idx;
}

/**
 * Energy + fixed charge.
 * - category 'lifeline': ≤ 100 units, all units at the reached lifeline band, no fixed charge.
 * - protected: slab-wise (benefit of one previous slab), ≤ 200 units; fixed from the reached band.
 * - unprotected: all units at the rate of the band reached; fixed from the reached band.
 */
export function energyCharge(t, units, category, sanctioned_kw) {
  const bands = t[category];
  if (category === 'lifeline' || category === 'protected') {
    const max = bands[bands.length - 1].upto;
    if (units > max) throw new CalcError(`${category}_max_${max}_units`, 'units');
  }
  const idx = bandIndex(bands, units);
  const band = bands[idx];
  let energy_rs;
  if (category === 'protected') {
    energy_rs = 0;
    let prev = 0;
    for (let k = 0; k <= idx; k++) {
      const top = bands[k].upto === null ? units : Math.min(units, bands[k].upto);
      energy_rs += Math.max(0, top - prev) * bands[k].rate;
      prev = top;
    }
  } else {
    energy_rs = units * band.rate;
  }
  return { band_index: idx, band_upto: band.upto ?? 0, band_open_ended: band.upto === null, rate: band.rate, energy_rs, fixed_rs: band.fixed_per_kw * sanctioned_kw };
}

function categoryOf(i) {
  if (i.lifeline === true) return 'lifeline';
  return i.protected === true ? 'protected' : 'unprotected';
}

export const bill_energy = calculator((i, d) => {
  const t = tariffOf(d);
  const units = nonneg(i, 'units');
  const sanctioned_kw = pos(i, 'sanctioned_kw', 1);
  if (sanctioned_kw >= dflt(d, 'tou_threshold_kw')) throw new CalcError('tou_required_at_5kw', 'sanctioned_kw');
  const category = categoryOf(i);
  return { units, sanctioned_kw, category, ...energyCharge(t, units, category, sanctioned_kw) };
});

/** ToU (≥ 5 kW): peak × peak rate + off-peak × off-peak rate; fixed = Rs/kW × max(50% sanctioned, MDI). */
export const bill_tou = calculator((i, d) => {
  const t = tariffOf(d).tou;
  const peak_units = nonneg(i, 'peak_units');
  const offpeak_units = nonneg(i, 'offpeak_units');
  const sanctioned_kw = pos(i, 'sanctioned_kw');
  const mdi_kw = nonneg(i, 'mdi_kw', 0);
  const billable_kw = Math.max(0.5 * sanctioned_kw, mdi_kw);
  const energy_rs = peak_units * t.peak + offpeak_units * t.offpeak;
  return { peak_units, offpeak_units, units: peak_units + offpeak_units, sanctioned_kw, mdi_kw, billable_kw, energy_rs, fixed_rs: t.fixed_per_kw * billable_kw };
});

/**
 * Full estimate: energy + fixed + FC surcharge + QTA + FPA, then GST on that subtotal.
 * Add-on rates are inputs (UI pre-fills from data/tariff-pk-2026.json addons_secondary, each shown with source/date).
 * QTA is not applied to lifeline. QTA/FPA may be negative (a credit).
 */
export const bill_total = calculator((i, d) => {
  const base = bill_energy.raw(i, d);
  const fc = nonneg(i, 'fc_surcharge_per_unit', 0);
  const qta = num(i, 'qta_per_unit', { def: 0 });
  const fpa = num(i, 'fpa_per_unit', { def: 0 });
  const gst_pct = num(i, 'gst_pct', { def: 0, min: 0, max: 100 });
  const fc_rs = fc * base.units;
  const qta_rs = base.category === 'lifeline' ? 0 : qta * base.units;
  const fpa_rs = fpa * base.units;
  const subtotal_rs = Math.max(0, base.energy_rs + base.fixed_rs + fc_rs + qta_rs + fpa_rs);
  const gst_rs = (subtotal_rs * gst_pct) / 100;
  return { ...base, fc_rs, qta_rs, fpa_rs, subtotal_rs, gst_pct, gst_rs, total_rs: subtotal_rs + gst_rs };
}, { allowNegative: ['qta_rs', 'fpa_rs'] });

/** Protected: last 6 months each ≤ 200 units, not ToU, sanctioned < 5 kW. */
export const protected_check = calculator((i, d) => {
  const h = i.history;
  const months = dflt(d, 'protected_months');
  const limit = dflt(d, 'protected_max_units');
  if (!Array.isArray(h) || h.length !== months) throw new CalcError(`history_needs_${months}_months`, 'history');
  h.forEach((u, idx) => num({ u }, 'u', { min: 0, code: `history_${idx}_invalid` }));
  const sanctioned_kw = pos(i, 'sanctioned_kw', 1);
  const tou = i.tou === true || sanctioned_kw >= dflt(d, 'tou_threshold_kw');
  const max_month = Math.max(...h);
  const reasons = [];
  if (max_month > limit) reasons.push('month_over_200');
  if (tou) reasons.push('tou_or_5kw');
  return { protected: reasons.length === 0, max_month, reasons_count: reasons.length, reasons };
});

/**
 * Net billing: import billed at the slab tariff (energy only), export credited at the buyback rate.
 * Buyback is an editable input (not yet confirmed on a NEPRA page). A credit larger than the import
 * bill is shown as carry_forward_rs, never as a negative bill.
 */
export const net_billing = calculator((i, d) => {
  const t = tariffOf(d);
  const import_units = nonneg(i, 'import_units');
  const export_units = nonneg(i, 'export_units');
  const buyback_rs = nonneg(i, 'buyback_rs', t.net_billing?.buyback_rs_per_unit_default);
  const sanctioned_kw = pos(i, 'sanctioned_kw', 1);
  const imp = energyCharge(t, import_units, categoryOf(i), sanctioned_kw);
  const export_credit_rs = export_units * buyback_rs;
  const diff = imp.energy_rs - export_credit_rs;
  return {
    import_units, export_units, buyback_rs, import_rate: imp.rate,
    import_energy_rs: imp.energy_rs, export_credit_rs,
    net_energy_rs: Math.max(0, diff), carry_forward_rs: Math.max(0, -diff),
  };
});

/**
 * N1 bill audit: units_30 = units × 30 / days; slab_jump if the 30-day-equivalent falls in a lower band;
 * if 'protected' history was all ≤ 200 but this bill > 200 only because of a long cycle, flag it.
 * Estimate only, never an official finding.
 */
export const bill_audit = calculator((i, d) => {
  const t = tariffOf(d);
  const units = nonneg(i, 'units');
  const days = pos(i, 'days');
  const cycle = dflt(d, 'days_per_month');
  const units_30 = (units * cycle) / days;
  const bands = t.unprotected;
  const limit = dflt(d, 'protected_max_units');
  const slab_jump = bandIndex(bands, units) !== bandIndex(bands, units_30);
  const out = {
    units, days, units_30, long_cycle: days > dflt(d, 'max_normal_cycle_days'), slab_jump,
    protection_at_risk: units > limit && units_30 <= limit,
  };
  if (i.sanctioned_kw !== undefined) {
    const kw = pos(i, 'sanctioned_kw');
    const actual = energyCharge(t, units, 'unprotected', kw);
    // Fair estimate = all billed units at the rate (and fixed charge) of the band the 30-day equivalent reaches.
    const fair = energyCharge(t, units_30, 'unprotected', kw);
    const fair_rs = units * fair.rate + fair.fixed_rs;
    out.billed_rs = actual.energy_rs + actual.fixed_rs;
    out.fair_rs = fair_rs;
    out.extra_rs = Math.max(0, out.billed_rs - fair_rs);
  }
  if (i.prev_year_units !== undefined) {
    const prev = nonneg(i, 'prev_year_units');
    out.spike = prev > 0 && units > prev * (1 + dflt(d, 'spike_threshold'));
  }
  return out;
});
