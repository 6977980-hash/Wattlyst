// D3: off-grid solar from an appliance list, plus the weakest month of the year (full audit WL-128). Own module so the
// other list pages (D8, D12, D13, N13) do not ship the month check.
import { calculator, CalcError } from './core.js';
import { solar_from_loads } from './solar.js';
import { MONTH_NAMES, MONTH_DAYS } from './months.js';

/**
 * solar_from_loads with off_grid on, sized on the yearly yield as before [ENGINEER: worst-month sizing]. With a city,
 * month m makes installed kW × pvout_m ÷ days_m kWh a day (data/cities-pk.json pvout_month); the weakest month is the
 * lowest of those. worst_short_kwh = max(0, array need − that day) and worst_short_pct = its share of the need.
 */
export const solar_offgrid = calculator((i, d) => {
  const r = solar_from_loads.raw({ ...i, off_grid: true }, d);
  const pv = d?.cities?.[String(i.city ?? '').trim().toLowerCase()]?.pvout_month;
  if (!pv) return r;
  if (pv.length !== 12) throw new CalcError('city_unknown', 'city');
  const day = pv.map((p, m) => (r.installed_kw * p) / MONTH_DAYS[m]);
  const w = day.indexOf(Math.min(...day));
  const short = Math.max(0, r.array_kwh - day[w]);
  return { ...r, worst_month: MONTH_NAMES[w], worst_month_kwh: day[w], worst_short_kwh: short, worst_short_pct: (short / r.array_kwh) * 100, months_short: day.filter((x) => x < r.array_kwh - 1e-9).length };
});
