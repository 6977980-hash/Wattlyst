import { runAll } from './scenarios.mjs';
const rows = runAll(false);
const R = (v) => Math.round(Math.abs(v)).toLocaleString('en-US');
for (const r of rows) { const f = (k) => (r.x.S[k] ? `${R(r.x.S[k].buy)} / ${r.x.S[k].net < 0 ? '−' : ''}${R(r.x.S[k].net)}` : 'n/a');
  console.log(`| ${r.name} | ${r.units} | ${r.kw} | ${f('ongrid')} | ${f('hybrid')} | ${r.x.S.standby ? `${f('standby')} (${r.x.S.standby.kind})` : 'n/a'} | ${f('combo')} | ${r.pick}${r.over ? ' (over budget)' : ''} | ${r.pass ? 'pass' : 'FAIL'} |`); }
