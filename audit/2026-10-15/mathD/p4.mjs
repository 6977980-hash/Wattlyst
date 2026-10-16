import { data } from './lib.mjs';
import { calculators as C } from '../../../engine/index.js';
const s = (r, ks) => r.ok ? Object.fromEntries(ks.map(k => [k, r[k]])) : r;
// a sky exactly like the long-term average: sum GTI = psh*1000 = 5100 Wh/m2 for Lahore
const gti = [0,0,0,0,0,0,100,300,500,650,750,800,750,600,400,200,50,0,0,0,0,0,0,0];
console.log('sum', gti.reduce((a,b)=>a+b,0));
for (const pr of [0.78, 0.6, 0.5, 0.95]) {
  console.log('pr', pr, 'typical', s(C.solar_forecast({ city: 'lahore', kwp: 5, pr }, data), ['units','pct_of_typical']), 'forecast', s(C.solar_forecast({ city: 'lahore', kwp: 5, pr, gti_wm2: gti }, data), ['units','typical_units','pct_of_typical','sky']));
}
// D6 above largest panel
console.log('D6 200Ah 24V', C.panel_for_12v({ ah: 200, volts: 24, psh: 5 }, data));
