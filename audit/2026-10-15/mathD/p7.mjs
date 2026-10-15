import { data, pageInputs } from './lib.mjs';
import { calculators as C } from '../../../engine/index.js';
const h1 = pageInputs('H1').inputs; const d8 = pageInputs('D8').inputs;
const hp = C.home_plan({ ...h1, loads: d8.loads, sanctioned_kw: 7 }, data);
const s = C.solar_from_loads(d8, data);
console.log('H1 with D8 list', hp.panels, hp.installed_kw, hp.solar_limited_by, 'monthly_units', hp.monthly_units, 'export', hp.export_units, 'import', hp.import_units, '| D8', s.panels);
const d7 = C.solar_size({ daily_kwh: s.daily_kwh, city: 'lahore' }, data);
console.log('D7 same kWh', d7.panels, d7.installed_kw);
const n13 = C.solar_from_loads(pageInputs('N13').inputs, data);
console.log('N13 solar/use', (n13.monthly_kwh_estimate / (n13.daily_kwh * 30)).toFixed(3), 'D7 panels', C.solar_size({ daily_kwh: n13.daily_kwh, city: 'lahore' }, data).panels, 'vs', n13.panels);
for (const id of ['D8','D12','D13','N13']) { const r = C.solar_from_loads(pageInputs(id).inputs, data); const e = C.solar_size({ daily_kwh: r.daily_kwh, city: 'lahore' }, data); console.log(id, 'loads tool', r.panels, r.installed_kw, 'energy-only', e.panels, e.installed_kw, 'extra panels', r.panels - e.panels, 'oversize %', ((r.installed_kw / e.installed_kw - 1) * 100).toFixed(1), 'solar/use %', (r.monthly_kwh_estimate / (r.daily_kwh * 30) * 100).toFixed(0)); }
// price consequence D14 for D8: on-grid price at 5.265 vs 4.095
const a = C.solar_price_estimate({ kwp: 5.265 }, data), b = C.solar_price_estimate({ kwp: 4.095 }, data);
console.log('D14 mid at 5.265', Math.round(a.price_mid_rs), 'at 4.095', Math.round(b.price_mid_rs), 'diff', Math.round(a.price_mid_rs - b.price_mid_rs));
