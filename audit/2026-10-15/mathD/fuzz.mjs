import { data, pageInputs } from './lib.mjs';
import { calculators } from '../../../engine/index.js';
import { errorMessage } from '../../../engine/messages.js';
const generic = errorMessage('__nope__');
const BAD = [0, -1, -0.0001, '', null, undefined, 'abc', '1,500', '1.5', ' 12 ', '1e3', 1e13, NaN, Infinity, -Infinity, true, false, [], {}, '0', '-5', '1,5', '١٢', '12abc', 0.0000001, 1e11, '1,50,000'];
const ids = ['D1','D2','D3','D5','D6','D7','D8','D9','D12','D13','D14','D15','D16','N3','N6','N12','N13','N14','N17'];
const problems = [];
let runs = 0;
function scan(o, path, out) {
  if (typeof o === 'number') { if (!Number.isFinite(o) || o < 0) out.push(path + '=' + o); }
  else if (typeof o === 'string') { if (o.trim() === '' ) out.push(path + ' blank'); }
  else if (o === null) out.push(path + ' null');
  else if (Array.isArray(o)) o.forEach((v, i) => scan(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) scan(v, path ? `${path}.${k}` : k, out);
}
const allow = new Set(['vs_low_pct', 'vs_high_pct']);
const summary = {};
for (const id of ids) {
  const { calc, inputs } = pageInputs(id);
  const fn = calculators[calc];
  const keys = [...new Set([...Object.keys(inputs), ...(calc==='solar_from_loads'?['night_hours','battery_v','dod','inverter_eff','charge_eff']:[]), ...(calc==='solar_size'?['monthly_units','daily_kwh','psh','pr','yield_kwh_per_kwp_day']:[]), ...(calc==='solar_seasonal'?['kw']:[]), ...(calc==='quote_checker'?['range_low','range_high']:[]), ...(calc==='solar_forecast'?['tariff']:[])])].filter(k => k !== 'loads');
  for (const k of keys) for (const b of BAD) {
    runs++;
    const inp = structuredClone(inputs); if (b === undefined) delete inp[k]; else inp[k] = b;
    if (calc === 'solar_size' && k === 'monthly_units') delete inp.daily_kwh;
    const r = fn(inp, data);
    const key = `${id}.${k}=${JSON.stringify(b)}`;
    if (!r.ok) {
      if (errorMessage(r.error) === generic) problems.push(`${key} -> generic message for ${r.error}`);
      (summary[id] ??= { ok: 0, err: 0 }).err++;
    } else {
      const bad = []; scan(r, '', bad);
      const bad2 = bad.filter(p => !allow.has(p.split('=')[0]));
      if (bad2.length) problems.push(`${key} -> ${bad2.join(',')}`);
      (summary[id] ??= { ok: 0, err: 0 }).ok++;
      // record accepted suspicious values
      if (typeof b === 'number' && (b <= 0 || b > 1e10) || ['abc','12abc','1,5','١٢',true,false].includes(b) || Array.isArray(b) || (b && typeof b==='object')) problems.push(`ACCEPTED ${key} -> ok (${JSON.stringify(r[k])})`);
    }
  }
}
console.log('runs', runs, JSON.stringify(summary));
console.log(problems.join('\n'));
