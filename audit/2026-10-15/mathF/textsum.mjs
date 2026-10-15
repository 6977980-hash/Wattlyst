const ROOT = new URL('../../../', import.meta.url).pathname;
import { readFileSync, readdirSync } from 'node:fs';
const dir=ROOT + 'generated/pages/';
const num=(s)=>Number(s.replace(/[^0-9.\-]/g,''));
for (const f of readdirSync(dir)) { const p=JSON.parse(readFileSync(dir+f,'utf8')); const c=p.content; if(!c) continue;
  const texts=[]; if(c.tool?.how?.text) texts.push(['how',c.tool.how.text]); (c.examples||[]).forEach((e,i)=>texts.push(['ex'+i,e.text]));
  for (const [w,t] of texts) {
    let m=/Subtotal (Rs [\d,]+)[;+ ]+GST (?:at )?[\d.]+% (?:= )?\(?(Rs [\d,]+)\)?(?:\. Estimated bill| =) (Rs [\d,]+)/.exec(t);
    if(m){ const a=num(m[1]),b=num(m[2]),cc=num(m[3]); if(a+b!==cc) console.log(p.id,w,'SUBTOTAL+GST',a,b,cc,a+b); }
    // example component sum
    const parts=[...t.matchAll(/(?:= |charge |surcharge |QTA |GST |FPA )(Rs -?[\d,]+)/g)].map(x=>num(x[1]));
    const tot=/(?:Estimated (?:\w+ )*bill|bill) (Rs [\d,]+)/.exec(t);
    if(/^ex/.test(w) && tot && parts.length>=5 && /fixed charge/.test(t)) { const s=parts.reduce((x,y)=>x+y,0)-0; if(s!==num(tot[1])) console.log(p.id,w,'LINES',parts,'sum',s,'total',tot[1], '|', t.slice(0,160)); }
  }
}
