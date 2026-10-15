import { data, E } from './lib.mjs';
import { decide, priceRange, bill } from './indep.mjs';
const { home_decision } = await E('decision');
const { backup_compare } = await E('backup');
const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const R = (x) => Math.round(x).toLocaleString('en-US');
// 1. near ties: smallest |net gap| between the pick and the runner-up over a fine grid
let best = null;
for (let w = 100; w <= 1500; w += 5) for (const h of [1, 1.5, 2, 2.5, 3, 4]) for (const y of [5, 8, 10, 15]) for (const chem of ['lifepo4', 'tubular']) {
  const e = home_decision({ ...H, backup_w: w, backup_hours: h, years: y, chemistry: chem }, data);
  if (!e.ok) continue;
  const nets = ['hybrid', 'standby', 'combo'].filter((k) => e[`${k}_available`]).map((k) => [k, e[`${k}_rs`] + e[`${k}_repl_rs`] + y * 12 * (e[`${k}_running_rs`] - (k === 'standby' ? 0 : k === 'hybrid' ? e.full_saving_rs : e.setups[3].saving_month))]).sort((a, b) => a[1] - b[1]);
  const gap = nets[1][1] - nets[0][1];
  if (!best || gap < best.gap) best = { gap, w, h, y, chem, first: nets[0][0], second: nets[1][0], decision: e.decision, text: e.decision_text.split('. ').slice(-1)[0] };
}
console.log('closest call', JSON.stringify(best));
// 2. power-limited home: net with the engine's array vs the D7 (energy) array, no backup
const PL = [{ id: 'ac-split-1-5ton-inverter', qty: 3, hours: 2 }, { id: 'led-bulb', qty: 5 }];
const e = home_decision({ ...H, loads: PL, backup_hours: 0 }, data);
const x = decide({ ...H, loads: PL, backup_hours: 0 });
// own net-billing month for an array of P panels
const netFor = (P) => { const kw = P * 0.585; const solar = kw * 4 * 30; const self = Math.min(solar, x.units * 0.5); const exp = solar - self, imp = x.units - self; const after = Math.max(0, bill(imp, 4).total - exp * 8.13); const sav = Math.max(0, x.before - after); const [lo, hi] = priceRange('on-grid', kw); return { kw, sav, net: (lo + hi) / 2 - 120 * sav }; };
console.log('power-limited: engine', e.installed_kw, 'kW net', e.ongrid_net, '| own optimum over panel counts:', JSON.stringify([1, 2, 3, 4, 5, 6, 8, 10].map((P) => { const r = netFor(Math.min(P, 6)); return `${P}p ${r.kw.toFixed(2)}kW net ${R(r.net)}`; })));
// 3. N7 FAQ: "For bigger loads and long cuts [solar] is the cheapest per backup hour"
const big = [];
for (const load_w of [1000, 1500, 2000, 3000, 5000]) for (const hours of [6, 8, 12]) for (const years of [1, 2, 3, 5, 10]) { const n = backup_compare({ load_w, hours, years, tariff: 36.46 }, data); if (n.ok && n.cheapest_key !== 'solar') big.push({ load_w, hours, years, cheapest: n.cheapest_key }); }
console.log('N7 big+long cases where solar is NOT cheapest:', big.length, JSON.stringify(big.slice(0, 6)));
// 4. N7 key fact: generator dearest within the first year at the defaults; fuel price threshold
const n = backup_compare({ load_w: 600, hours: 4, years: 5, tariff: 36.46 }, data);
const y1 = { gen: n.gen_buy + n.gen_run_year, ups: n.ups_buy + n.ups_run_year, solar: n.solar_buy };
let fp = 398.3; while (fp > 0) { const m = backup_compare({ load_w: 600, hours: 4, years: 5, tariff: 36.46, fuel_price: fp }, data); if (m.gen_buy + m.gen_run_year < Math.max(m.ups_buy + m.ups_run_year, m.solar_buy)) break; fp -= 1; }
console.log('N7 first-year cost', JSON.stringify(Object.fromEntries(Object.entries(y1).map(([k, v]) => [k, R(v)]))), '| gen cheapest-to-buy?', n.gen_buy < n.ups_buy && n.gen_buy < n.solar_buy, '| claim fails at petrol <= Rs', fp);
// 5. N7 hybrid uses the export_capable:false 24 V 4 kW row with a 51.2 V pack
const n2 = backup_compare({ load_w: 600, hours: 4, years: 5, tariff: 36.46 }, data);
console.log('N7 hybrid inverter kW', n2.inverter_kw, '+ packs', n2.lithium_packs, '(pack', data.backup_prices.lithium_pack.size, ')');
// 6. H1 answer battery vs the recommended hybrid battery
const d = home_decision(H, data);
console.log('answer battery:', R(Math.ceil(d.battery_ah)), 'Ah at', d.battery_v, 'V =', (d.battery_kwh).toFixed(2), 'kWh | hybrid buys', d.hybrid_battery, '| UPS bank', d.standby_option);
for (const v of [12, 24, 48]) { const r = home_decision({ ...H, battery_v: v }, data); console.log(`battery_v ${v}: battery_ah ${r.battery_ah.toFixed(1)} | hybrid ${r.hybrid_option} | net ${r.hybrid_net} | decision ${r.decision_key}`); }
// 7. recharge baseline H1 vs N7 for the same UPS
console.log('UPS running a month: N7', R(n2.ups_run_year / 12), 'for 600 W (gross recharge x slab rate) | H1', R(home_decision({ ...H, backup_w: 600, years: 5 }, data).standby_running_rs), '(extra losses on whole bill)');
