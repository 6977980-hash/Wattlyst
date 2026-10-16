import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
let viol=0, cliffs=[];
for (const cat of ['unprotected','protected','lifeline']) for (const fpa of [0,1.11,-2]) { let prev=-1, prevu=0;
  for (let u=0; u<=5000; u+=0.25){ const r=C.bill_total({units:u,protected:cat==='protected',lifeline:cat==='lifeline',period:'2026-09..2026-11',fpa_per_unit:fpa},data); if(!r.ok) break;
   if(r.total_rs < prev-1e-9){viol++;} if(fpa===0 && r.total_rs-prev > 200 && prev>=0) cliffs.push([cat,prevu,u,(r.total_rs-prev).toFixed(0)]);
   if(Math.abs(r.gst_rs/r.total_rs - r.gst_pct/(100+r.gst_pct))>1e-9 && r.total_rs>0) viol++;
   prev=r.total_rs; prevu=u; } }
console.log('violations',viol); console.log('cliffs',cliffs);
// net billing indep
const nb=C.net_billing({import_units:400,export_units:300,sanctioned_kw:3},data); console.log(nb.import_energy_rs, nb.export_credit_rs, nb.net_energy_rs, nb.net_metering_rs, nb.extra_vs_net_metering_rs);
const tou=C.bill_tou({peak_units:100,offpeak_units:400,sanctioned_kw:6,mdi_kw:4},data); console.log(tou.energy_rs, 100*46.85+400*34.53, tou.fixed_rs, 675*4);
const tou2=C.bill_tou({peak_units:100,offpeak_units:400,sanctioned_kw:10,mdi_kw:4},data); console.log(tou2.fixed_rs, 675*5);
// N9 sign
for (const [a,b] of [[22,26],[26,22],[24,24],[16,30]]) { const r=C.ac_temp({t_old:a,t_new:b,monthly_units:240},data); console.log('N9',a,b,r.saving_pct,r.units_saved,r.extra_pct,r.extra_units); }
// N10
const p=C.ac_payback({kw_noninv:1.8,kw_inv:1,hours_year:1200,tariff:36.46,price_diff:40000},data); console.log('N10', p.payback_months, 40000/(((1.8*0.8-1)*1200*36.46)/12));
console.log(C.ac_payback({kw_noninv:1.8,kw_inv:1.44,hours_year:1200,tariff:36.46,price_diff:40000},data), C.ac_payback({kw_noninv:1.8,kw_inv:1.4399,hours_year:1200,tariff:36.46,price_diff:40000},data).error);
// E5 monotone
let m=true; for(const ac of ['ac-split-1ton-inverter','ac-split-1-5ton-inverter','ac-split-2ton-inverter']){ let pv=-1; for(let h=0;h<=24;h++){const r=C.ac_units({ac,hours:h},data); if(r.monthly_units<pv) m=false; pv=r.monthly_units;} }
const t=['ac-split-1ton-inverter','ac-split-1-5ton-inverter','ac-split-2ton-inverter'].map(ac=>C.ac_units({ac,hours:8},data).monthly_units); console.log('E5 monotone hours',m,'by tonnage',t);
const t2=['ac-split-1ton-non-inverter','ac-split-1-5ton-non-inverter','ac-split-2ton-non-inverter'].map(ac=>C.ac_units({ac,hours:8},data).monthly_units); console.log(t2);
