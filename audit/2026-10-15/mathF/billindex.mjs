const ROOT = new URL('../../../', import.meta.url).pathname;
import { indepBill, BI } from './indep.mjs';
import { readFileSync } from 'node:fs';
const g = JSON.parse(readFileSync(ROOT + 'generated/pages/bill-index.json','utf8')).content;
const rs = (x)=>'Rs '+Math.round(x).toLocaleString('en-US');
const rs2 = (x)=>'Rs '+x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const [cur,prev]=BI.months; let bad=0,n=0;
for (const row of g.tables[0].rows){ const u=Number(row[0].replace(/,/g,''));
  const a=indepBill({units:u,kw:BI.sanctioned_kw,fpa:cur.fpa_per_unit,period:cur.qta_period});
  const p=u<=200?indepBill({units:u,kw:2,cat:'protected',fpa:cur.fpa_per_unit,period:cur.qta_period}):null;
  const exp=[String(u.toLocaleString('en-US')),rs(a.total),rs2(a.total/u),p?rs(p.total):'Not protected above 200 units'];
  n++; if(JSON.stringify(exp)!==JSON.stringify(row)){bad++;console.log('MISMATCH',row,exp);} }
for (const row of g.tables[1].rows){ const u=Number(row[0].replace(/,/g,'')); const cat=row[1].toLowerCase();
  const a=indepBill({units:u,kw:2,cat,fpa:cur.fpa_per_unit,period:cur.qta_period}); const b=indepBill({units:u,kw:2,cat,fpa:prev.fpa_per_unit,period:prev.qta_period});
  n++; const ok = row[2]===rs(a.total)&&row[3]===rs(b.total)&&row[5]===rs2(a.total/u); if(!ok){bad++;console.log('MISMATCH2',row,rs(a.total),rs(b.total));}
  console.log(row.join(' | '), ' indep diff', Math.round(a.total)-Math.round(b.total));}
for (const row of g.tables[2].rows){ const u=Number(row[0].replace(/,/g,'')); const cat=row[1].toLowerCase();
  const a=indepBill({units:u,kw:2,cat,fpa:cur.fpa_per_unit,period:cur.qta_period});
  const exp=[row[0],row[1],rs(a.energy),rs(a.fixed),rs(a.fcRs),rs(a.qtaRs),rs(a.fpaRs),rs(a.gstRs),rs(a.total)]; n++;
  if(JSON.stringify(exp)!==JSON.stringify(row)){bad++;console.log('MISMATCH3',row,exp);}
  // components (rounded) sum to rounded total?
  const s=[2,3,4,5,6,7].reduce((t,k)=>t+Number(row[k].replace(/[Rs ,]/g,'')),0); console.log('sum of shown lines',s,'shown total',row[8]);
}
console.log('checked',n,'bad',bad);
