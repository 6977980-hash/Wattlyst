// Home Power Decision Engine (specs/formulas.md "Owner-approved tools", H1 home page): the Home Power Planner
// plus one decision step on the same inputs. Each setup is priced by the calculator that owns its prices
// (D14 priceRange, N7 backup_compare); this file only adds them up and picks one.
import { calculator, CalcError, num, has, ceilSafe, dflt } from './core.js';
import { fmt } from './format.js';
import { home_plan } from './planner.js';
import { backup_compare } from './backup.js';
import { priceRange } from './prices.js';

const mid = (r) => (r.low + r.high) / 2;
const rs = (v) => fmt(v, 'rs');
const net = (v) => (v >= 0 ? `${rs(v)} cost` : `${rs(-v)} saved`);

/** Middle price of an inverter type at kW: exact size, linear between listed sizes, nearest end's Rs per kW outside. */
function inverterAt(items, category, kw) {
  const rows = items.filter((x) => x.category === category).map((x) => ({ kw: parseFloat(x.size), rs: mid(x) })).sort((a, b) => a.kw - b.kw);
  const a = rows.filter((r) => r.kw <= kw).pop() || rows[0];
  const b = rows.find((r) => r.kw > kw);
  return !b || kw <= a.kw ? (a.rs / a.kw) * kw : a.rs + ((b.rs - a.rs) * (kw - a.kw)) / (b.kw - a.kw);
}

/** Data with every N7 equipment range at one end (low or high), for the uncertainty range of the UPS or generator. */
function atEnd(d, e) {
  const one = (o) => ({ ...o, low: o[e], high: o[e] });
  const bp = d.backup_prices;
  const up = bp.generator_upkeep;
  return { ...d, component_prices: { items: d.component_prices.items.map(one) },
    backup_prices: { ...bp, ups: bp.ups.map(one), generators: bp.generators.map(one), generator_upkeep: { ...up, oil_rs_per_l_low: up[`oil_rs_per_l_${e}`], oil_rs_per_l_high: up[`oil_rs_per_l_${e}`] } } };
}

/**
 * Setups: on-grid solar (D14 price of the planner's array, whole-bill saving, no backup), hybrid (same + battery
 * bank in whole packs or units + hybrid inverter premium), UPS or generator (N7 for the backup load).
 * Net over the period = price + replacements + years × 12 × (running − saving); the lowest net among the setups
 * that meet the backup asked for (and the budget) is recommended.
 */
export const home_decision = calculator((i, d) => {
  const p = home_plan.raw(i, d);
  const cp = d?.component_prices?.items;
  const bp = d?.backup_prices;
  if (!cp || !bp?.lithium_pack) throw new CalcError('price_data_missing', 'loads');
  const years = num(i, 'years', { def: dflt(d, 'decision_years'), gt: 0, max: 30 });
  const budget = has(i, 'budget_rs') ? num(i, 'budget_rs', { gt: 0 }) : 0;
  const months = years * 12;
  const need = p.backup_hours > 0;
  const hours = `${fmt(p.backup_hours, '1')} h of ${fmt(p.backup_w, 'int')} W`;
  const kw = p.installed_kw;
  const pr = priceRange(d, 'on-grid', kw);
  const out = { ...p, years, budget_rs: budget, low_confidence: pr.low_confidence };
  const setups = [];
  // One setup: price at the low, middle and high end, replacements, monthly saving and running cost.
  const add = (id, key, option, low, high, repl, saving, running, backup, ok = true) => {
    const s = { id, key, option, low, high, buy: (low + high) / 2, saving, running, backup, ok };
    s.net_rs = s.buy + repl + months * (running - saving);
    s.net = ok ? net(s.net_rs) : 'Not counted';
    s.price = ok ? `${rs(low)} to ${rs(high)}` : backup;
    setups.push(s);
    Object.assign(out, { [`${id}_option`]: option, [`${id}_price`]: ok ? s.price : backup.toLowerCase(), [`${id}_low_rs`]: low, [`${id}_high_rs`]: high, [`${id}_rs`]: s.buy, [`${id}_repl_rs`]: repl, [`${id}_running_rs`]: running, [`${id}_net`]: ok ? s.net : 'not counted', [`${id}_available`]: ok });
  };
  const og = [pr.lo * kw * 1000, pr.hi * kw * 1000];
  add('ongrid', 'ongrid', `On-grid solar ${fmt(kw, '2')} kW`, ...og, 0, p.full_saving_rs, 0, 'None: switches off in a power cut');

  if (need) {
    // Hybrid: the planner's bank bought whole, the hybrid inverter's premium over an on-grid one of the plan's kW;
    // the hybrid inverter also carries the backup load in a cut.
    const li = p.chemistry === 'lifepo4';
    const t = bp.tubular_unit;
    const units = li ? ceilSafe(p.battery_kwh / bp.lithium_pack.kwh) : ceilSafe(p.battery_ah / t.ah) * ceilSafe(p.battery_v / t.v);
    const item = cp.find((x) => (li ? x.category === 'lithium_battery' && x.size === bp.lithium_pack.size : x.category === 'tubular_battery'));
    if (!item) throw new CalcError('price_data_missing', 'chemistry');
    const s = units > 1;
    const battery = li ? `${units} lithium pack${s ? 's' : ''} of ${fmt(bp.lithium_pack.kwh, '2')} kWh` : `${units} tubular batter${s ? 'ies' : 'y'} of ${t.v} V ${t.ah} Ah`;
    const hkw = Math.max(p.inverter_kw, (p.backup_w * p.margin) / 1000);
    const premium = Math.max(0, inverterAt(cp, 'hybrid_inverter', hkw) - inverterAt(cp, 'ongrid_inverter', p.inverter_kw));
    const repl = Math.max(0, Math.floor((years - 1e-9) / bp.battery_life_years[p.chemistry]));
    add('hybrid', 'hybrid', `Hybrid solar ${fmt(kw, '2')} kW + ${battery}`, og[0] + premium + units * item.low, og[1] + premium + units * item.high, repl * units * mid(item), p.full_saving_rs, 0, `${hours} from the battery`);
    Object.assign(out, { hybrid_battery: battery, hybrid_battery_units: units, hybrid_battery_rs: units * mid(item), hybrid_inverter_kw: hkw, hybrid_premium_rs: premium, hybrid_replacements: repl });

    // UPS or generator: N7 for the backup load at the planner's slab rate; the cheaper of the UPS (if it refills) and the generator.
    const bin = { load_w: p.backup_w, hours: p.backup_hours, years, tariff: p.rate_before, city: i.city, panel_w: p.panel_w };
    const n = backup_compare(bin, d);
    if (n.ok) {
      const u = n.ups_ok && n.ups_total <= n.gen_total;
      const [lo, hi] = ['low', 'high'].map((e) => backup_compare(bin, atEnd(d, e))[u ? 'ups_buy' : 'gen_buy']);
      add('standby', u ? 'ups' : 'gen', u ? `UPS ${n.ups_kva} kVA + ${n.batteries} tubular batter${n.batteries > 1 ? 'ies' : 'y'}` : `Petrol generator ${n.gen_kva} kVA`, lo, hi, u ? n.ups_repl_rs : 0, 0, (u ? n.ups_run_year : n.gen_run_year) / 12, u ? hours : 'As long as there is petrol');
    } else add('standby', 'standby', 'UPS or generator', 0, 0, 0, 0, 0, 'Not available for this backup load', false);
  } else {
    add('hybrid', 'hybrid', 'Hybrid solar + battery', 0, 0, 0, 0, 0, 'Not needed without backup hours', false);
    add('standby', 'standby', 'UPS or generator', 0, 0, 0, 0, 0, 'Not needed without backup hours', false);
    Object.assign(out, { hybrid_battery: 'none', hybrid_battery_units: 0, hybrid_battery_rs: 0, hybrid_inverter_kw: 0, hybrid_premium_rs: 0, hybrid_replacements: 0 });
  }

  // Candidates: the setups that give backup when backup is asked for, else on-grid solar and staying on the grid.
  const grid = { key: 'grid', option: 'Stay on the grid (no purchase)', low: 0, high: 0, buy: 0, saving: 0, running: 0, backup: 'None', net: rs(0), net_rs: 0 };
  const pool = need ? setups.slice(1).filter((x) => x.ok) : [setups[0], grid];
  const fits = pool.filter((x) => !budget || x.buy <= budget + 1e-9);
  const over = pool.length > 0 && !fits.length;
  const pick = fits.length ? fits.reduce((a, b) => (b.net_rs < a.net_rs - 1e-9 || (Math.abs(b.net_rs - a.net_rs) <= 1e-9 && b.buy < a.buy) ? b : a))
    : pool.length ? pool.reduce((a, b) => (b.buy < a.buy ? b : a)) : { ...grid, key: 'none', option: 'No setup in our price lists fits this backup load' };
  const gap = over ? pick.buy - budget : 0;
  return Object.assign(out, {
    setups: setups.map((x) => ({ option: x === pick ? `${x.option} (recommended)` : x.option, price: x.price, backup: x.backup, saving_month: x.saving, running_month: x.running, net: x.net })),
    decision_key: pick.key, decision: over ? `${pick.option} (over your budget by ${rs(gap)})` : pick.option,
    decision_rs: pick.buy, decision_low_rs: pick.low, decision_high_rs: pick.high, decision_price: pick.buy ? `${rs(pick.low)} to ${rs(pick.high)}` : rs(0),
    decision_saving_rs: pick.saving, decision_running_rs: pick.running, decision_backup: pick.backup, decision_net: pick.net, over_budget: over, budget_gap_rs: gap,
  });
});
