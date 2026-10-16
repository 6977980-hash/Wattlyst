import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
const acs=Object.keys(data.appliances).filter(k=>k.startsWith('ac-')||k.startsWith('heat-pump'));
for(const ac of acs){ const e4=C.add_ac_check({current_w:1500,ac,sanctioned_kw:2},data); const w=C.breaker_size({appliance:ac},data);
 console.log(ac, e4.ok?[e4.ac_breaker_a,e4.ac_curve,e4.ac_cable_mm2]:e4.error, w.ok?[w.breaker_a,w.curve,w.area_mm2]:w.error); }
// N4 vs E4 for two 1.5t inverter ACs + 1500 W
const e4b=C.add_ac_check({current_w:2950,ac:'ac-split-1-5ton-inverter',sanctioned_kw:5},data);
console.log('E4 2 ACs new total kW',e4b.new_total_kw,'within 4kW?', e4b.new_total_kw<=4);
const n4=C.sanctioned_load({connected_kw:4.4},data); console.log('N4 for 4.4 kW connected',n4.recommended_kw, n4.demand_kw);
const n4b=C.sanctioned_load({connected_kw:2.95},data); console.log('N4 for 2.95 kW connected',n4b.recommended_kw);
// N16 vs F1 twice vs E5
for (const [o,prot,ac,h] of [[180,true,'ac-split-1-5ton-inverter',8],[250,false,'ac-split-1-5ton-inverter',8],[120,true,'ac-split-1ton-inverter',2],[150,true,'ac-split-1ton-inverter',2.6]]){
 const n=C.ac_bill_impact({ac,hours:h,other_units:o,protected:prot,sanctioned_kw:1,period:'2026-09..2026-11'},data);
 const e5=C.ac_units({ac,hours:h},data);
 const tot=o+e5.monthly_units; const lost=prot&&tot>200;
 const b=C.bill_total({units:o,protected:prot,sanctioned_kw:1,period:'2026-09..2026-11'},data);
 const a=C.bill_total({units:tot,protected:prot&&!lost,sanctioned_kw:1,period:'2026-09..2026-11'},data);
 console.log('N16',o,prot,ac,h,'E5 units',e5.monthly_units,'N16',n.ac_units,n.before_rs.toFixed(2),n.after_rs.toFixed(2),n.extra_rs.toFixed(2),'F1x2',b.total_rs.toFixed(2),a.total_rs.toFixed(2),(a.total_rs-b.total_rs).toFixed(2), 'lost',n.protected_lost,'lock',n.lock_extra_rs.toFixed(2));
}
