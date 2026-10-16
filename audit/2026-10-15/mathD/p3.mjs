import { data, pageInputs } from './lib.mjs';
import { calculators as C } from '../../../engine/index.js';
import { inverterAt } from '../../../engine/prices.js';
const items = data.component_prices.items;
for (const kw of [1,2,2.7,3,4,5,5.5,6,6.5,7,8,9,10,12,15]) {
  const [h] = inverterAt(items, 'hybrid_inverter', kw); const [o] = inverterAt(items, 'ongrid_inverter', kw);
  console.log(kw, 'hybrid', Math.round(h), 'ongrid', Math.round(o), 'premium', Math.round(Math.max(0, h - o)));
}
const { inputs } = pageInputs('H1');
const r = C.home_decision(inputs, data);
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, v]]);
for (const [k, v] of flat(r)) if (/premium|hybrid_kw|inverter/i.test(k)) console.log(k, v);
