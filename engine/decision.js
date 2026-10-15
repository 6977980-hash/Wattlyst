// Home Power Decision Engine (specs/formulas.md "Owner-approved tools", H1 home page): the Home Power Planner
// plus one decision step on the same inputs. Each setup is priced by the calculator that owns its prices
// (D14 priceRange, N7 backup_compare, section F bill_total); this file only adds them up and picks one.
import { calculator, CalcError, num, has, ceilSafe, dflt } from './core.js';
import { fmt } from './format.js';
import { home_plan } from './planner.js';
import { backup_compare, backupAtEnd } from './backup.js';
import { priceRange, inverterAt } from './prices.js';
import { bill_total } from './bill.js';

const mid = (r) => (r.low + r.high) / 2;
const rs = (v) => fmt(v, 'rs');
const net = (v) => (v >= 0 ? `${rs(v)} cost` : `${rs(-v)} saved`);
const weak = (r) => (r.n_sources ?? 0) < 2;

/**
 * Setups: on-grid solar (D14 price of the planner's array, whole-bill saving, no backup), hybrid (same + a 48 V class
 * battery bank in whole packs or units + grid-tie hybrid inverter premium), UPS or generator (N7 for the backup
 * load; UPS recharge priced on the whole bill). Net over the period = price + replacements + years × 12 × (running −
 * saving); the lowest net among the setups that meet the backup asked for (and the budget) is recommended.
 */
export const home_decision = calculator((i, d) => {
  const p = home_plan.raw(i, d);
  const cp = d?.component_prices?.items;
  const bp = d?.backup_prices;
  if (!cp || !bp?.lithium_pack) throw new CalcError('price_data_missing', 'loads');
  if (p.backup_hours > 24) throw new CalcError('backup_hours_too_large', 'backup_hours');
  const years = num(i, 'years', { def: dflt(d, 'decision_years'), gt: 0, max: 30 });
  const budget = has(i, 'budget_rs') ? num(i, 'budget_rs', { gt: 0 }) : 0;
  const months = years * 12;
  const need = p.backup_hours > 0;
  const W = fmt(p.backup_w, 'int');
  const hours = `${fmt(p.backup_hours, '1')} h of ${W} W`;
  const kw = p.installed_kw;
  const pr = priceRange(d, 'on-grid', kw);
  const out = { ...p, years, budget_rs: budget, low_confidence: pr.low_confidence };
  const setups = [];
  // One setup: price at the low, middle and high end, replacements, monthly saving and running cost.
  const add = (id, key, option, low, high, repl, saving, running, backup, ok = true) => {
    const s = { key, option, low, high, buy: (low + high) / 2, saving, running, backup, ok };
    s.net_rs = s.buy + repl + months * (running - saving);
    s.net = ok ? net(s.net_rs) : 'Not counted';
    s.price = ok ? `${rs(low)} to ${rs(high)}` : backup;
    setups.push(s);
    Object.assign(out, { [`${id}_option`]: option, [`${id}_low_rs`]: low, [`${id}_high_rs`]: high, [`${id}_rs`]: s.buy, [`${id}_repl_rs`]: repl, [`${id}_running_rs`]: running, [`${id}_net`]: ok ? s.net : 'not counted', [`${id}_available`]: ok });
    return s;
  };
  const og = [pr.lo * kw * 1000, pr.hi * kw * 1000];
  const o = add('ongrid', 'ongrid', `On-grid solar ${fmt(kw, '2')} kW`, ...og, 0, p.full_saving_rs, 0, 'None: switches off in a power cut');
  out.ongrid_line = `${o.option}, installed: ${o.price}, saves ${rs(o.saving)} a month, no backup in a cut, net ${o.net}.`;

  if (need) {
    // Hybrid: the planner's backup energy as a 48 V class bank bought whole (LiFePO4 51.2 V packs or 12 V tubular units
    // in 48 V strings), and the grid-tie hybrid inverter's premium over an on-grid one; it also carries the backup load.
    const li = p.chemistry === 'lifepo4';
    const t = bp.tubular_unit;
    const bank_v = dflt(d, 'hybrid_bank_v');
    const units = li ? ceilSafe(p.battery_kwh / bp.lithium_pack.kwh) : ceilSafe((p.battery_kwh * 1000) / (bank_v * t.ah)) * ceilSafe(bank_v / t.v);
    const item = cp.find((x) => (li ? x.category === 'lithium_battery' && x.size === bp.lithium_pack.size : x.category === 'tubular_battery'));
    if (!item) throw new CalcError('price_data_missing', 'chemistry');
    const s = units > 1;
    const battery = li ? `${units} lithium pack${s ? 's' : ''} of ${fmt(bp.lithium_pack.kwh, '2')} kWh (51.2 V)` : `${units} tubular batter${s ? 'ies' : 'y'} of ${t.v} V ${t.ah} Ah (${bank_v} V bank)`;
    const hkw = Math.max(p.inverter_kw, (p.backup_w * p.margin) / 1000);
    const [hy, hw, above] = inverterAt(cp, 'hybrid_inverter', hkw);
    const [on, ow] = inverterAt(cp, 'ongrid_inverter', p.inverter_kw);
    const premium = Math.max(0, hy - on);
    const repl = Math.max(0, Math.floor((years - 1e-9) / bp.battery_life_years[p.chemistry]));
    const bat = units * mid(item);
    const h = add('hybrid', 'hybrid', `Hybrid solar ${fmt(kw, '2')} kW + ${battery}`, og[0] + premium + units * item.low, og[1] + premium + units * item.high, repl * bat, p.full_saving_rs, 0, `${hours} from the battery`);
    out.hybrid_line = `${h.option}: ${h.price} (the on-grid price plus ${rs(bat)} of battery and ${rs(premium)} extra for a ${fmt(hkw, 'up1')} kW grid-tie hybrid inverter${above ? ' (above our list: rough)' : ''}), battery replacements ${rs(repl * bat)}, net ${h.net}.`;
    Object.assign(out, { hybrid_battery: battery, hybrid_battery_units: units, hybrid_battery_rs: bat, hybrid_inverter_kw: hkw, hybrid_premium_rs: premium, hybrid_replacements: repl, low_confidence: out.low_confidence || hw || ow || weak(item) });

    // UPS or generator: N7 for the backup load; the UPS recharge is priced on the whole bill (section F bill_total of
    // the month's units plus the recharge units, less the bill without them), as the solar saving is.
    const bin = { load_w: p.backup_w, hours: p.backup_hours, years, tariff: p.rate_before, city: i.city, panel_w: p.panel_w };
    const n = backup_compare(bin, d);
    if (n.ok) {
      const ups_run = bill_total.raw({ sanctioned_kw: p.sanctioned_kw, protected: false, units: p.monthly_units + n.recharge_kwh_year / 12 }, d).total_rs - p.full_before_rs;
      const u = n.ups_ok && n.ups_buy + n.ups_repl_rs + months * ups_run <= n.gen_total;
      const [lo, hi] = ['low', 'high'].map((e) => backup_compare(bin, backupAtEnd(d, e))[u ? 'ups_buy' : 'gen_buy']);
      const b = add('standby', u ? 'ups' : 'gen', u ? `UPS ${n.ups_kva} kVA + ${n.batteries} tubular batter${n.batteries > 1 ? 'ies' : 'y'}` : `Petrol generator ${n.gen_kva} kVA`, lo, hi, u ? n.ups_repl_rs : 0, 0, u ? ups_run : n.gen_run_year / 12, u ? hours : 'As long as there is petrol');
      out.standby_line = `${b.option} for ${W} W: ${b.price}, ${u ? `grid recharge adds ${rs(b.running)} a month to the bill` : `petrol and oil cost ${rs(b.running)} a month`}, net ${b.net}.`;
    } else {
      add('standby', 'standby', 'UPS or generator', 0, 0, 0, 0, 0, 'Not available for this backup load', false);
      out.standby_line = `A UPS or generator for ${W} W is above our price lists.`;
    }
  } else {
    for (const [id, name] of [['hybrid', 'Hybrid solar + battery'], ['standby', 'UPS or generator']]) add(id, id, name, 0, 0, 0, 0, 0, 'Not needed without backup hours', false);
    Object.assign(out, {
      hybrid_line: 'Hybrid solar and a UPS or generator are not needed without backup hours;', standby_line: 'add backup hours to compare them.' });
  }

  // Candidates: the setups that give backup when backup is asked for, else on-grid solar and staying on the grid.
  const grid = { key: 'grid', option: 'Stay on the grid (no purchase)', low: 0, high: 0, buy: 0, saving: 0, running: 0, backup: 'None', net: rs(0), net_rs: 0, price: rs(0) };
  const pool = need ? setups.slice(1).filter((x) => x.ok) : [setups[0], grid];
  const fits = pool.filter((x) => !budget || x.buy <= budget + 1e-9);
  const over = pool.length > 0 && !fits.length;
  const pick = fits.length ? fits.reduce((a, b) => (b.net_rs < a.net_rs - 1e-9 || (Math.abs(b.net_rs - a.net_rs) <= 1e-9 && b.buy < a.buy) ? b : a))
    : pool.length ? pool.reduce((a, b) => (b.buy < a.buy ? b : a)) : { ...grid, key: 'none', option: 'No setup in our price lists fits this backup load' };
  const gap = over ? pick.buy - budget : 0;
  return Object.assign(out, {
    setups: setups.map((x) => ({ option: x === pick ? `${x.option} (recommended)` : x.option, price: x.price, backup: x.backup, saving_month: x.saving, running_month: x.running, net: x.net })),
    decision_key: pick.key, decision: over ? `${pick.option} (over your budget by ${rs(gap)})` : pick.option,
    decision_line: pick.key === 'none' ? `${pick.option}.` : over ? `Nothing with your backup fits your budget; cheapest: ${pick.option}, ${rs(gap)} over it.`
      : `Recommended, the lowest net ${need ? 'that gives your backup' : 'of on-grid solar and staying on the grid'}${budget ? ' within your budget' : ''}: ${pick.option}.`,
    decision_rs: pick.buy, decision_price: pick.price,
    decision_saving_rs: pick.saving, decision_running_rs: pick.running, decision_backup: pick.backup, decision_net: pick.net, over_budget: over, budget_gap_rs: gap,
  });
});
