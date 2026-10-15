// N7: UPS vs generator vs hybrid solar for the same loadshedding backup: total cost over the years and cost per backup hour.
// Own module so no other page ships it. Every price, life and upkeep figure comes from data/ (equipment only, middle of each range).
import { calculator, CalcError, pos, nonneg, num, pick, ceilSafe, dflt } from './core.js';

const mid = (r) => (r.low + r.high) / 2;
const sizeKw = (s) => parseFloat(String(s));

/**
 * Backup energy a day E = load W × outage h. Backup hours over the period = h × days × 12 × years.
 * UPS: smallest listed UPS with rated W ≥ load × margin; tubular bank Wh = E ÷ (DoD × η_inv), strings = ceil(Wh ÷ (V_bank × Ah)),
 *   batteries = strings × V_bank ÷ V_battery; grid recharge = E ÷ (η_chg × η_inv) × tariff; replacements every tubular life.
 * Generator: smallest listed set with kVA × PF ≥ load × margin; fuel L/h = C8 curve; oil change every N hours.
 * Hybrid solar: smallest listed hybrid inverter with kW ≥ load × margin; LiFePO4 kWh = E ÷ (DoD × η_hybrid);
 *   bought in whole packs (data/backup-prices.json lithium_pack, priced in data/component-prices.json);
 *   panels to refill it on an average day = ceil(E ÷ η_inv ÷ η_chg ÷ yield ÷ panel W); no running cost; replacements every LiFePO4 life.
 * Total = purchase + years × running a year + replacements; per backup hour = total ÷ backup hours.
 */
export const backup_compare = calculator((i, d) => {
  const bp = d?.backup_prices;
  const cp = d?.component_prices?.items;
  const panel = d?.solar_prices?.panel_rs_per_w;
  if (!bp?.ups?.length || !bp?.generators?.length || !Array.isArray(cp) || !(panel?.low > 0)) throw new CalcError('price_data_missing', 'load_w');
  const load_w = pos(i, 'load_w', undefined, 'load_must_be_positive');
  const hours = num(i, 'hours', { gt: 0, max: 24 });
  const days = num(i, 'days', { def: dflt(d, 'days_per_month'), gt: 0, max: 31 });
  const years = num(i, 'years', { gt: 0, max: 30 });
  const tariff = nonneg(i, 'tariff');
  const fuel = pick(i, 'fuel', ['petrol'], 'petrol');
  const fuel_price = nonneg(i, 'fuel_price', d?.generator_fuel?.prices?.[fuel]?.rs_per_litre);
  const city = String(i.city ?? 'lahore').trim().toLowerCase();
  const c = d?.cities?.[city];
  if (!c || !(c.yield > 0)) throw new CalcError('city_unknown', 'city');
  const margin = dflt(d, 'margin');
  const need_w = load_w * margin;
  const day_kwh = (load_w * hours) / 1000;
  const backup_hours = hours * days * 12 * years;
  const per_year = days * 12;

  // UPS with tubular batteries
  const ups = [...bp.ups].sort((a, b) => a.rated_w - b.rated_w).find((u) => u.rated_w >= need_w - 1e-9);
  if (!ups) throw new CalcError('load_w_too_large', 'load_w');
  const tub = bp.tubular_unit;
  const tubItem = cp.find((x) => x.category === 'tubular_battery');
  const dod_t = dflt(d, 'dod_lead_acid');
  const eta_ups = dflt(d, 'inverter_eff_ups');
  const bank_wh = (day_kwh * 1000) / (dod_t * eta_ups);
  const series = ups.battery_v / tub.v;
  const strings = ceilSafe(bank_wh / (ups.battery_v * tub.ah));
  const batteries = strings * series;
  const ups_buy = mid(ups) + batteries * mid(tubItem);
  const recharge_kwh_year = (day_kwh / (dflt(d, 'charge_eff_lead_acid') * eta_ups)) * per_year;
  const ups_run_year = recharge_kwh_year * tariff;
  const life_t = bp.battery_life_years.tubular;
  const ups_repl = Math.max(0, Math.floor((years - 1e-9) / life_t));
  const ups_repl_rs = ups_repl * batteries * mid(tubItem);
  const ups_total = ups_buy + years * ups_run_year + ups_repl_rs;

  // Petrol generator
  const pf = dflt(d, 'pf_generator');
  const gen = [...bp.generators].sort((a, b) => a.kva - b.kva).find((g) => g.kva * pf * 1000 >= need_w - 1e-9);
  if (!gen) throw new CalcError('load_w_too_large', 'load_w');
  const curve = d.generator_fuel.fuels[fuel];
  const l_per_h = curve.intercept_l_per_h_per_kw_rated * gen.kva * pf + curve.slope_l_per_kwh * (load_w / 1000);
  const up = bp.generator_upkeep;
  const run_h_year = hours * per_year;
  const fuel_year = l_per_h * run_h_year * fuel_price;
  const oil_year = (run_h_year / up.oil_change_hours) * up.oil_l * ((up.oil_rs_per_l_low + up.oil_rs_per_l_high) / 2);
  const gen_buy = mid(gen);
  const gen_run_year = fuel_year + oil_year;
  const gen_total = gen_buy + years * gen_run_year;

  // Hybrid solar with LiFePO4
  const invs = cp.filter((x) => x.category === 'hybrid_inverter').map((x) => ({ kw: sizeKw(x.size), rs: mid(x) })).sort((a, b) => a.kw - b.kw);
  const inv = invs.find((x) => x.kw * 1000 >= need_w - 1e-9);
  if (!inv) throw new CalcError('load_w_too_large', 'load_w');
  const pack = bp.lithium_pack;
  const liItem = cp.find((x) => x.category === 'lithium_battery' && x.size === pack.size);
  const eta_h = dflt(d, 'inverter_eff_hybrid');
  const li_need_kwh = day_kwh / (dflt(d, 'dod_lifepo4') * eta_h);
  const li_packs = ceilSafe(li_need_kwh / pack.kwh);
  const li_kwh = li_packs * pack.kwh;
  const panel_w = pos(i, 'panel_w', dflt(d, 'panel_w'));
  const refill_kwh = day_kwh / eta_h / dflt(d, 'charge_eff_lifepo4');
  const panels = ceilSafe((refill_kwh / c.yield) * 1000 / panel_w);
  const solar_buy = inv.rs + li_packs * mid(liItem) + panels * panel_w * ((panel.low + panel.high) / 2);
  const life_l = bp.battery_life_years.lifepo4;
  const solar_repl = Math.max(0, Math.floor((years - 1e-9) / life_l));
  const solar_repl_rs = solar_repl * li_packs * mid(liItem);
  const solar_total = solar_buy + solar_repl_rs;

  const options = [
    { key: 'ups', name: 'UPS', option: `UPS ${ups.kva} kVA + ${batteries} tubular`, buy: ups_buy, run_year: ups_run_year, replacements: ups_repl, repl_rs: ups_repl_rs, total: ups_total, per_hour: ups_total / backup_hours },
    { key: 'gen', name: 'Petrol generator', option: `Petrol generator ${gen.kva} kVA`, buy: gen_buy, run_year: gen_run_year, replacements: 0, repl_rs: 0, total: gen_total, per_hour: gen_total / backup_hours },
    { key: 'solar', name: 'Hybrid solar', option: `Hybrid solar ${inv.kw} kW + ${li_packs} lithium pack${li_packs > 1 ? 's' : ''}`, buy: solar_buy, run_year: 0, replacements: solar_repl, repl_rs: solar_repl_rs, total: solar_total, per_hour: solar_total / backup_hours },
  ];
  const best = options.reduce((b, o) => (o.total < b.total ? o : b), options[0]);
  return {
    load_w, hours, days, years, tariff, fuel, fuel_price, city, margin, day_kwh, backup_hours,
    ups_kva: ups.kva, ups_rated_w: ups.rated_w, bank_v: ups.battery_v, battery_ah: tub.ah, battery_v: tub.v, bank_wh, batteries, recharge_kwh_year, tubular_life_years: life_t,
    gen_kva: gen.kva, gen_rated_kw: gen.kva * pf, l_per_h, run_h_year, fuel_year, oil_year, oil_change_hours: up.oil_change_hours,
    inverter_kw: inv.kw, lithium_need_kwh: li_need_kwh, lithium_packs: li_packs, lithium_kwh: li_kwh, panels, panel_w, solar_kw: (panels * panel_w) / 1000, lifepo4_life_years: life_l,
    ups_buy, ups_run_year, ups_repl, ups_repl_rs, ups_total, ups_per_hour: ups_total / backup_hours,
    gen_buy, gen_run_year, gen_total, gen_per_hour: gen_total / backup_hours,
    solar_buy, solar_repl, solar_repl_rs, solar_total, solar_per_hour: solar_total / backup_hours,
    cheapest: best.name, cheapest_key: best.key,
    options,
  };
});
