const ROOT = new URL('../../../', import.meta.url).pathname;
import fs from 'fs';
const id=process.argv[2];
const p=JSON.parse(fs.readFileSync(`${ROOT}generated/pages/${id}.json`,'utf8'));
function walk(v,path){ if(typeof v==='string'){ if(v.length>0 && !/^(https?:|\/)/.test(v)) console.log(path+': '+v);} else if(Array.isArray(v)) v.forEach((x,i)=>walk(x,path+'['+i+']')); else if(v&&typeof v==='object') for(const[k,x] of Object.entries(v)) walk(x,path+'.'+k); else if(typeof v==='number') console.log(path+'= '+v); }
console.log('URL',p.url,'TITLE',p.title,'META',p.meta);
walk(p.content,'c');
