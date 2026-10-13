// D. Solar (specs/formulas.md section D) and solar tools from section G.
import { calculator, CalcError, pos, frac, nonneg, ceilSafe, dflt, num } from './core.js';

/** Specific yield (kWh/kWp/day): explicit input > city from data/cities-pk.json > PSH × PR. */
function yieldFor(i, d) {
  if (i.yield_kwh_per_kwp_day !== undefined && i.yield_kwh_per_kwp_day !== '') {
    return { yield_kwh_per_kwp_day: pos(i, 'yield_kwh_per_kwp_day'), yield_source: 'input' };
  }
  if (i.city) {
    const c = d?.cities?.[String(i.city).toLowerCase()];
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
  if (i.daily_kwh !== undefined && i.daily_kwh !== '') daily_kwh = pos(i, 'daily_kwh');
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

/** Panel for a battery: W = (Ah × V × DoD / η_chg) / PSH, then next standard panel size. */
export const panel_for_12v = calculator((i, d) => {
  const ah = pos(i, 'ah');
  const volts = pos(i, 'volts');
  const dod = frac(i, 'dod', dflt(d, 'dod_lead_acid'));
  const psh = pos(i, 'psh');
  const charge_eff = frac(i, 'charge_eff', dflt(d, 'charge_eff_lead_acid'));
  const panel_w = (ah * volts * dod) / charge_eff / psh;
  const sizes = dflt(d, 'standard_panel_w');
  const standard_panel_w = sizes.find((s) => s >= panel_w - 1e-9) ?? null;
  const out = { ah, volts, dod, psh, charge_eff, panel_w };
  if (standard_panel_w !== null) out.standard_panel_w = standard_panel_w;
  else out.panels_of_largest = ceilSafe(panel_w / sizes[sizes.length - 1]);
  return out;
});

/** MPPT: A = P_array / V_battery × margin. PWM: A = Isc × N_parallel × margin. */
export const charge_controller = calculator((i, d) => {
  const type = i.type ?? 'mppt';
  const margin = num(i, 'margin', { def: dflt(d, 'margin'), min: 1 });
  let amps;
  if (type === 'mppt') {
    amps = (pos(i, 'panel_w') / pos(i, 'battery_v')) * margin;
  } else if (type === 'pwm') {
    amps = pos(i, 'isc') * num(i, 'n_parallel', { def: 1, min: 1 }) * margin;
  } else throw new CalcError('type_invalid', 'type');
  const sizes = dflt(d, 'standard_controller_a');
  const standard_a = sizes.find((s) => s >= amps - 1e-9);
  return standard_a === undefined ? { type, margin, amps } : { type, margin, amps, standard_a };
});

/** N3: Rs/W = price / (kWp × 1000). Verdict only against a dated range passed in (data/solar-prices.json). */
export const quote_checker = calculator((i) => {
  const kwp = pos(i, 'kwp');
  const price = pos(i, 'price');
  const rs_per_w = price / (kwp * 1000);
  const out = { kwp, price, rs_per_w };
  if (i.range_low !== undefined && i.range_high !== undefined) {
    const lo = pos(i, 'range_low');
    const hi = pos(i, 'range_high');
    if (lo > hi) throw new CalcError('range_invalid', 'range_low');
    out.verdict = rs_per_w < lo ? 'below' : rs_per_w > hi ? 'above' : 'within';
  }
  return out;
});

/**
 * N12: soiling = min(rate × days, cap); loss kWh/day = kWp × yield × soiling; Rs lost = loss × tariff.
 * If cleaning_cost given: first day where cumulative Rs lost since cleaning > cleaning cost.
 */
export const cleaning_loss = calculator((i, d) => {
  const kwp = pos(i, 'kwp');
  const y = pos(i, 'yield');
  const rate = num(i, 'rate', { def: dflt(d, 'soiling_rate_per_day'), min: 0, max: 1 });
  const days = nonneg(i, 'days');
  const tariff = nonneg(i, 'tariff');
  const cap = dflt(d, 'soiling_cap');
  const soiling = Math.min(rate * days, cap);
  const loss_kwh_day = kwp * y * soiling;
  const out = { kwp, yield: y, rate, days, tariff, soiling, soiling_capped: rate * days > cap, loss_kwh_day, rs_lost_day: loss_kwh_day * tariff };
  if (i.cleaning_cost !== undefined && i.cleaning_cost !== '') {
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

/** N14: days = (Ah × V × DoD × η_inv) / (daily load Wh − cloudy-day solar Wh). */
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
  return { ah, v, dod, eta, load_wh, solar_wh, usable_wh, deficit_wh, days: usable_wh / deficit_wh };
});
