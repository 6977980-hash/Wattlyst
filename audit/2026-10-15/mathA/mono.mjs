import { data, C } from './h.mjs';
const bad=[];
const AREA = (r)=> r.ok? r.area_mm2 : (r.error==='load_above_standard_breakers'||r.error==='load_above_cable_table'||r.error==='run_too_long_for_table'? Infinity : NaN);
let n=0;
for (const mode of ['ac1','ac3','dc']) for (const lt of ['sockets','lighting','resistive','motor','compressor','inverter_compressor','high_inrush']) for (const method of ['B1','C']) for (const amb of [30,45,55]) for (const circ of [1,3,9]) for (const L of [5,20,60]) {
  let prevA=0, prevB=0;
  for (let w=50; w<=40000; w+= (w<2000?50:250)) {
    const i={mode, volts: mode==='dc'?48:undefined, load_type:lt, method, ambient_c:amb, circuits:circ, length_m:L, watts:w};
    const r=C.wire_size(i,data); n++;
    const a=AREA(r); if (Number.isNaN(a)) bad.push('unexpected '+r.error+JSON.stringify(i));
    if (a < prevA) bad.push(`area decreased ${prevA}->${a} at ${JSON.stringify(i)}`);
    if (r.ok && r.breaker_a < prevB) bad.push(`breaker decreased at ${JSON.stringify(i)}`);
    prevA=Math.max(prevA,a); if (r.ok) prevB=r.breaker_a;
    if (a===Infinity) break;
  }
}
// length monotone
for (const w of [500,2000,5000,9000]) { let prev=0; for (let L=1; L<=400; L+=1) { const r=C.wire_size({watts:w,length_m:L},data); n++; const a=AREA(r); if (a<prev) bad.push(`len area decreased ${w} ${L}`); prev=Math.max(prev,a); if(a===Infinity) break; } }
// ambient & grouping monotone
for (const w of [1000,3000,6000]) { let prev=0; for (let t=10;t<=60;t+=0.5){ const a=AREA(C.wire_size({watts:w,length_m:10,ambient_c:t},data)); n++; if(a<prev) bad.push(`ambient area decreased ${w} ${t}`); prev=Math.max(prev,a);} prev=0; for (let g=1; g<=20; g++){ const a=AREA(C.wire_size({watts:w,length_m:10,circuits:g},data)); n++; if(a<prev) bad.push(`group area decreased ${w} ${g}`); prev=Math.max(prev,a);} }
// breaker_size monotone in watts
for (const lt of ['sockets','lighting','motor','high_inrush']) { let pb=0, pa=0; for (let w=10; w<=20000; w+=10){ const r=C.breaker_size({watts:w,load_type:lt},data); n++; if(!r.ok) break; if(r.breaker_a<pb||r.area_mm2<pa) bad.push(`mcb decreased ${lt} ${w}`); pb=r.breaker_a; pa=r.area_mm2; } }
// generator monotone in added load
const ids=Object.keys(data.appliances);
for (const id of ids) { let prev=0; for (let q=1;q<=12;q++){ const r=C.generator_size({loads:[{id,qty:q},{id:'ac-split-1-5ton-inverter'}]},data); n++; const s=r.ok?(r.standard_kva??Infinity):NaN; if(!(s>=prev)) bad.push(`gen decreased ${id} q${q}`); prev=s; } }
// pump monotone hp and other
{ let prev=0; for (let hp=0.25; hp<=10; hp+=0.25){ const r=C.generator_for_pump({hp},data); n++; const s=r.standard_kva??Infinity; if(s<prev) bad.push('pump hp'); prev=s;} }
// battery runtime monotone in ah, inverse in load
{ let prev=0; for (let ah=1; ah<=1000; ah+=7){ const r=C.battery_runtime({ah,volts:12,load_w:300},data); n++; if(r.hours<=prev) bad.push('runtime ah'); prev=r.hours; } prev=Infinity; for (let l=1;l<=5000;l+=13){ const r=C.battery_runtime({ah:200,volts:12,load_w:l},data); n++; if(r.hours>=prev) bad.push('runtime load'); prev=r.hours;} }
// battery bank monotone in hours
{ let prev=0; for (let h=0.1; h<=48; h+=0.1){ const r=C.battery_bank({load_w:500,hours:h,volts:24,battery_ah:200,battery_v:12},data); n++; if(r.batteries<prev) bad.push('bank hours'); prev=r.batteries;} }
// voltage drop monotone
{ let prev=0; for (let L=1;L<=200;L++){ const r=C.voltage_drop({amps:10,length_m:L,area_mm2:2.5},data); n++; if(!r.ok) break; if(r.drop_v<=prev) bad.push('vd len'); prev=r.drop_v;} }
// fuel monotone
{ for (const kva of [2.5,5,10]) { let prev=0; for (let w=0; w<=kva*800; w+=50){ const r=C.generator_fuel({kva,load_w:w},data); n++; if(r.l_per_h<prev) bad.push('fuel'); prev=r.l_per_h; } } }
// sanctioned monotone
{ let prev=0; for (let c=0.1;c<=40;c+=0.1){ const r=C.sanctioned_load({connected_kw:c},data); n++; if(r.recommended_kw<prev) bad.push('sanctioned'); prev=r.recommended_kw;} }
// idempotence
for (const [c,i] of [['wire_size',{watts:2000,length_m:20}],['generator_size',{loads:[{id:'water-motor-1hp'}]}],['circuit_schedule',{loads:[{id:'custom',watts:2000,length:15}]}]]) { const a=JSON.stringify(C[c](structuredClone(i),data)); const b=JSON.stringify(C[c](structuredClone(i),data)); if(a!==b) bad.push('not idempotent '+c); }
// input mutation
{ const i={loads:[{id:'water-motor-1hp'}]}; const s=JSON.stringify(i); C.generator_size(i,data); if (JSON.stringify(i)!==s) bad.push('input mutated'); }
console.log('checks', n, 'violations', bad.length); for (const b of bad.slice(0,30)) console.log(' ', b);
