import { indepBill } from './indep.mjs';
import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
const U=[0,1,50,99,100,101,199,200,201,300,301,400,700,701,1000,1500,5000];
let fails=0; const rows=[];
for (const cat of ['unprotected','protected','lifeline']) for (const kw of [1,2,4.9]) for (const fpa of [0,1.11,-2]) for (const u of U) {
  const exp=indepBill({units:u,kw,cat,fpa});
  const r=C.bill_total({units:u,sanctioned_kw:kw,protected:cat==='protected',lifeline:cat==='lifeline',period:'2026-09..2026-11',fpa_per_unit:fpa},data);
  let pass;
  if(exp.err) pass = r.ok===false; else pass = r.ok && Math.abs(r.total_rs-exp.total)<1e-6 && Math.abs(r.energy_rs-exp.energy)<1e-6 && Math.abs(r.fixed_rs-exp.fixed)<1e-9 && Math.abs(r.gst_rs-exp.gstRs)<1e-6;
  if(!pass){fails++; console.log('FAIL',cat,kw,fpa,u,exp,r);}
  if(kw===1&&fpa===0) rows.push([cat,u,exp.err||exp.total.toFixed(2), r.ok?r.total_rs.toFixed(2):r.error, pass?'PASS':'FAIL']);
}
console.log('fails',fails);
for(const r of rows) console.log(r.join(' | '));
