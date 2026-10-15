import { data } from './lib.mjs';
import { calculators as C } from '../../../engine/index.js';
const M = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
for (const city of Object.keys(data.cities)) {
  let diff = 0, n = 0, ex = null;
  for (let u = 50; u <= 3000; u += 10) {
    n++;
    const d7 = C.solar_size({ monthly_units: u, city }, data);
    const n17 = C.solar_seasonal({ city, ...Object.fromEntries(M.map(k => [k, u])) }, data);
    if (d7.panels !== n17.panels) { diff++; ex ??= { u, d7: d7.panels, d7kw: +d7.kw.toFixed(3), n17: n17.panels, n17kw: +n17.kw_annual.toFixed(3), ratio: +(d7.kw / n17.kw_annual).toFixed(4) }; }
  }
  console.log(city, 'flat bills 50..3000 step 10:', diff, 'of', n, 'differ; first', JSON.stringify(ex));
}
