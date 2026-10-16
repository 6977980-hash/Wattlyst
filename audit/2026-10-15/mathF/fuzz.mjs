import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
import { errorMessage } from '../../../engine/messages.js';
const GEN='Something went wrong with this calculation. Please check your inputs.';
const bases={
 bill_total:{units:300,sanctioned_kw:1,period:'2026-09..2026-11'},
 bill_energy:{units:300},
 bill_tou:{peak_units:100,offpeak_units:400,sanctioned_kw:6,mdi_kw:4},
 net_billing:{import_units:400,export_units:300,sanctioned_kw:3},
 protected_check:{history:[100,120,150,180,190,200]},
 bill_audit:{units:320,days:36,sanctioned_kw:1,prev_year_units:200},
 ac_bill_impact:{ac:'ac-split-1-5ton-inverter',hours:8,other_units:180,protected:true,sanctioned_kw:1},
 ac_units:{ac:'ac-split-1-5ton-inverter',hours:8,days:30,tariff:36.46},
 home_load:{loads:[{id:'ceiling-fan-ac',qty:2,hours:12}],tariff:36.46,sanctioned_kw:2},
 add_ac_check:{current_w:1500,ac:'ac-split-1-5ton-inverter',sanctioned_kw:2},
 heating_cost:{q_kw:2,tariff:36.46,gas_price_mmbtu:1250},
 ac_temp:{t_old:22,t_new:26,monthly_units:240},
 ac_payback:{kw_noninv:1.8,kw_inv:1,hours_year:1200,tariff:36.46,price_diff:40000},
 ebike:{v:48,ah:24,range_km:60,tariff:36.46},
 sanctioned_load:{connected_kw:6},
 load_check:{total_w:3000,sanctioned_kw:2},
 units:{watts:1000,hours:1,days:30,tariff:36.46},
 tco:{capex:100000,years:10,energy_cost_per_year:1000,life_years:4,replacement_cost:5000},
};
const vals=[undefined,null,'',0,-1,-0.0001,'abc','1,500','18%','12.5',' 3 ','1e3',1e12,1e13,Infinity,-Infinity,NaN,'1,5',true,false,[],{},0.0000001,24,24.0001,31,32,200,200.0001,5,4.9999];
const issues=new Map(); let runs=0;
for (const [calc,base] of Object.entries(bases)) {
  const r0=C[calc](base,data); if(!r0.ok) console.log('BASE FAIL',calc,r0);
  for (const key of Object.keys(base)) for (const v of vals) {
    runs++; const r=C[calc]({...base,[key]:v},data);
    if(!r.ok){ const m=errorMessage(r.error,{}); if(m===GEN||r.error.startsWith('internal')) { const k=`${calc}.${key}=${JSON.stringify(v)??String(v)} -> ${r.error}`; issues.set(k,1);} }
    else { // determinism
      const r2=C[calc]({...base,[key]:v},data); if(JSON.stringify(r)!==JSON.stringify(r2)) issues.set(calc+' nondeterministic',1);
      for(const [k,x] of Object.entries(r)) if(typeof x==='number' && x<0 && !['qta_rs','fpa_rs','qta_per_unit','fpa_per_unit'].includes(k)) issues.set(`${calc}.${key}=${v} negative ${k}`,1);
    }
  }
}
console.log('runs',runs); for (const k of issues.keys()) console.log(k);
