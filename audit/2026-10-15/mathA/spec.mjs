const ROOT = new URL('../../../', import.meta.url).pathname;
import { data, C } from './h.mjs';
import * as R from './ref.mjs';
import { readFileSync } from 'node:fs';
const cases = JSON.parse(readFileSync(ROOT + 'specs/calculator-test-cases.json','utf8'));
const apps = data.appliances;
const refs = {
  watts_to_amps: R.watts_to_amps, amps_to_watts: R.amps_to_watts, kw_to_amps: R.kw_to_amps,
  battery_runtime: R.runtime, battery_bank: R.bank,
  wire_size: (i) => R.wire(i, apps), breaker_size: (i) => R.mcb(i, apps), voltage_drop: R.vdrop,
  generator_for_pump: (i) => R.pump(Number(i.hp), Number(i.other_w ?? 0), Number(i.other_start_w ?? i.other_w ?? 0), Number(i.motor_eff ?? 0.8), Number(i.start_factor ?? 3)),
  generator_size: (i) => { const s = R.sum(R.rows(i.loads, apps)); return { ...s, ...R.gen(s.running_w, s.peak_w, Number(i.margin ?? 1.25), Number(i.pf ?? 0.8)) }; },
};
let n=0, bad=0, skipped=0;
for (const c of cases) {
  const f = refs[c.calc]; if (!f) continue;
  if ('error' in c.expected) continue;
  let r; try { r = f(c.inputs); } catch (e) { skipped++; continue; }
  if (r.error) { console.log('REF ERROR', c.calc, c.name, r.error); bad++; continue; }
  for (const [k, want] of Object.entries(c.expected)) {
    if (!(k in r)) continue;
    n++;
    const got = r[k];
    const ok = typeof want === 'number' ? Math.abs(got - want) <= (c.tolerance ?? 0) + 1e-6 : got === want;
    if (!ok) { bad++; console.log('SPEC vs REF', c.calc, '|', c.name, '|', k, 'spec', want, 'ref', got); }
  }
}
console.log('checked', n, 'bad', bad, 'skipped', skipped);
// engine pass
let eb=0; for (const c of cases) { const r=C[c.calc](c.inputs,data); for (const [k,w] of Object.entries(c.expected)) { if(k==='error'){ if(r.error!==w) eb++; continue;} const g=r[k]; if(typeof w==='number'? !(Math.abs(g-w)<=c.tolerance+1e-9): JSON.stringify(g)!==JSON.stringify(w)) {eb++; console.log('ENGINE FAIL', c.calc, c.name, k);} } }
console.log('engine failures', eb, 'of', cases.length);
