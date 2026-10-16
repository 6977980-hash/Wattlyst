// Decision-quality analysis on top of the verified engine (each block prints the numbers used in findings.md).
import { data, E } from './lib.mjs';
import { decide, bill, priceRange, n7 } from './indep.mjs';
const { home_decision } = await E('decision');
const { backup_compare } = await E('backup');
const { calculators: C } = await E('index');
const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const R = (x) => Math.round(x).toLocaleString('en-US');
const sec = (t) => console.log(`\n=== ${t}`);

// A. Robustness of the pick across the shown price ranges: net at each setup's low and high end.
sec('A. pick vs price ends (net = end price + repl + months x (run - saving))');
const scen = { default: {}, tubular: { chemistry: 'tubular' }, 'backup 200W 1h': { backup_w: 200, backup_hours: 1 }, 'years 30': { years: 30 }, 'years 1': { years: 1 } };
for (const [n, ov] of Object.entries(scen)) {
  const x = decide({ ...H, ...ov });
  const M = (H.years && (ov.years ?? H.years)) * 12;
  const ks = ['hybrid', 'standby', 'combo'].filter((k) => x.S[k]);
  const at = (k, e) => (e === 'lo' ? x.S[k].lo : e === 'hi' ? x.S[k].hi : x.S[k].buy) + x.S[k].repl + M * (x.S[k].run - x.S[k].sav);
  const best = (f) => ks.reduce((a, b) => (f(b) < f(a) ? b : a));
  const mids = Object.fromEntries(ks.map((k) => [k, R(at(k, 'mid'))]));
  // worst case for the pick vs best case for each rival
  const flips = ks.filter((k) => k !== x.pick && at(k, 'lo') < at(x.pick, 'hi'));
  console.log(n, '| pick', x.pick, '| mids', JSON.stringify(mids), '| all-low pick', best((k) => at(k, 'lo')), '| all-high pick', best((k) => at(k, 'hi')), '| rivals that win if pick at high & rival at low:', flips.join(',') || 'none', '| gap to 2nd (mid):', R(Math.min(...ks.filter((k) => k !== x.pick).map((k) => at(k, 'mid'))) - at(x.pick, 'mid')));
}

// B. Generator vs UPS energy baseline. UPS: only losses r = recharge - backup units (backup units already in the bill).
// Generator: pays petrol for the backup units but the bill is still charged for them (no credit).
sec('B. generator displaced-grid credit');
for (const ov of [{ backup_hours: 12 }, { backup_hours: 8, backup_w: 1500 }, { backup_hours: 4, backup_w: 3000 }, { backup_hours: 6 }]) {
  const inp = { ...H, ...ov };
  const e = home_decision(structuredClone(inp), data);
  const x = decide(inp);
  const disp = ((inp.backup_w * inp.backup_hours) / 1000) * 30;
  const credit = x.before - bill(Math.max(0, x.units - disp), 4).total;
  console.log(JSON.stringify(ov), '| standby', e.standby_option, '| gen running/month', R(e.standby_running_rs), '| backup units/month', R(disp), '| bill credit for displaced units/month', R(credit), '| over years', R(credit * inp.years * 12), '| standby net', e.standby_net, '| pick', e.decision_key);
}

// C. Outage-blind solar saving: on-grid (and combo) solar is off during cuts; uniform-cut model saving × (24-h)/24.
sec('C. on-grid solar off in a cut (uniform cut model)');
for (const ov of [{}, { chemistry: 'tubular' }, { backup_w: 200, backup_hours: 1 }, { backup_hours: 8 }, { backup_hours: 12 }, { backup_hours: 24 }]) {
  const inp = { ...H, ...ov };
  const e = home_decision(structuredClone(inp), data);
  const x = decide(inp);
  const h = inp.backup_hours, M = inp.years * 12;
  const f = (24 - h) / 24;
  const adj = { ...Object.fromEntries(['hybrid', 'standby', 'combo'].filter((k) => x.S[k]).map((k) => [k, x.S[k].net])) };
  if (adj.combo !== undefined) adj.combo = x.S.combo.buy + x.S.combo.repl + M * (x.S.combo.run - x.S.combo.sav * f);
  const pick2 = Object.keys(adj).reduce((a, b) => (adj[b] < adj[a] ? b : a));
  console.log(JSON.stringify(ov), '| engine pick', e.decision_key, '| combo saving', R(x.S.combo?.sav ?? 0), '-> adj', R((x.S.combo?.sav ?? 0) * f), '| hybrid saving', R(x.S.hybrid.sav), '| UPS ok', x._n7ups ?? '', '| adj pick (combo derated only)', pick2, '| ups_ok?', e.standby_option);
}
const e24 = home_decision({ ...H, backup_hours: 24 }, data);
console.log('24 h: hybrid saving/month', R(e24.hybrid_running_rs === 0 ? e24.full_saving_rs : 0), 'export units', R(e24.export_units), 'UPS refill hours', backup_compare({ load_w: 500, hours: 24, years: 10, tariff: 36.46 }, data).refill_hours, '| combo option', e24.combo_option, e24.combo_net, '| hybrid', e24.hybrid_net);

// D. Array above the sanctioned load: priced in full, saving only from the billed panels.
sec('D. array above sanctioned load');
const big = [{ id: 'ceiling-fan-ac', qty: 8 }, { id: 'led-bulb', qty: 20 }, { id: 'ac-split-1-5ton-inverter', qty: 3, hours: 8 }, { id: 'refrigerator-inverter', qty: 2 }, { id: 'led-tv-43', qty: 2 }];
for (const ov of [{ loads: big }, { loads: big, backup_hours: 0 }, { loads: big, sanctioned_kw: 2 }]) {
  const inp = { ...H, ...ov };
  const e = home_decision(structuredClone(inp), data);
  const og = priceRange('on-grid', e.net_billing_kw);
  console.log('installed', e.installed_kw, 'kW, sanctioned', e.sanctioned_kw, '| billed', e.net_billing_kw, 'kW | on-grid mid priced', R(e.ongrid_rs), '| mid for billed array', R((og[0] + og[1]) / 2), '| extra paid for panels with zero counted benefit', R(e.ongrid_rs - (og[0] + og[1]) / 2), '| decision', e.decision, e.decision_net);
}

// E. Power-limited sizing on an on-grid home: H1 sizes by midday running load, D2/D7 by units.
sec('E. power-limited array (few AC hours)');
for (const loads of [[{ id: 'ac-split-1-5ton-inverter', qty: 3, hours: 2 }, { id: 'led-bulb', qty: 5 }], [{ id: 'ac-split-1-5ton-non-inverter', qty: 2, hours: 3 }, { id: 'ceiling-fan-ac', qty: 3 }]]) {
  const e = home_decision({ ...H, loads, backup_hours: 0 }, data);
  const d2 = C.solar_size({ monthly_units: e.monthly_units, city: 'lahore', panel_w: 585 }, data);
  const e2 = home_decision({ ...H, loads, backup_hours: 0, sanctioned_kw: 4.9 }, data);
  const og = priceRange('on-grid', d2.installed_kw);
  console.log('units', R(e.monthly_units), '| H1 array', e.installed_kw, `(${e.solar_limited_by})`, '| billed', e.net_billing_kw, '| D2/D7 array', d2.installed_kw, '| H1 on-grid mid', R(e.ongrid_rs), 'vs D7-size mid', R((og[0] + og[1]) / 2), '| H1 pick', e.decision, e.ongrid_net, '| sanct 4.9 billed', e2.net_billing_kw);
}

// F. Hybrid premium at the default and the on-grid inverter rows.
sec('F. inverter rows');
const cp = data.component_prices.items.filter((x) => x.category.endsWith('inverter')).map((x) => `${x.category} ${x.size} mid ${R((x.low + x.high) / 2)} per kW ${R((x.low + x.high) / 2 / parseFloat(x.size))}${x.export_capable === false ? ' (not export)' : ''}`);
console.log(cp.join('\n'));
const e0 = home_decision(H, data);
console.log('default hybrid premium', e0.hybrid_premium_rs, 'hybrid kW', e0.hybrid_inverter_kw);
for (const kw of [2, 3, 4, 5, 6, 8, 10]) {
  const e = home_decision({ ...H, backup_w: (kw * 1000) / 1.25 }, data);
  console.log(`hybrid kW ${kw} premium ${R(e.hybrid_premium_rs)} (planner inverter ${e.inverter_kw.toFixed(2)})`);
}

// G. N7 vs H1 for the same backup scenario: does N7 recommend solar while H1 recommends no solar, or vice versa?
sec('G. N7 cheapest vs H1 decision grid');
const opp = [];
for (const load of [150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 3000]) for (const hours of [1, 2, 3, 4, 6, 8, 12]) for (const years of [1, 3, 5, 10]) {
  const e = home_decision({ ...H, backup_w: load, backup_hours: hours, years }, data);
  const n = backup_compare({ load_w: load, hours, years, tariff: e.rate_before, city: 'lahore' }, data);
  if (!e.ok || !n.ok) continue;
  const hSolar = ['hybrid', 'combo'].includes(e.decision_key), nSolar = n.cheapest_key === 'solar';
  const hStandbyKind = e.standby_option?.startsWith('UPS') ? 'ups' : 'gen';
  const nStandby = n.ups_ok && n.ups_total <= n.gen_total ? 'ups' : 'gen';
  if (hSolar !== nSolar || hStandbyKind !== nStandby) opp.push({ load, hours, years, n7: n.cheapest_key, h1: e.decision_key, h1_standby: hStandbyKind, n7_ups_vs_gen: nStandby });
}
const solarFlip = opp.filter((o) => (o.n7 === 'solar') !== ['hybrid', 'combo'].includes(o.h1));
const sbFlip = opp.filter((o) => o.h1_standby !== o.n7_ups_vs_gen);
console.log('grid points', 12 * 7 * 4, '| N7 says solar xor H1 says solar:', solarFlip.length, JSON.stringify(solarFlip.slice(0, 8)));
console.log('UPS-vs-generator choice differs (H1 standby vs N7 own totals):', sbFlip.length, JSON.stringify(sbFlip.slice(0, 8)));
const n7only = solarFlip.filter((o) => o.n7 === 'solar' && o.h1 === 'ups' || o.h1 === 'gen');
console.log('N7 solar but H1 UPS/generator only:', JSON.stringify(solarFlip.filter((o) => o.n7 === 'solar').slice(0, 6)), '| N7 UPS/gen but H1 hybrid:', JSON.stringify(solarFlip.filter((o) => o.n7 !== 'solar' && o.h1 === 'hybrid').slice(0, 6)));

// H. UPS rating: N7 "UPS 1 kVA" carries up to 720 W (900 W rated / 1.25); B5 with 1 kVA at PF 0.6 carries 600 W.
sec('H. UPS 1 kVA: N7 vs B5');
for (const w of [500, 600, 650, 700, 720]) {
  const n = backup_compare({ load_w: w, hours: 2, years: 5, tariff: 36.46 }, data);
  const b = C.ups_backup({ va: 1000, ah: 200, volts: 12, chemistry: 'tubular', load_w: w }, data);
  console.log(`${w} W: N7 UPS ${n.ups_kva} kVA (rated ${n.ups_rated_w} W) | B5 1000 VA: ${b.ok ? `runs, ${b.hours?.toFixed?.(2) ?? ''} h` : b.error}`);
}

// I. Generator ignores starting surge (N7/H1 standby) vs C1 for the same backup appliances.
sec('I. generator surge');
for (const loads of [[{ id: 'water-motor-1hp', qty: 1 }, { id: 'ceiling-fan-ac', qty: 2 }], [{ id: 'refrigerator-non-inverter', qty: 1 }, { id: 'ceiling-fan-ac', qty: 3 }, { id: 'led-bulb', qty: 6 }]]) {
  const c1 = C.generator_size({ loads, margin: 1.25, pf: 0.8 }, data);
  const n = backup_compare({ load_w: c1.running_w, hours: 3, years: 5, tariff: 36.46 }, data);
  console.log(`running ${c1.running_w} W, peak ${c1.peak_w} W: C1 ${c1.standard_kva} kVA | N7/H1 standby generator ${n.gen_kva} kVA = ${n.gen_rated_kw * 1000} W (< peak? ${n.gen_rated_kw * 1000 < c1.peak_w}) | N7 UPS rated ${n.ups_rated_w} W`);
}

// J. Insufficient / edge inputs.
sec('J. edge inputs');
for (const [n, ov] of [['backup_w blank, hours 0', { backup_w: '', backup_hours: 0 }], ['all hours 0', { loads: DEF.map((r) => ({ ...r, hours: 0 })) }], ['backup_w > running', { backup_w: 5000, backup_hours: 2 }], ['backup energy > daily use', { backup_w: 2000, backup_hours: 10 }], ['budget 1', { budget_rs: 1 }], ['budget between UPS mid & combo low', { budget_rs: 500000 }], ['sanctioned 5', { sanctioned_kw: 5 }], ['years 0.5', { years: 0.5 }], ['day_share 0.05', { day_share: 0.05 }]]) {
  const e = home_decision({ ...H, ...ov }, data);
  console.log(n, '|', e.ok ? `${e.decision_key}: ${e.decision} | ${e.decision_net} | daily ${e.daily_kwh?.toFixed(2)} kWh, backup ${(e.backup_w * e.backup_hours / 1000).toFixed(1)} kWh/day` : `error ${e.error}`);
}
