import { data, E } from './lib.mjs';
import { bill } from './indep.mjs';
const { home_decision } = await E('decision');
const { backup_compare } = await E('backup');
const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, years: 10 };
let flips = [], pickFlips = [], pts = 0;
for (const w of [150, 300, 500, 800, 1000, 1200, 1500, 2000]) for (const h of [1, 2, 3, 4, 6, 8, 12]) for (const y of [1, 3, 5, 10]) {
  const e = home_decision({ ...H, backup_w: w, backup_hours: h, years: y }, data); if (!e.ok || !e.standby_available) continue; pts++;
  const n = backup_compare({ load_w: w, hours: h, years: y, tariff: e.rate_before, city: 'lahore' }, data);
  const disp = (w * h / 1000) * 30;
  const credit = e.full_before_rs - bill(Math.max(0, e.monthly_units - disp), 4).total;
  const genNet = n.gen_total - y * 12 * credit;
  const upsNet = e.standby_option.startsWith('UPS') ? e.standby_rs + e.standby_repl_rs + y * 12 * e.standby_running_rs : (n.ups_ok ? n.ups_buy + n.ups_repl_rs + y * 12 * (bill(e.monthly_units + Math.max(0, n.recharge_kwh_year / 12 - n.day_kwh * 30), 4).total - e.full_before_rs) : Infinity);
  const credited = upsNet <= genNet ? 'ups' : 'gen';
  const engine = e.standby_option.startsWith('UPS') ? 'ups' : 'gen';
  if (credited !== engine) flips.push({ w, h, y, engine, credited });
  // overall pick with the credited generator standby
  if (engine === 'gen') { const nets = { hybrid: e.hybrid_rs + e.hybrid_repl_rs - y * 12 * e.full_saving_rs, standby: genNet - 0 }; const best = nets.standby < nets.hybrid ? 'standby' : 'hybrid'; if ((best === 'standby') !== (e.decision_key === 'gen')) pickFlips.push({ w, h, y, engine: e.decision_key, credited: best }); }
}
console.log('points', pts, '| UPS-vs-generator choice flips with the credit:', flips.length, JSON.stringify(flips.slice(0, 10)), '| overall pick flips (standby vs hybrid only):', pickFlips.length, JSON.stringify(pickFlips.slice(0, 5)));
