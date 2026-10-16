import { data, C } from './h.mjs';
const w = Object.values(data.appliances).filter(a=>/weld/.test(a.id)); console.log(w.map(a=>a.id+':'+a.load_type));
for (const a of Object.values(data.appliances).filter(a=>/^ac-|heat-pump/.test(a.id))) {
  const e4 = C.add_ac_check ? C.add_ac_check({current_w:1000, ac:a.id, sanctioned_kw:5}, data) : null;
  const w1 = C.wire_size({appliance:a.id, length_m:10}, data); const w3=C.breaker_size({appliance:a.id},data);
  console.log(a.id, 'E4', e4?.ac_breaker_a, e4?.ac_cable_mm2, 'W1', w1.breaker_a, w1.area_mm2, 'W3', w3.breaker_a, w3.area_mm2, w3.curve);
}
// WL-09 consistency: PK cable via W5 vs W2
for (const p of data.cables.pk_sizes) { const v=C.voltage_drop({amps:10,length_m:10,area_mm2:p.area_mm2},data); console.log(p.name, p.area_mm2, 'W5 rated', v.rated_mm2, 'data rated_as', p.rated_as_mm2); }
// WL-01
console.log(C.wire_size({mode:'dc',watts:3000,length_m:3},data).error, C.voltage_drop({mode:'dc',amps:10,length_m:3,area_mm2:4},data).error, C.watts_to_amps({mode:'dc',watts:100},data).error);
// WL-17
console.log(C.watts_to_amps({watts:'1,500'},data).amps, C.watts_to_amps({watts:'1,5'},data).error, C.watts_to_amps({watts:'15,00'},data).error, C.watts_to_amps({watts:'1,50,000'},data).amps);
