import { data, pageInputs } from './lib.mjs';
import { calculators as C } from '../../../engine/index.js';
const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31], N = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const { inputs } = pageInputs('D3');
for (const city of Object.keys(data.cities)) {
  const r = C.solar_from_loads({ ...inputs, city }, data);
  const pv = data.cities[city].pvout_month;
  const daily = pv.map((p, m) => r.installed_kw * p / DAYS[m]);
  const worst = daily.indexOf(Math.min(...daily));
  const shortMonths = daily.map((x, m) => x < r.array_kwh - 1e-9 ? N[m] : null).filter(Boolean);
  const minPerKw = Math.min(...pv.map((p, m) => p / DAYS[m]));
  const panelsWinter = Math.ceil(Math.max(r.array_kwh / minPerKw, r.kw_power) * 1000 / 585 - 1e-9);
  console.log(city, 'panels', r.panels, 'inst', r.installed_kw, 'need/day', r.array_kwh.toFixed(3), 'worst', N[worst], daily[worst].toFixed(3), 'short%', ((1 - daily[worst] / r.array_kwh) * 100).toFixed(1), 'months short', shortMonths.join(' '), 'panels for worst month', panelsWinter);
}
