const ROOT = new URL('../../../', import.meta.url).pathname;
import { readFileSync } from 'node:fs';
const A=Object.fromEntries(JSON.parse(readFileSync(ROOT + 'data/appliances.json','utf8')).items.map(a=>[a.id,a]));
for (const id of ['E1','E2','H3','H4','H5','H6','H7']){ const g=JSON.parse(readFileSync(`${ROOT}generated/pages/${id}.json`,'utf8')).content;
 const defs={}; for(const f of g.tool.fields) if(f.default!==undefined) defs[f.name]=f.default;
 const rows=defs.loads.map(r=>{const a=A[r.id]; const run=r.watts??a.running_w; return {run, start: a? a.starting_w*run/a.running_w : run, e: a?.avg_w? a.avg_w*run/a.running_w: run, qty:r.qty??1, h:r.hours??a.typical_hours_per_day};});
 const P=rows.reduce((s,r)=>s+r.run*r.qty,0); const step=Math.max(0,...rows.filter(r=>r.qty>0).map(r=>r.start-r.run));
 const v=defs.volts??230, pf=defs.pf??0.8, days=defs.days??30; const daily=rows.reduce((s,r)=>s+r.e*r.qty*r.h,0)/1000;
 const out=Object.fromEntries(g.tool.outputs.map(o=>[o.key,o.value]));
 console.log(id,{P,peak:P+step,amps:(P/(v*pf)).toFixed(2),daily:daily.toFixed(3),monthly:(daily*days).toFixed(2),rs:defs.tariff?Math.round(daily*days*defs.tariff):''}, JSON.stringify(out));
}
