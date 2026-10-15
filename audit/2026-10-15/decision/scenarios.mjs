// Runs the engine's home_decision and the independent decide() on many scenarios; prints a table.
import { data, E } from './lib.mjs';
import { decide } from './indep.mjs';
const { home_decision } = await E('decision');

const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const base = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const small = [{ id: 'ceiling-fan-ac', qty: 2 }, { id: 'led-bulb', qty: 4 }, { id: 'refrigerator-inverter', qty: 1 }];
const big = [{ id: 'ceiling-fan-ac', qty: 8 }, { id: 'led-bulb', qty: 20 }, { id: 'ac-split-1-5ton-inverter', qty: 3, hours: 8 }, { id: 'refrigerator-inverter', qty: 2 }, { id: 'led-tv-43', qty: 2 }];
export const SCEN = [
  ['S01 default', {}],
  ['S02 small home (low units)', { loads: small }],
  ['S03 big home, sanctioned 4.9', { loads: big, sanctioned_kw: 4.9 }],
  ['S04 big home, sanctioned 4 (array above cap)', { loads: big }],
  ['S05 backup 0 h', { backup_hours: 0 }],
  ['S06 backup 0 h, years 1', { backup_hours: 0, years: 1 }],
  ['S07 backup 12 h', { backup_hours: 12 }],
  ['S08 backup 20 h', { backup_hours: 20 }],
  ['S09 backup 24 h', { backup_hours: 24 }],
  ['S10 backup 1500 W 8 h', { backup_w: 1500, backup_hours: 8 }],
  ['S11 years 1', { years: 1 }],
  ['S12 years 30', { years: 30 }],
  ['S13 budget 50,000 (tiny)', { budget_rs: 50000 }],
  ['S14 budget 1e9 (huge)', { budget_rs: 1e9 }],
  ['S15 budget = UPS mid', { budget_rs: 157369 }],
  ['S16 budget = UPS mid - 1', { budget_rs: 157368 }],
  ['S17 budget = combo mid', { budget_rs: 640244 }],
  ['S18 karachi', { city: 'karachi' }],
  ['S19 islamabad', { city: 'islamabad' }],
  ['S20 peshawar', { city: 'peshawar' }],
  ['S21 quetta', { city: 'quetta' }],
  ['S22 multan', { city: 'multan' }],
  ['S23 tubular', { chemistry: 'tubular' }],
  ['S24 buyback 0 (no export value)', { buyback_rs: 0 }],
  ['S25 buyback 25.32', { buyback_rs: 25.32 }],
  ['S26 day_share 1', { day_share: 1 }],
  ['S27 backup 200 W 1 h', { backup_w: 200, backup_hours: 1 }],
  ['S28 backup 3000 W 4 h', { backup_w: 3000, backup_hours: 4 }],
  ['S29 backup 7000 W 4 h', { backup_w: 7000, backup_hours: 4 }],
  ['S30 small home, backup 0 h, years 3', { loads: small, backup_hours: 0, years: 3 }],
  ['S31 small home, backup 2 h, years 3', { loads: small, backup_hours: 2, years: 3, backup_w: 300 }],
  ['S32 years 7.99 (just before lithium life)', { years: 7.99 }],
  ['S33 years 8', { years: 8 }],
  ['S34 years 8.01', { years: 8.01 }],
];

const rs = (v) => (v === undefined ? '-' : Math.round(v).toLocaleString('en-US'));
export function runAll(print = true) {
  const rows = [];
  for (const [name, ov] of SCEN) {
    const inp = { ...base, ...ov };
    const e = home_decision(structuredClone(inp), data);
    let x;
    try { x = decide(inp, data); } catch (err) { x = { err: String(err) }; }
    if (!e.ok) { rows.push({ name, err: e.error, indep: x.err || 'ok' }); continue; }
    const eNet = { ongrid: e.ongrid_available ? e.setups[0] : null };
    const cmp = [];
    const keyMap = { ongrid: 'ongrid', hybrid: 'hybrid', standby: 'standby', combo: 'combo' };
    let pass = true;
    for (const k of Object.keys(keyMap)) {
      const s = x.S[k];
      const eb = e[`${k}_rs`], er = e[`${k}_repl_rs`], ea = e[`${k}_available`];
      if (!s) { if (ea) { pass = false; cmp.push(`${k}: engine available, indep missing`); } continue; }
      if (!ea) { pass = false; cmp.push(`${k}: indep has it, engine not`); continue; }
      if (Math.abs(eb - s.buy) > 0.5) { pass = false; cmp.push(`${k} buy ${eb} vs ${s.buy}`); }
      if (Math.abs(er - s.repl) > 0.5) { pass = false; cmp.push(`${k} repl ${er} vs ${s.repl}`); }
    }
    const ek = e.decision_key === 'ups' || e.decision_key === 'gen' ? 'standby' : e.decision_key;
    if (ek !== x.pick) { pass = false; cmp.push(`pick ${e.decision_key} vs ${x.pick}`); }
    if (Boolean(e.over_budget) !== x.over) { pass = false; cmp.push('over flag'); }
    const net = (k) => (x.S[k] ? rs(x.S[k].net) : 'n/a');
    rows.push({ name, units: Math.round(x.units), kw: x.ikw, og: net('ongrid'), hy: net('hybrid'), sb: x.S.standby ? `${net('standby')} (${x.S.standby.kind})` : 'n/a', co: net('combo'), pick: e.decision_key, over: e.over_budget, pass, cmp: cmp.join('; '), e, x });
  }
  if (print) for (const r of rows) console.log([r.name, r.units, r.kw, r.og, r.hy, r.sb, r.co, r.pick ?? r.err, r.over ?? '', r.pass ?? r.indep, r.cmp ?? ''].join(' | '));
  return rows;
}
if (process.argv[1]?.endsWith('scenarios.mjs')) runAll();
