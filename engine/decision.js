// Home Power Decision Engine (specs/formulas.md "Owner-approved tools", H1 home page): the Home Power Planner
// plus one decision step on the same inputs. Each setup is priced by the calculator that owns its prices
// (D14 priceRange, N7 backup_compare, section F bill_total); this file only adds them up and picks one.
import { calculator, CalcError, num, has, dflt } from './core.js';
import { fmt } from './format.js';
import { home_plan, netSaving } from './planner.js';
import { standbyFor, hybridBank } from './backup.js';
import { priceRange, hybridPremium } from './prices.js';

const mid = (r) => (r.low + r.high) / 2;
const rs = (v) => fmt(v, 'rs');
const net = (v) => (v >= 0 ? `${rs(v)} cost` : `${rs(-v)} saved`);
const SB = [['standby', 'UPS or generator'], ['combo', 'On-grid solar + UPS or generator']];

/**
 * Setups: on-grid solar (D14 price of the planner's billed array, whole-bill saving while the grid is on), hybrid (same
 * array, exports only while the grid is on, + a 48 V class bank bought whole + hybrid inverter premium), UPS or generator
 * (N7 for the backup load, on the same bill baseline), and on-grid solar with that UPS or generator. Net over the period =
 * price + replacements + years × 12 × (running − saving); the lowest net among the setups that meet the backup asked for
 * (and whose low price fits the budget) is recommended, and a runner-up whose net range overlaps it is a close call.
 */
export const home_decision = calculator((i, d) => {
  const p = home_plan.raw(i, d);
  const cp = d?.component_prices?.items;
  const bp = d?.backup_prices;
  if (!cp || !bp?.lithium_pack) throw new CalcError('price_data_missing', 'loads');
  const h = p.backup_hours;
  const years = num(i, 'years', { def: dflt(d, 'decision_years'), gt: 0, max: 30 });
  const budget = has(i, 'budget_rs') ? num(i, 'budget_rs', { gt: 0 }) : 0;
  const months = years * 12;
  const need = h > 0;
  // Power cuts spread evenly over the day: the grid is on for g of it (WL-93).
  const g = 1 - h / 24;
  const W = fmt(p.backup_w, 'int');
  const hours = `${fmt(h, '1')} h of ${W} W`;
  // Net billing accepts an array only up to the sanctioned load, so the solar setups are priced and named at the
  // array it accepts (the planner's net_billing_kw), never at panels with no benefit (WL-91); 0 = no solar setup.
  const kw = p.net_billing_kw;
  const pr = priceRange(d, 'on-grid', kw);
  const out = { ...p, years, budget_rs: budget, grid_share: g, low_confidence: pr.low_confidence };
  const setups = [];
  // One setup: price at the low, middle and high end, replacements, monthly saving and running cost.
  const add = (id, option, low, high, repl, saving, running, backup, ok = true, key = id) => {
    const t = repl + months * (running - saving);
    const s = { key, option, low, buy: (low + high) / 2, repl, saving, running, backup, ok, lo: low + t, hi: high + t };
    s.net_rs = s.buy + t;
    s.net = ok ? net(s.net_rs) : 'Not counted';
    s.price = ok ? `${rs(low)} to ${rs(high)}` : backup;
    setups.push(s);
    Object.assign(out, { [`${id}_option`]: option, [`${id}_low_rs`]: low, [`${id}_high_rs`]: high, [`${id}_rs`]: s.buy, [`${id}_repl_rs`]: repl, [`${id}_saving_rs`]: saving, [`${id}_running_rs`]: running, [`${id}_net`]: ok ? s.net : 'not counted', [`${id}_available`]: ok });
    return s;
  };
  const og = [pr.lo * kw * 1000, pr.hi * kw * 1000];
  const NOSUN = 'Sanctioned load too small';
  const K = kw ? ` ${fmt(kw, '2')} kW` : '';
  const o = add('ongrid', `On-grid solar${K}`, ...og, 0, Math.max(0, netSaving(p, d, g, 1, 0)), 0, kw ? 'None: switches off in a power cut' : NOSUN, kw > 0);
  const lines = kw ? [`${o.option}, installed: ${o.price}, saves ${rs(o.saving)} a month${need ? ' (only while the grid is on)' : ''}, no backup in a cut, net ${o.net}.`] : [];

  if (need) {
    // Hybrid: the bank, and the grid-tie hybrid inverter's premium over an on-grid one; it also carries the backup load.
    const [units, item, battery] = hybridBank(p, d);
    const [premium, known, hw, above, hkw] = hybridPremium(cp, p.net_billing_inverter_kw, (p.backup_w * p.margin) / 1000, dflt(d, 'hybrid_bank_v'));
    const repl = Math.max(0, Math.floor((years - 1e-9) / bp.battery_life_years[p.chemistry]));
    const bat = units * mid(item);
    const y = add('hybrid', `Hybrid solar${K} + ${battery}`, og[0] + premium + units * item.low, og[1] + premium + units * item.high, repl * bat, Math.max(0, netSaving(p, d, 1, g, 0)), 0, kw ? `${hours} from the battery` : NOSUN, kw > 0);
    if (kw) lines.push(`${y.option}: ${y.price} (the on-grid price plus ${rs(bat)} of battery; ${known ? `${rs(premium)} extra for` : 'extra cost not known (none added) for'} a ${fmt(hkw, 'up1')} kW grid-tie hybrid inverter${above ? ' (above our list: rough)' : ''}), saves ${rs(y.saving)} a month (exports only while the grid is on), battery replacements ${rs(repl * bat)}, net ${y.net}.`);
    Object.assign(out, { hybrid_battery: battery, hybrid_battery_units: units, hybrid_inverter_kw: hkw, hybrid_premium_rs: premium, hybrid_replacements: repl, low_confidence: out.low_confidence || hw || (item.n_sources ?? 0) < 2 });

    // UPS or generator (N7) on one bill baseline: a UPS recharge adds units to the whole bill, a generator takes the
    // backup units it supplies off it (WL-95); the generator also starts the backup load's motors (WL-96).
    const eb = -p.backup_kwh * dflt(d, 'days_per_month');
    const bin = { load_w: p.backup_w, surge_w: p.backup_surge_w, hours: h, years, tariff: p.rate_before, city: i.city, panel_w: p.panel_w };
    const sb = standbyFor(bin, d, (r) => -netSaving(p, d, 0, 0, r), netSaving(p, d, 0, 0, eb));
    if (sb) {
      const { u } = sb;
      const b = add('standby', sb.option, sb.lo, sb.hi, sb.repl, sb.save, sb.run, u ? hours : 'As long as there is petrol', true, sb.key);
      lines.push(`${b.option} for ${W} W: ${b.price}, ${u ? `grid recharge adds ${rs(b.running)} a month to the bill` : `petrol and oil cost ${rs(b.running)} a month, ${rs(b.saving)} of grid units off the bill`}, net ${b.net}.`);
      // On-grid solar + the same UPS or generator, in the same net-billed month.
      const cs = netSaving(p, d, g, 1, u ? sb.r : eb);
      const c = add('combo', `${o.option} + ${b.option}`, og[0] + sb.lo, og[1] + sb.hi, sb.repl, Math.max(0, cs), kw ? (u ? 0 : sb.run) + Math.max(0, -cs) : 0, kw ? b.backup : NOSUN, kw > 0);
      if (kw) lines.push(`${c.option}: ${c.price}, saves ${rs(c.saving)} a month${u ? (c.running ? `, the recharge adds ${rs(c.running)} a month` : ' with the recharge on the bill') : ` and burns ${rs(c.running)} of petrol and oil`}, net ${c.net}.`);
    } else {
      for (const [id, name] of SB) add(id, name, 0, 0, 0, 0, 0, 'Not available for this backup load', false);
      lines.push(`A UPS or generator for ${W} W is above our price lists.`);
    }
  } else {
    for (const [id, name] of [['hybrid', 'Hybrid solar + battery'], ...SB]) add(id, name, 0, 0, 0, 0, 0, 'Not needed without backup hours', false);
    lines.push('The setups with backup need backup hours.');
  }

  // Candidates: the setups that give backup when backup is asked for, else on-grid solar and staying on the grid.
  // With a budget a candidate counts when its low price fits it (WL-105).
  const grid = { key: 'grid', option: 'Stay on the grid (no purchase)', low: 0, buy: 0, saving: 0, running: 0, backup: 'None', net: rs(0), net_rs: 0, lo: 0, hi: 0, price: rs(0) };
  const pool = need ? setups.filter((x) => x.ok && x !== o) : kw ? [o, grid] : [grid];
  const fits = pool.filter((x) => !budget || x.low <= budget + 1e-9);
  const over = pool.length > 0 && !fits.length;
  const best = (a, b) => (b.net_rs < a.net_rs - 1e-9 || (Math.abs(b.net_rs - a.net_rs) <= 1e-9 && b.buy < a.buy) ? b : a);
  const pick = fits.length ? fits.reduce(best) : pool.length ? pool.reduce((a, b) => (b.low < a.low ? b : a)) : { ...grid, key: 'none', option: 'No setup in our price lists fits this backup load' };
  const rest = fits.filter((x) => x !== pick);
  const ru = rest.length ? rest.reduce(best) : null;
  // A close call: the runner-up's net range (low to high price) overlaps the pick's (WL-94).
  const close = Boolean(ru && ru.lo <= pick.hi + 1e-9 && pick.lo <= ru.hi + 1e-9);
  const tight = budget > 0 && !over && pick.buy > budget + 1e-9;
  const gap = over ? pick.low - budget : 0;
  return Object.assign(out, {
    setups: setups.map((x) => ({ option: x === pick ? `${x.option} (recommended)` : x.option, price: x.price, backup: x.backup, saving_month: x.saving, running_month: x.running, net: x.net })),
    decision_key: pick.key, decision: over ? `${pick.option} (over your budget by ${rs(gap)})` : pick.option,
    decision_text: [...lines, pick.key === 'none' ? `${pick.option}.` : over ? `Nothing with your backup fits your budget; cheapest: ${pick.option}, ${rs(gap)} over it.`
      : `Recommended, the lowest net ${need ? 'that gives your backup' : 'of on-grid solar and staying on the grid'}${budget ? ' within your budget' : ''}: ${pick.option}${tight ? ' (within it only at the low end of its price range)' : ''}.${close ? ` Close call: ${ru.option} is within the price ranges, so get quotes for both.` : ''}`].join(' '),
    decision_rs: pick.buy, decision_price: pick.price, close_call: close, ...(close ? { runner_up: ru.option } : {}), budget_low_end: tight,
    decision_saving_rs: pick.saving, decision_running_rs: pick.running, decision_backup: pick.backup, decision_net: pick.net, over_budget: over, budget_gap_rs: gap,
  });
});
