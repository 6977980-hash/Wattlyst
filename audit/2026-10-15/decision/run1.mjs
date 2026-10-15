import {data,gen,E} from './lib.mjs';
const {home_decision}=await E('decision');
const g=gen('H1'); const t=g.content.tool;
console.log(Object.keys(g.content),Object.keys(t));
const inputs={...t.fixed_inputs,...Object.fromEntries(t.fields.filter(f=>f.default!==undefined).map(f=>[f.name,f.default]))};
console.log(JSON.stringify(inputs));
const r=home_decision(inputs,data);
console.log(JSON.stringify(r,null,1));
