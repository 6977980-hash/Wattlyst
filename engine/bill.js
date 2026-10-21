// F. Pakistan A-1 domestic bill (specs/formulas.md section F). All rates come from data/tariff-pk-2026.json.
import { calculator, CalcError, bool, has, num, pos, nonneg, dflt } from './core.js';
import { fmt } from './format.js';

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

/** Sanctioned kW for the flat (non-ToU) A-1 tariff: ≥ tou_threshold_kw must use the ToU calculation. */
function flatSanctioned(i, d) {
  const kw = pos(i, 'sanctioned_kw', dflt(d, 'default_sanctioned_kw'));
  if (kw >= dflt(d, 'tou_threshold_kw')) throw new CalcError('tou_required_at_5kw', 'sanctioned_kw');
  return kw;
}

function categoryOf(i) {
  if (bool(i.lifeline)) return 'lifeline';
  return bool(i.protected) ? 'protected' : 'unprotected';
}

export const bill_energy = calculator((i, d) => {
  const t = tariffOf(d);
  const units = nonneg(i, 'units');
  const sanctioned_kw = flatSanctioned(i, d);
  const category = categoryOf(i);
  return { units, sanctioned_kw, category, ...energyCharge(t, units, category, sanctioned_kw) };
});

/**
 * Add-on lines on top of energy + fixed: FC surcharge + QTA + FPA, then GST on that subtotal (flat and ToU bills alike).
 * Add-on rates are inputs; a blank field uses data/tariff-pk-2026.json addons_secondary (FC surcharge, GST,
 * QTA for the given `period` like "2026-09..2026-11", FPA value when notified, else 0). Each line is shown with source/date.
 * QTA is not applied to lifeline. FPA (monthly fuel charges adjustment) is not charged to the categories NEPRA's FCA
 * order exempts: input `fpa_exempt` (a month's list from data/bill-index.json), else addons_secondary.fpa_per_unit.exempt
 * (WL-157: lifeline only among the categories modelled; protected homes pay it). QTA/FPA may be negative (a credit).
 */
function addOns(base, i, d) {
  const a = tariffOf(d).addons_secondary || {};
  // A blank FC surcharge or GST takes the category's own default from data (by_category: lifeline 0, with sources and
  // what is still [VERIFY]), else the file value (WL-241, WL-242); the user can still enter them.
  const life = base.category === 'lifeline';
  const def = (x) => x?.by_category?.[base.category] ?? x?.value ?? 0;
  const fc = nonneg(i, 'fc_surcharge_per_unit', def(a.fc_surcharge_per_unit));
  const period = has(i, 'period') ? String(i.period) : null;
  const qtaTable = a.qta_per_unit || {};
  const qtaDefault = period && /^\d{4}-\d{2}\.\.\d{4}-\d{2}$/.test(period) && Object.hasOwn(qtaTable, period) ? qtaTable[period] : undefined;
  if (period && typeof qtaDefault !== 'number') throw new CalcError('period_unknown', 'period');
  const qta = num(i, 'qta_per_unit', { def: qtaDefault ?? 0 });
  // FPA bounded by the range NEPRA has notified (data/tariff-pk-2026.json addons_secondary.fpa_per_unit.min/max, WL-118).
  const fpa = num(i, 'fpa_per_unit', { def: a.fpa_per_unit?.value ?? 0, min: a.fpa_per_unit?.min, max: a.fpa_per_unit?.max });
  const gst_pct = num(i, 'gst_pct', { def: def(a.gst_pct), min: 0, max: 100 });
  const exempt = Array.isArray(i.fpa_exempt) ? i.fpa_exempt : a.fpa_per_unit?.exempt || [];
  // The FPA is billed on the units of the month it adjusts, not this month's (WL-244); blank = this month's units.
  const fpa_units = nonneg(i, 'fpa_units', base.units);
  // A bill prints whole rupees: each line is rounded, the subtotal is the sum of the printed lines and GST is
  // rounded on that subtotal, so the printed lines always add up to the printed total (WL-109).
  const R = Math.round;
  const energy_rs = R(base.energy_rs), fixed_rs = R(base.fixed_rs);
  const fc_rs = R(fc * base.units);
  const qta_rs = life ? 0 : R(qta * base.units);
  const fpa_exempt = exempt.includes(base.category);
  const fpa_rs = fpa_exempt ? 0 : R(fpa * fpa_units);
  const subtotal_rs = Math.max(0, energy_rs + fixed_rs + fc_rs + qta_rs + fpa_rs);
  const gst_rs = R((subtotal_rs * gst_pct) / 100);
  return { energy_rs, fixed_rs, fc_surcharge_per_unit: fc, qta_per_unit: qta, fpa_per_unit: fpa, fpa_units, fpa_exempt, fc_rs, qta_rs, fpa_rs, subtotal_rs, gst_pct, gst_rs, total_rs: subtotal_rs + gst_rs };
}

const SIGNED = ['qta_rs', 'fpa_rs', 'qta_per_unit', 'fpa_per_unit'];

/**
 * ToU (≥ 5 kW): peak × peak rate + off-peak × off-peak rate; fixed = Rs/kW × max(fixed_min_fraction × sanctioned, MDI);
 * then the same add-on lines and GST as the flat bill (WL-162), category 'tou' (not FPA-exempt).
 */
export const bill_tou = calculator((i, d) => {
  const t = tariffOf(d).tou;
  const peak_units = nonneg(i, 'peak_units');
  const offpeak_units = nonneg(i, 'offpeak_units');
  const sanctioned_kw = pos(i, 'sanctioned_kw');
  const mdi_kw = nonneg(i, 'mdi_kw', 0);
  if (!(t.fixed_min_fraction > 0)) throw new CalcError('tariff_data_missing', 'tariff');
  const billable_kw = Math.max(t.fixed_min_fraction * sanctioned_kw, mdi_kw);
  const units = peak_units + offpeak_units;
  const base = { units, category: 'tou', energy_rs: peak_units * t.peak + offpeak_units * t.offpeak, fixed_rs: t.fixed_per_kw * billable_kw };
  return { peak_units, offpeak_units, sanctioned_kw, mdi_kw, billable_kw, ...addOns(base, i, d), units, category: 'tou', energy_calc: `${fmt(peak_units)} × ${fmt(t.peak, 'rs2')} + ${fmt(offpeak_units)} × ${fmt(t.offpeak, 'rs2')}` };
}, { allowNegative: SIGNED });

/** Full flat (non-ToU) estimate: energy + fixed (bill_energy) + add-on lines (addOns). */
function billLines(i, d) {
  const base = bill_energy.raw(i, d);
  // Average energy rate per unit: a protected bill is charged slab by slab, so its average is below the top slab's rate (WL-114).
  const avg_rate = base.units > 0 ? base.energy_rs / base.units : base.rate;
  // The energy sum as the bill works it out (WL-164): one "units × rate" part per protected slab used, else one part.
  const t = tariffOf(d)[base.category];
  const parts = [];
  if (base.category === 'protected') {
    let prev = 0;
    for (let k = 0; k <= base.band_index; k++) {
      const top = Math.min(base.units, t[k].upto);
      if (top > prev || k === base.band_index) parts.push(`${fmt(top - prev)} × ${fmt(t[k].rate, 'rs2')}`);
      prev = top;
    }
  } else parts.push(`${fmt(base.units)} × ${fmt(base.rate, 'rs2')}`);
  return { ...base, ...addOns(base, i, d), avg_rate, energy_calc: parts.join(' + ') };
}

export const bill_total = calculator((i, d) => {
  const out = billLines(i, d);
  const bands = tariffOf(d).unprotected;
  const flat = { ...i, protected: false, lifeline: false };
  const at = (units, inp = flat) => billLines({ ...inp, units }, d).total_rs;
  // Top-slab cliff for page text (WL-117): one unit past the last closed unprotected band moves every unit to the
  // open-ended rate; same sanctioned load and add-ons as this bill.
  const edge = bands[bands.length - 2].upto;
  const res = { ...out, cliff_units: edge, cliff_rs: at(edge + 1) - at(edge) };
  // Next slab cliff (WL-165): the limit of the band this bill reached and what one unit past it adds. Unprotected: the
  // next band's rate on every unit; protected: the next protected slab, or past the protected limit an unprotected bill.
  // None at the top band or for lifeline.
  if (out.category === 'protected') {
    const top = out.band_upto;
    const past = top < tariffOf(d).protected.at(-1).upto ? i : flat;
    Object.assign(res, { next_units: top, next_rs: at(top + 1, past) - at(top, i) });
  } else if (out.category === 'unprotected' && !out.band_open_ended) {
    Object.assign(res, { next_units: out.band_upto, next_rs: at(out.band_upto + 1) - at(out.band_upto) });
  }
  return res;
}, { allowNegative: [...SIGNED, 'cliff_rs', 'next_rs'] });

/** Protected: last 6 months each ≤ 200 units, not ToU, sanctioned < 5 kW. */
export const protected_check = calculator((i, d) => {
  const h = i.history;
  const months = dflt(d, 'protected_months');
  const limit = dflt(d, 'protected_max_units');
  if (!Array.isArray(h) || h.length !== months) throw new CalcError(`history_needs_${months}_months`, 'history');
  // Each month parsed like every other input ("1,500" = 1500), and the check runs on the parsed numbers (WL-113).
  const units = h.map((u, idx) => num({ history: u }, 'history', { min: 0, code: `history_${idx + 1}_invalid` }));
  const sanctioned_kw = pos(i, 'sanctioned_kw', dflt(d, 'default_sanctioned_kw'));
  const tou = bool(i.tou) || sanctioned_kw >= dflt(d, 'tou_threshold_kw');
  const max_month = Math.max(...units);
  const reasons = [];
  if (max_month > limit) reasons.push('month_over_200');
  if (tou) reasons.push('tou_or_5kw');
  return { protected: reasons.length === 0, max_month, reasons_count: reasons.length, reasons };
});

/**
 * Net billing: import billed at the slab tariff (energy only), export credited at the buyback rate.
 * Buyback is an editable input; its default is NEPRA's national average energy purchase price. A credit larger than the import
 * bill is shown as carry_forward_rs, never as a negative bill. At tou_threshold_kw and above the import is billed on ToU
 * rates (WL-162 c): peak units from the bill, blank = the default peak share of the import (an estimate); solar exports
 * fall in off-peak hours, so old net metering netted them against the off-peak import only.
 */
export const net_billing = calculator((i, d) => {
  const t = tariffOf(d);
  const import_units = nonneg(i, 'import_units');
  const export_units = nonneg(i, 'export_units');
  const buyback_rs = nonneg(i, 'buyback_rs', t.net_billing?.buyback_rs_per_unit_default);
  const export_credit_rs = export_units * buyback_rs;
  const kw = pos(i, 'sanctioned_kw', dflt(d, 'default_sanctioned_kw'));
  let r;
  if (kw >= dflt(d, 'tou_threshold_kw')) {
    if (bool(i.protected) || bool(i.lifeline)) throw new CalcError('protected_at_tou', 'protected');
    const T = t.tou, rs = (v) => fmt(v, 'rs2');
    const peak = num(i, 'peak_units', { def: import_units * dflt(d, 'tou_peak_share'), min: 0, max: import_units });
    const off = import_units - peak;
    const left = Math.max(0, off - export_units);
    const e = peak * T.peak + off * T.offpeak;
    r = { import_energy_rs: e, import_rate: import_units ? e / import_units : T.offpeak, import_calc: `${fmt(peak)} peak units × ${rs(T.peak)} + ${fmt(off)} off-peak × ${rs(T.offpeak)}`,
      net_metering_units: peak + left, net_metering_rs: peak * T.peak + left * T.offpeak, net_metering_carry_units: Math.max(0, export_units - off),
      nm_calc: `${fmt(peak)} peak units × ${rs(T.peak)} + ${fmt(left)} off-peak units left after the export × ${rs(T.offpeak)}`, peak_units: peak, tou: true, tou_peak_estimate: !has(i, 'peak_units') };
  } else {
    const imp = energyCharge(t, import_units, categoryOf(i), kw);
    // Old net metering for comparison: units offset one-for-one, only the net import is billed (energy only).
    const units = Math.max(0, import_units - export_units);
    const old = energyCharge(t, units, categoryOf(i), kw);
    r = { import_energy_rs: imp.energy_rs, import_rate: imp.rate, import_calc: `${fmt(import_units)} units at the slab rate of ${fmt(imp.rate, 'rs2')}`,
      net_metering_units: units, net_metering_rate: old.rate, net_metering_rs: old.energy_rs, net_metering_carry_units: Math.max(0, export_units - import_units),
      nm_calc: `${fmt(import_units)} − ${fmt(export_units)} = ${fmt(units)} net units at ${fmt(old.rate, 'rs2')}`, tou: false };
  }
  const diff = r.import_energy_rs - export_credit_rs;
  const net_energy_rs = Math.max(0, diff);
  return {
    import_units, export_units, buyback_rs, sanctioned_kw: kw, ...r, export_credit_rs,
    net_energy_rs, carry_forward_rs: Math.max(0, -diff),
    extra_vs_net_metering_rs: Math.max(0, net_energy_rs - r.net_metering_rs),
  };
});

/** Protected energy + fixed with every slab limit scaled by `scale` (a reading cycle longer or shorter than the billing month). */
function proratedProtected(t, units, scale, kw) {
  // The top limit never falls below the units: units_30 within the limit can scale back a hair under it in floating point.
  const bands = t.protected.map((b, k, all) => ({ ...b, upto: k === all.length - 1 ? Math.max(b.upto * scale, units) : b.upto * scale }));
  return energyCharge({ protected: bands }, units, 'protected', kw);
}

/**
 * N1 bill audit: units_30 = units × bill_month_days / days; slab_jump if the 30-day-equivalent falls in a lower band;
 * if 'protected' history was all ≤ 200 but this bill > 200 only because of a long cycle, flag it.
 * Fair bill: unprotected = every unit at the band the 30-day equivalent reaches; protection at risk = the protected
 * bill with each slab limit pro-rated by days ÷ bill_month_days (WL-111). Estimate only, never an official finding.
 */
export const bill_audit = calculator((i, d) => {
  const t = tariffOf(d);
  const units = nonneg(i, 'units');
  const days = pos(i, 'days');
  const cycle = dflt(d, 'bill_month_days');
  const units_30 = (units * cycle) / days;
  const bands = t.unprotected;
  const limit = dflt(d, 'protected_max_units');
  // Only a cycle longer than 30 days can push units into a higher band; a short cycle never overcharges.
  const slab_jump = bandIndex(bands, units_30) < bandIndex(bands, units);
  const protection_at_risk = units > limit && units_30 <= limit;
  const out = { units, days, units_30, long_cycle: days > dflt(d, 'max_normal_cycle_days'), slab_jump, protection_at_risk };
  if (has(i, 'sanctioned_kw')) {
    const kw = pos(i, 'sanctioned_kw');
    const actual = energyCharge(t, units, 'unprotected', kw);
    // A home that lost protected status only to the long cycle should have had its protected bill, slab limits
    // pro-rated to the days read; otherwise all billed units at the rate (and fixed charge) of the band the 30-day equivalent reaches.
    let fair_rs;
    if (protection_at_risk) {
      const p = proratedProtected(t, units, days / cycle, kw);
      fair_rs = p.energy_rs + p.fixed_rs;
    } else {
      const fair = energyCharge(t, units_30, 'unprotected', kw);
      fair_rs = units * fair.rate + fair.fixed_rs;
    }
    out.billed_rs = actual.energy_rs + actual.fixed_rs;
    out.fair_rs = fair_rs;
    out.fair_protected = protection_at_risk;
    out.fair_basis = protection_at_risk ? 'the protected rates the home had, each protected slab stretched to the days read' : `the slab ${Math.round(units_30)} units would reach`;
    out.extra_rs = Math.max(0, out.billed_rs - fair_rs);
  }
  if (has(i, 'prev_year_units')) {
    const prev = nonneg(i, 'prev_year_units');
    out.spike = prev > 0 && units > prev * (1 + dflt(d, 'spike_threshold'));
  }
  return out;
});
