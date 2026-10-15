import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
const R=Math.round; let n=0,lines=0,how=0,ex=[];
for (const prot of [false,true]) for (const kw of [1,2,3]) for (const fpa of [0,1.11]) for (let u=0;u<=1000;u++){
  if(prot&&u>200) break;
  const r=C.bill_total({units:u,sanctioned_kw:kw,protected:prot,period:'2026-09..2026-11',fpa_per_unit:fpa},data); n++;
  const s=R(r.energy_rs)+R(r.fixed_rs)+R(r.fc_rs)+R(r.qta_rs)+R(r.fpa_rs)+R(r.gst_rs);
  if(s!==R(r.total_rs)){lines++; if(ex.length<5) ex.push({u,kw,prot,fpa,s,total:R(r.total_rs)});}
  if(R(r.subtotal_rs)+R(r.gst_rs)!==R(r.total_rs)) how++;
}
console.log({cases:n, lineSumMismatch:lines, howSubtotalPlusGstMismatch:how, ex});
