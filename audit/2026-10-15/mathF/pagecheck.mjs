const ROOT = new URL('../../../', import.meta.url).pathname;
import { readFileSync } from 'node:fs';
import { indepBill } from './indep.mjs';
const rs=(x)=>'Rs '+Math.round(x).toLocaleString('en-US');
const rs2=(x)=>'Rs '+x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const ids=['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','F14'];
let bad=0,checked=0; const summary=[];
const toIndep=(inp)=>{ const blank=(v)=>v===''||v===undefined||v===null; const life=inp.lifeline===true; const cat=life?'lifeline':inp.protected===true?'protected':'unprotected';
  return indepBill({units:Number(inp.units),kw:Number(inp.sanctioned_kw??1),cat,period:inp.period,fc:blank(inp.fc_surcharge_per_unit)?undefined:Number(inp.fc_surcharge_per_unit),gst:blank(inp.gst_pct)?undefined:Number(inp.gst_pct),fpa:blank(inp.fpa_per_unit)?0:Number(inp.fpa_per_unit)}); };
for (const id of ids){ const c=JSON.parse(readFileSync(`${ROOT}content/pages/${id}.json`,'utf8')); const g=JSON.parse(readFileSync(`${ROOT}generated/pages/${id}.json`,'utf8')).content;
  const defs={}; for(const f of g.tool.fields) if(f.default!==undefined) defs[f.name]=f.default;
  // default result
  const d=toIndep(defs); const outs=Object.fromEntries(g.tool.outputs.map(o=>[o.key,o.value]));
  const want={total_rs:rs(d.total),energy_rs:rs(d.energy),fixed_rs:rs(d.fixed),fc_rs:rs(d.fcRs),qta_rs:rs(d.qtaRs),gst_rs:rs(d.gstRs),fpa_rs:rs(d.fpaRs)};
  for(const [k,v] of Object.entries(outs)){ checked++; if(want[k]&&want[k]!==v){bad++;console.log(id,'default',k,v,'want',want[k]);} }
  summary.push([id,JSON.stringify({units:defs.units,kw:defs.sanctioned_kw,fpa:defs.fpa_per_unit??0}),want.total_rs,outs.total_rs]);
  (c.examples||[]).forEach((e,i)=>{ const inp={...defs,...e.inputs}; const x=toIndep(inp); const t=g.examples[i].text; checked++;
    const need=[rs(x.total)]; if(x.energy>0) need.push(rs(x.energy)); if(x.gstRs>0) need.push(rs(x.gstRs));
    const miss=need.filter(n=>!t.includes(n)); if(miss.length){bad++;console.log(id,'ex',i,'missing',miss,'|',t.slice(0,200));} });
  if(g.table){ c.table.rows.forEach((row,i)=>{ const x=toIndep({...defs,...row}); checked++; const r=g.table.rows[i]; if(!r.includes(rs(x.total))||!r.includes(rs(x.energy))){bad++;console.log(id,'table',i,r,rs(x.total));} }); }
}
console.log('checked',checked,'bad',bad); for(const s of summary) console.log(s.join(' | '));
