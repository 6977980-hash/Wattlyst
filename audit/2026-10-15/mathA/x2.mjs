import { data, C, errorMessage } from './h.mjs';
const r=(c,i)=>{const o=C[c](i,data); console.log(c, JSON.stringify(i), '=>', JSON.stringify(o).slice(0,400)); return o;};
// C5 claim: 1hp + few lights
for (const ow of [0,4,50,100,200]) { const o=C.generator_for_pump({hp:1, other_w:ow},data); console.log('pump 1hp other',ow, o.recommended_kva, o.standard_kva, o.peak_w); }
// A10 claim: 200Ah 12V tubular 1000 W
r('battery_runtime',{ah:200,volts:12,load_w:1000});
// W3 lighting 400W
const w3=require0();
function require0(){return null}
r('breaker_size',{watts:400,load_type:'lighting'});
r('breaker_size',{watts:400,load_type:'lighting',pf:1});
r('wire_size',{watts:400,load_type:'lighting',length_m:20});
r('wire_size',{watts:400,load_type:'lighting',circuit:'lighting',length_m:20});
// W4 over-current
r('voltage_drop',{mode:'dc',amps:30,volts:420,length_m:25,area_mm2:4,circuit:'lighting'});
// N18 surface clip
const base=JSON.parse(JSON.stringify(data));
const loads=[{"id":"led-tube-light","qty":10,"length":20},{"id":"custom","watts":2000,"length":15},{"id":"ac-split-1-5ton-inverter","length":12},{"id":"ac-split-2ton-non-inverter","length":18},{"id":"electric-geyser-storage","length":10},{"id":"water-motor-1hp","length":25}];
for (const m of ['B1','C']) { const o=C.circuit_schedule({loads, method:m},data); console.log(m, o.rows.map(x=>x.name.slice(0,14)+':'+x.breaker_a+'/'+x.area_mm2).join(' ; ')); }
