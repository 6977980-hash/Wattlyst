import { calculators as C } from '../../../engine/index.js';
import { data } from '../../../tests/load-data.js';
for (const h of [[100,120,150,180,190,'1,500'],[100,120,150,180,190,'250'],[100,120,150,180,190,' 250 '],['1,50,000',1,1,1,1,1],[100,120,150,180,190,'']]) console.log(JSON.stringify(h), JSON.stringify(C.protected_check({history:h},data)));
for (const row of [{id:'ceiling-fan-ac',qty:'1,000',hours:12},{id:'ceiling-fan-ac',qty:1.5,hours:12},{id:'ceiling-fan-ac',qty:-1},{id:'nope'},{watts:'1,500',hours:2},{id:'ceiling-fan-ac',hours:'abc'}]) { const r=C.home_load({loads:[row]},data); console.log(JSON.stringify(row), r.ok?['ok',r.running_w,r.monthly_units]:r.error); }
