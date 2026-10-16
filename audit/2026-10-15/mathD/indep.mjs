import { data, pageInputs } from './lib.mjs';
// independent load energy: per row: run=watts||item.running_w; energy_w = avg_w? avg_w*run/running_w : run ; hours default typical
export function loadsIndep(rows) {
  let run = 0, e = 0, step = 0;
  for (const r of rows) {
    const it = data.appliances[r.id];
    const w = r.watts ?? it.running_w; const q = r.qty ?? 1; const h = r.hours ?? it.typical_hours_per_day ?? 0;
    const ew = it.avg_w ? it.avg_w * w / it.running_w : w;
    run += w * q; e += ew * q * h; if (q > 0) step = Math.max(step, (it.starting_w * w / it.running_w) - w);
  }
  return { run, kwh: e / 1000, surge: run + step };
}
if (process.argv[1].endsWith('indep.mjs')) for (const id of ['D3','D8','D12','D13','N13']) {
  const { inputs } = pageInputs(id);
  const L = loadsIndep(inputs.loads);
  const y = 4, pr = 0.78;
  const kwE = L.kwh / y, kwP = L.run / 1000 / pr, kw = Math.max(kwE, kwP);
  const panels = Math.ceil(kw * 1000 / 585 - 1e-9);
  console.log(id, 'run', L.run, 'surge', L.surge, 'kWh', L.kwh.toFixed(3), 'kwE', kwE.toFixed(3), 'kwP', kwP.toFixed(3), 'panels', panels, 'inst', (panels*0.585).toFixed(3), 'inv', Math.max(L.run*1.25, panels*585/1.3).toFixed(1), 'month units', (L.kwh*30).toFixed(1), 'solar month', (panels*0.585*4*30).toFixed(1), 'ratio', (panels*0.585*4/L.kwh).toFixed(2), 'D7 panels same units', Math.ceil(L.kwh/4*1000/585-1e-9));
}
