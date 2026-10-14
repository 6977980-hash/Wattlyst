import{fmt,render}from '../../engine/format.js';
import{errorMessage}from '../../engine/messages.js';
const ver=new URL(import.meta.url).searchParams.get('ver')|| '';
function loadsField(form,f,cfg,onChange){
const box=form.querySelector(`[data-wl-loads="${f.name}"]`);
if(!box)return null;
const body=box.querySelector('tbody');
const tmpl=box.querySelector('.wl-loads-template');
let n=body.children.length;
const full=document.createElement('select');
full.append(new Option('Custom (enter watts)','custom'));
let group=null;
for(const a of f.catalog ||[]){
if(!group || group.label !==a.category){group=document.createElement('optgroup');group.label=a.category.replace(/-/g,' ').replace(/^\w/,(m)=> m.toUpperCase());full.append(group);}
group.append(new Option(a.name,a.id));
}
const populate=(sel)=>{
if(sel.dataset.full)return;
const cur=sel.value;
sel.innerHTML=full.innerHTML;
sel.value=cur;
if(sel.value !==cur)sel.value='custom';
sel.dataset.full='1';
};
box.addEventListener('focusin',(e)=>{if(e.target.matches('[data-k="id"]'))populate(e.target);});
box.addEventListener('pointerdown',(e)=>{if(e.target.matches('[data-k="id"]'))populate(e.target);});
const fill=(tr)=>{
const id=tr.querySelector('[data-k="id"]').value;
const a=cfg.data.appliances?.[id];
if(!a)return;
tr.querySelector('[data-k="watts"]').value=a.running_w;
tr.querySelector('[data-k="hours"]').value=a.typical_hours_per_day??'';
};
const add=(row)=>{
const tr=tmpl.content.firstElementChild.cloneNode(true);
tr.querySelectorAll('[id]').forEach((el)=>{el.id=el.id.replace('-x-',`-${n}-`);});
tr.querySelectorAll('label[for]').forEach((el)=>{el.htmlFor=el.htmlFor.replace('-x-',`-${n}-`);});
n +=1;
if(row){
const sel=tr.querySelector('[data-k="id"]');
populate(sel);
sel.value=row.id || 'custom';
if(sel.value !==(row.id || 'custom'))sel.value='custom';
fill(tr);
for(const k of['watts','qty','hours'])if(row[k]!==undefined && row[k]!=='')tr.querySelector(`[data-k="${k}"]`).value=row[k];
}
body.appendChild(tr);
return tr;
};
box.querySelector('.wl-add-row').addEventListener('click',()=>{add().querySelector('select').focus();});
box.addEventListener('click',(e)=>{
const btn=e.target.closest('.wl-remove-row');
if(!btn || body.children.length <=1)return;
btn.closest('tr').remove();
onChange();
});
box.addEventListener('change',(e)=>{
if(e.target.matches('[data-k="id"]')){fill(e.target.closest('tr'));onChange();}
});
const rows=()=>[...body.querySelectorAll('tr')].map((tr)=>{
const v=(k)=> tr.querySelector(`[data-k="${k}"]`).value.trim();
return{id:v('id'),watts:v('watts'),qty:v('qty'),hours:v('hours')};
});
const set=(list)=>{body.innerHTML='';list.forEach(add);};
return{rows,set,encode:()=> rows().map((r)=>[r.id,r.watts,r.qty,r.hours].join('~')).join(';'),decode:(s)=> s.split(';').map((p)=>{const[id,watts,qty,hours]=p.split('~');return{id,watts,qty,hours};})};
}
async function init(form){
const cfgEl=form.querySelector('.wl-config');
if(!cfgEl)return;
const cfg=JSON.parse(cfgEl.textContent);
const mod=await import(`../../engine/${cfg.module}${ver?`?ver=${ver}`:''}`);
const calc=mod[cfg.calc];
if(typeof calc !=='function')return;
const labels=Object.fromEntries(cfg.fields.map((f)=>[f.name,f.label.toLowerCase()]));
const errorEl=form.querySelector('.wl-error');
const results=form.querySelector('.wl-results');
const howEl=form.parentElement.querySelector('[data-wl-how]');
const el=(name)=> form.elements.namedItem(name);
const lists={};
let show;
for(const f of cfg.fields)if(f.type==='loads')lists[f.name]=loadsField(form,f,cfg,()=> show && show(true));
const read=()=>{
const inputs={...cfg.fixed};
for(const f of cfg.fields){
if(lists[f.name]){inputs[f.name]=lists[f.name].rows();continue;}
const input=el(f.name);
if(!input)continue;
if(f.type==='checkbox')inputs[f.name]=input.checked;
else if(input.value.trim()!=='')inputs[f.name]=input.value.trim();
}
return inputs;
};
const fieldEl=(name)=>{
if(lists[name])return form.querySelector(`[data-wl-loads="${name}"] select`);
return el(name);
};
show=(pushState)=>{
const out=calc(read(),cfg.data);
form.querySelectorAll('[aria-invalid]').forEach((n)=>{
n.removeAttribute('aria-invalid');
const ids=(n.getAttribute('aria-describedby')|| '').split(' ').filter((x)=> x && x !==errorEl.id);
if(ids.length)n.setAttribute('aria-describedby',ids.join(' '));else n.removeAttribute('aria-describedby');
});
if(!out.ok){
errorEl.textContent=errorMessage(out.error,labels);
errorEl.hidden=false;
results.hidden=true;
if(howEl)howEl.hidden=true;
const bad=out.field && fieldEl(out.field);
if(bad && bad.setAttribute){
bad.setAttribute('aria-invalid','true');
bad.setAttribute('aria-describedby',`${bad.getAttribute('aria-describedby')|| ''} ${errorEl.id}`.trim());
if(pushState)bad.focus();
}
return;
}
errorEl.hidden=true;
results.hidden=false;
for(const o of cfg.outputs){
const node=results.querySelector(`[data-out="${o.key}"] .wl-val`);
if(node)node.textContent=fmt(out[o.key],o.spec);
}
if(howEl && cfg.how){
const text=render(cfg.how,{in:out,out,d:cfg.data.defaults});
howEl.hidden=text===null;
if(text !==null)howEl.textContent=text;
}
if(pushState){
const load=cfg.fields
.map((f)=>{
if(lists[f.name])return `${f.name}:${encodeURIComponent(lists[f.name].encode())}`;
const v=f.type==='checkbox'?(el(f.name)?.checked?'1':''):el(f.name)?.value.trim();
return v?`${f.name}:${encodeURIComponent(v)}`:'';
})
.filter(Boolean)
.join(',');
const url=new URL(window.location.href);
url.search=load?`?load=${load}`:'';
history.replaceState(null,'',url);
}
};
const load=new URLSearchParams(window.location.search).get('load');
if(load){
let changed=false;
for(const pair of load.split(',')){
const i=pair.indexOf(':');
if(i < 1)continue;
const name=pair.slice(0,i);
const f=cfg.fields.find((x)=> x.name===name);
if(!f)continue;
if(lists[name]){
const rows=lists[name].decode(decodeURIComponent(pair.slice(i + 1)).slice(0,2000)).slice(0,40);
if(rows.length){lists[name].set(rows);changed=true;}
continue;
}
const value=decodeURIComponent(pair.slice(i + 1)).slice(0,40);
const input=el(name);
if(!input)continue;
if(f.type==='checkbox')input.checked=value==='1';
else if(f.options){if(f.options.includes(value))input.value=value;else continue;}
else input.value=value;
changed=true;
}
if(changed)show(false);
}
form.addEventListener('submit',(e)=>{e.preventDefault();show(true);});
form.addEventListener('change',(e)=>{if(!e.target.closest('.wl-loads')&&(e.target.tagName==='SELECT' || e.target.type==='checkbox'))show(true);});
}
document.querySelectorAll('form[data-wl-tool]').forEach((form)=>{init(form).catch(()=>{});});
