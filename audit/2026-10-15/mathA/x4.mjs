import { data, C, fmt } from './h.mjs';
const idle = data.appliances['ups-idle'];
console.log('ups-idle data', idle.running_w, idle.name);
for (const [ah,load] of [[150,10],[150,60],[100,60],[150,100],[150,300],[200,80],[100,50],[150,600]]) {
  const e = C.ups_backup({va:1000, ah, volts:12, load_w:load}, data);
  const battWh = ah*12*0.5; // usable battery-side energy at 50% DoD
  const drain = load/0.85 + idle.running_w;
  console.log(`B5 ${ah}Ah ${load}W engine ${e.hours.toFixed(2)} h (${fmt(e.hours,'hm')}) | with ${idle.running_w} W idle: ${ (battWh/drain).toFixed(2)} h (${fmt(battWh/drain,'hm')}) overstatement x${(e.hours/(battWh/drain)).toFixed(2)}`);
}
// C6 KF: one inverter AC, fans/lights, fridge
for (const fr of ['refrigerator-non-inverter','refrigerator-inverter']) {
  const r = C.generator_size({loads:[{id:'ac-split-1-5ton-inverter'},{id:fr},{id:'custom',watts:300}]},data);
  console.log('C6 KF check', fr, r.running_w, r.peak_w, r.recommended_kva.toFixed(3), r.standard_kva);
}
// C1/C3 rounding of recommended_kva and B4 kwh
const g = C.generator_size({loads:[{id:'custom',watts:2083}]},data); console.log('C1 rec', g.recommended_kva, 'shown', fmt(g.recommended_kva,'2'), 'up2', fmt(g.recommended_kva,'up2'));
const b = C.battery_bank({load_w:500,hours:4,volts:24,battery_ah:200,battery_v:12},data); console.log('B4 kwh', b.kwh_required, 'shown', fmt(b.kwh_required,'1'), 'up1', fmt(b.kwh_required,'up1'), 'ah', fmt(b.ah_required,'up'));
const b2 = C.battery_bank({load_w:1500,hours:4,volts:48,battery_ah:200,battery_v:12},data); console.log('B4 ex kwh', b2.kwh_required, fmt(b2.kwh_required,'1'));
// W2 DC example with inverter efficiency
for (const v of [48, 44]) { const r = C.wire_size({mode:'dc', volts:v, watts:3000/0.9, length_m:3, load_type:'sockets'},data); console.log('W2 DC battery current with eff 0.9 at', v,'V', r.ok? `${r.ib_a.toFixed(1)} A breaker ${r.breaker_a} cable ${r.area_mm2}` : r.error); }
const w2 = C.wire_size({mode:'dc', volts:48, watts:3000, length_m:3},data); console.log('W2 page ex', w2.ib_a, w2.breaker_a, w2.area_mm2);
// A10 claim
const a10 = C.battery_runtime({ah:200,volts:12,load_w:1000},data); console.log('A10 claim "well under an hour" engine', fmt(a10.hours,'hm'));
// A4 vs W1 PF for inverter AC
console.log('A4 running amps pf0.8', (1450/(230*0.8)).toFixed(2), 'W1 design', C.wire_size({appliance:'ac-split-1-5ton-inverter',length_m:15},data).ib_a.toFixed(2));
// C5 statements
for (const ow of [0, 4, 40, 100]) { const r=C.generator_for_pump({hp:1,other_w:ow},data); console.log('C5 1hp + ',ow,'W ->', r.standard_kva, 'kVA (rec', r.recommended_kva.toFixed(4),')'); }
for (const hp of [5,6,7,7.5,8,8.5]) { const r=C.generator_for_pump({hp},data); console.log('C5 hp',hp, r.recommended_kva.toFixed(2), r.standard_kva ?? 'above'); }
// N18 clipped example
const loads=[{"id":"led-tube-light","qty":10,"length":20},{"id":"custom","watts":2000,"length":15},{"id":"ac-split-1-5ton-inverter","length":12},{"id":"ac-split-2ton-non-inverter","length":18},{"id":"electric-geyser-storage","length":10},{"id":"water-motor-1hp","length":25}];
for (const m of ['B1','C']) { const o=C.circuit_schedule({loads,method:m},data); console.log('N18', m, 'geyser', o.rows[4].area_mm2, 'AC2t', o.rows[3].area_mm2); }
// W4 FAQ "does not check the current rating"
const w4=C.voltage_drop({mode:'dc',amps:30,volts:420,length_m:25,area_mm2:2.5,circuit:'lighting'},data); console.log('W4 30A on 2.5mm2 over_cable_rating', w4.over_cable_rating, 'drop', w4.drop_pct.toFixed(2));
