// Independent verification of the Wattlyst solar and price engines (read-only audit, 2026-10-15).
// Run: node --test /tmp/claude-0/-home-user-wattlyst/10a88ae1-cea1-556c-b13a-8987bcd472f7/scratchpad/mathD/verify.test.mjs
// Every test here PASSES when the engine behaves correctly. Confirmed defects are in defects.test.mjs (they fail today).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, pageInputs, J } from './lib.mjs';
import { loadsIndep } from './indep.mjs';
import { calculators as C } from '../../../engine/index.js';
import { priceRange, inverterAt } from '../../../engine/prices.js';
import { errorMessage } from '../../../engine/messages.js';

const D = data.defaults;
const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} got ${a}, want ${b}`);
const ceil = (x) => Math.ceil(x - 1e-9);
const M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CITIES = Object.keys(data.cities);
const generic = errorMessage('__nope__');
const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const nextStd = (list, x) => list.find((s) => s >= x - 1e-9);

function assertClean(r, allow = []) {
  const walk = (v, p) => {
    if (typeof v === 'number') { assert.ok(Number.isFinite(v), `${p} not finite`); if (!allow.includes(p)) assert.ok(v >= 0, `${p} negative ${v}`); }
    else if (typeof v === 'string') assert.ok(v.trim() !== '', `${p} blank`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  walk(r, '');
}

// ---------- D7/D2 solar_size ----------
test('D7/D2 solar_size: kW = E / yield, panels = ceil, installed, roof, monthly estimate (random grid)', () => {
  for (let n = 0; n < 400; n++) {
    const city = CITIES[n % CITIES.length];
    const units = Math.round(rng() * 3000 + 1);
    const panel_w = [330, 400, 450, 550, 585][n % 5];
    const r = C.solar_size({ monthly_units: units, city, panel_w }, data);
    const y = data.cities[city].yield;
    const kw = units / 30 / y;
    const panels = ceil((kw * 1000) / panel_w);
    near(r.kw, kw); assert.equal(r.panels, panels); near(r.installed_kw, panels * panel_w / 1000);
    near(r.roof_m2, panels * D.panel_area_m2); near(r.monthly_kwh_estimate, panels * panel_w / 1000 * y * 30);
    assert.ok(r.installed_kw >= r.kw - 1e-9, 'installed rounds UP');
    assert.ok(r.installed_kw - r.kw < panel_w / 1000, 'at most one panel above');
  }
});
test('D7 PSH path: yield = PSH × PR when no city', () => {
  const r = C.solar_size({ daily_kwh: 10, psh: 5, pr: 0.8 }, data);
  near(r.yield_kwh_per_kwp_day, 4); near(r.kw, 2.5); assert.equal(r.panels, 5);
});
test('D7 exact panel boundary: 4.68 kW of 585 W = exactly 8 panels (no float dust)', () => {
  const r = C.solar_size({ daily_kwh: 4.68 * 4, city: 'lahore' }, data);
  assert.equal(r.panels, 8);
});

// ---------- D1 solar_battery ----------
test('D1 solar_battery: Ah = E × days × 1000 / (V × DoD × η)', () => {
  for (let n = 0; n < 200; n++) {
    const e = rng() * 30 + 0.1, days = 1 + (n % 3), v = [12, 24, 48][n % 3], dod = [0.5, 0.9][n % 2], eff = 0.85 + 0.1 * rng();
    const r = C.solar_battery({ night_kwh: e, days, volts: v, dod, inverter_eff: eff }, data);
    near(r.ah, (e * 1000 * days) / (v * dod * eff)); near(r.kwh, r.ah * v / 1000);
  }
});

// ---------- D5/D8/D3/D15 solarSystem ----------
test('D5 solar_for_ac: every AC in the catalog, 0..24 h, independent energy + power rule', () => {
  const acs = Object.values(data.appliances).filter((a) => a.id.startsWith('ac-'));
  for (const ac of acs) for (const h of [0, 1, 4, 8, 12, 24]) for (const city of CITIES) {
    const r = C.solar_for_ac({ ac: ac.id, hours: h, city }, data);
    const E = (ac.avg_w ?? ac.running_w) * h / 1000;
    const kw = Math.max(E / data.cities[city].yield, ac.running_w / 1000 / D.pr);
    const panels = ceil(kw * 1000 / 585);
    assert.equal(r.panels, panels, `${ac.id} ${h}h ${city}`);
    near(r.inverter_w, Math.max(ac.running_w * D.margin, panels * 585 / D.dc_ac_ratio_max));
    assert.equal(r.inverter_surge_w, ac.starting_w);
  }
});
test('D5 vs E5: daily AC units agree (both use avg_w)', () => {
  for (const ac of Object.values(data.appliances).filter((a) => a.id.startsWith('ac-') && a.avg_w)) {
    const a = C.solar_for_ac({ ac: ac.id, hours: 8, city: 'lahore' }, data);
    const b = C.ac_units({ ac: ac.id, hours: 8 }, data);
    near(a.daily_kwh, b.daily_units, 1e-9, ac.id);
  }
});
test('D8/D12/D13/N13/D3 page defaults reproduce an independent load + sizing calculation', () => {
  for (const id of ['D8', 'D12', 'D13', 'N13', 'D3']) {
    const { calc, inputs } = pageInputs(id);
    const r = C[calc](inputs, data);
    const L = loadsIndep(inputs.loads);
    near(r.running_w, L.run); near(r.daily_kwh, L.kwh); near(r.surge_w, L.surge);
    let arr = L.kwh;
    if (inputs.off_grid && inputs.night_hours > 0) {
      const en = L.run * inputs.night_hours / 1000; const load = Math.max(L.kwh, en);
      arr = load - en + en / (0.9 * (inputs.dod > 0.5 ? 0.95 : 0.85));
    }
    const kw = Math.max(arr / 4, L.run / 1000 / 0.78);
    assert.equal(r.panels, ceil(kw * 1000 / 585), id);
  }
});
test('D3 off-grid: E_array formula and monotone in night hours', () => {
  const loads = [{ id: 'led-bulb', qty: 8, hours: 6 }, { id: 'ceiling-fan-ac', qty: 3, hours: 12 }];
  let prev = 0;
  for (let nh = 0; nh <= 24; nh++) {
    const r = C.solar_from_loads({ loads, city: 'lahore', night_hours: nh, battery_v: 48, off_grid: true }, data);
    assert.ok(r.array_kwh >= prev - 1e-9, `night ${nh}`); prev = r.array_kwh;
    if (nh > 0) {
      const en = r.running_w * nh / 1000, load = Math.max(r.daily_kwh, en);
      near(r.array_kwh, load - en + en / (0.9 * 0.95));
    }
  }
});
test('D15 pump: P = hp × 745.7 / η, energy + power rule, drive = max(P × margin, kWp/1.3), surge = running', () => {
  for (const hp of [1, 3, 5, 7.5, 10, 12.5, 15, 20, 25, 30]) for (const h of [1, 4, 6, 8, 10]) {
    const r = C.solar_for_pump({ hp, hours: h, city: 'multan' }, data);
    const P = hp * 745.7 / 0.8;
    const kw = Math.max(P * h / 1000 / 4.4, P / 1000 / 0.78);
    const panels = ceil(kw * 1000 / 585);
    assert.equal(r.panels, panels); near(r.drive_kw, Math.max(P * 1.25, panels * 585 / 1.3) / 1000); near(r.surge_w, P);
  }
});

// ---------- D6 panel_for_12v ----------
test('D6 panel_for_12v: W formula, next standard panel, charge time, controller', () => {
  for (const ah of [20, 50, 100, 150, 200]) for (const v of [12, 24]) for (const psh of [3, 4, 5, 6]) {
    const r = C.panel_for_12v({ ah, volts: v, psh }, data);
    const w = ah * v * 0.5 / 0.85 / (psh * 0.78);
    near(r.panel_w, w);
    const std = nextStd(D.standard_panel_w, w);
    const fitted = std ?? ceil(w / 585) * 585;
    if (std) assert.equal(r.standard_panel_w, std); else assert.equal(r.panels_of_largest, ceil(w / 585));
    near(r.charge_hours, ah * v * 0.5 / 0.85 / (fitted * 0.78));
    near(r.controller_a, fitted / v * 1.25);
    const ca = nextStd(D.standard_controller_a, fitted / v * 1.25);
    if (ca) assert.equal(r.standard_controller_a, ca); else assert.equal(r.controller_above_standard_sizes, true);
  }
});

// ---------- D16 charge controller ----------
test('D16 MPPT A = W / V × 1.25 and next standard size; boundaries at 40 A (768 W @24 V)', () => {
  for (const v of [12, 24, 48]) for (let w = 50; w <= 6000; w += 50) {
    const r = C.charge_controller({ type: 'mppt', panel_w: w, battery_v: v }, data);
    const a = w / v * 1.25; near(r.amps, a);
    const s = nextStd(D.standard_controller_a, a);
    if (s) assert.equal(r.standard_a, s); else assert.equal(r.above_standard_sizes, true);
  }
  assert.equal(C.charge_controller({ type: 'mppt', panel_w: 768, battery_v: 24 }, data).standard_a, 40); // exactly 40 A
  assert.equal(C.charge_controller({ type: 'mppt', panel_w: 768.1, battery_v: 24 }, data).standard_a, 50);
  assert.equal(C.charge_controller({ type: 'mppt', panel_w: 1920, battery_v: 24 }, data).standard_a, 100); // exactly 100 A
  assert.equal(C.charge_controller({ type: 'mppt', panel_w: 1921, battery_v: 24 }, data).above_standard_sizes, true);
});
test('D16 PWM A = Isc × N × 1.25; N must be whole', () => {
  const r = C.charge_controller({ type: 'pwm', isc: 10, n_parallel: 2 }, data);
  near(r.amps, 25); assert.equal(r.standard_a, 30);
  assert.equal(C.charge_controller({ type: 'pwm', isc: 10, n_parallel: 1.5 }, data).error, 'n_parallel_must_be_whole');
});

// ---------- N12 cleaning ----------
test('N12 cleaning loss and break-even day (closed form)', () => {
  for (const [kwp, y, rate, tariff, cost] of [[10, 4, 0.003, 36.46, 2000], [20, 4, 0.003, 8.13, 2000], [3, 4.6, 0.002, 22.44, 3000], [5, 4, 0.01, 40, 500]]) {
    const r = C.cleaning_loss({ kwp, yield: y, rate, days: 30, tariff, cleaning_cost: cost }, data);
    const soil = Math.min(rate * 30, 0.25); near(r.loss_kwh_day, kwp * y * soil);
    // independent: smallest n with sum_{d=1..n} kwp*y*min(rate*d,cap)*tariff > cost
    let cum = 0, n = 0; while (n < 365) { n++; cum += kwp * y * Math.min(rate * n, 0.25) * tariff; if (cum > cost) break; }
    if (cum > cost) assert.equal(r.clean_after_days, n); else assert.equal(r.clean_worth_it_within_year, false);
  }
  assert.equal(C.cleaning_loss({ kwp: 10, yield: 4, rate: 0.3, days: 30, tariff: 30 }, data).error, 'soiling_rate_invalid');
});

// ---------- N14 autonomy vs D1 ----------
test('N14 autonomy formula; with no cloudy solar its target Ah equals D1 for the same inputs', () => {
  const r = C.autonomy({ ah: 200, v: 24, dod: 0.5, eta: 0.85, load_wh: 2000, solar_wh: 600, target_days: 2 }, data);
  near(r.days, (200 * 24 * 0.5 * 0.85) / 1400); near(r.target_ah, 2 * 1400 / (24 * 0.5 * 0.85));
  for (const [load, days, v, dod, eta] of [[2000, 2, 24, 0.5, 0.85], [6000, 3, 48, 0.9, 0.9], [1500, 1, 12, 0.5, 0.85]]) {
    const a = C.autonomy({ ah: 100, v, dod, eta, load_wh: load, solar_wh: 0, target_days: days }, data);
    const b = C.solar_battery({ night_kwh: load / 1000, days, volts: v, dod, inverter_eff: eta }, data);
    near(a.target_ah, b.ah, 1e-9);
  }
  assert.equal(C.autonomy({ ah: 200, v: 24, load_wh: 600, solar_wh: 600 }, data).error, 'solar_covers_load');
});

// ---------- N17 seasonal ----------
function seasonalIndep(units, city, kwIn, panel_w = 585, share = 0.5, buy = 8.13) {
  const pv = data.cities[city].pvout_month;
  const sumU = units.reduce((a, b) => a + b, 0), sumP = pv.reduce((a, b) => a + b, 0);
  const kwA = sumU / sumP, kw = kwIn ?? kwA;
  const panels = ceil(kw * 1000 / panel_w), inst = panels * panel_w / 1000;
  let self = 0, grid = 0, exp = 0, short = 0, worst = 0, ms = 0;
  units.forEach((u, m) => { const s = inst * pv[m]; const su = Math.min(s, u * share); self += su; grid += u - su; exp += s - su; const sh = Math.max(0, u - s); if (sh >= 1) ms++; worst = Math.max(worst, sh); });
  return { kwA, kwPeak: Math.max(...units.map((u, m) => u / pv[m])), panels, inst, self, grid, exp, credit: exp * buy, ms, worst, pct: inst * sumP / sumU * 100 };
}
test('N17 solar_seasonal matches an independent month-by-month model (random bills, all cities)', () => {
  for (let n = 0; n < 300; n++) {
    const city = CITIES[n % CITIES.length];
    const units = M.map(() => Math.round(rng() * 900));
    if (units.every((u) => u === 0)) continue;
    const kwIn = n % 3 === 0 ? Math.round(rng() * 150) / 10 + 0.5 : undefined;
    const r = C.solar_seasonal({ city, ...Object.fromEntries(M.map((k, i) => [k, units[i]])), ...(kwIn ? { kw: kwIn } : {}) }, data);
    const e = seasonalIndep(units, city, kwIn);
    near(r.kw_annual, e.kwA); near(r.kw_peak, e.kwPeak); assert.equal(r.panels, e.panels);
    near(r.self_used_year, e.self); near(r.grid_units_year, e.grid); near(r.export_units_year, e.exp);
    near(r.export_credit_rs, e.credit); assert.equal(r.months_short, e.ms); near(r.worst_short_units, e.worst); near(r.solar_pct, e.pct);
    near(r.grid_units_year + r.self_used_year, r.annual_units, 1e-9, 'energy balance use');
    near(r.export_units_year + r.self_used_year, r.solar_year, 1e-9, 'energy balance solar');
  }
});
test('N17 with day_share = 1 reduces to the plain monthly balance', () => {
  const units = [250, 230, 280, 400, 600, 700, 720, 680, 560, 380, 260, 260];
  const r = C.solar_seasonal({ city: 'lahore', ...Object.fromEntries(M.map((k, i) => [k, units[i]])), day_share: 1 }, data);
  for (const m of r.months) { near(m.self_used, Math.min(m.units, m.solar)); near(m.grid, m.short, 1e-9); }
});
test('N17 one-bill sizes equal D7 for that bill (same method)', () => {
  const units = [250, 230, 280, 400, 600, 700, 720, 680, 560, 380, 260, 260];
  const r = C.solar_seasonal({ city: 'karachi', ...Object.fromEntries(M.map((k, i) => [k, units[i]])) }, data);
  near(r.kw_from_high_bill, C.solar_size({ monthly_units: 720, city: 'karachi' }, data).kw);
  near(r.kw_from_low_bill, C.solar_size({ monthly_units: 230, city: 'karachi' }, data).kw);
});
test('N17 errors: all-zero, missing month, negative, text, unknown city', () => {
  const z = Object.fromEntries(M.map((k) => [k, 0]));
  assert.equal(C.solar_seasonal({ city: 'lahore', ...z }, data).error, 'monthly_units_all_zero');
  const { jan, ...noJan } = { ...z, feb: 100 };
  assert.equal(C.solar_seasonal({ city: 'lahore', ...noJan }, data).error, 'jan_required');
  assert.equal(C.solar_seasonal({ city: 'lahore', ...z, jan: -5 }, data).error, 'jan_too_small');
  assert.equal(C.solar_seasonal({ city: 'lahore', ...z, jan: 'abc' }, data).error, 'jan_invalid');
  assert.equal(C.solar_seasonal({ city: 'gwadar', ...z, jan: 100 }, data).error, 'city_unknown');
  const ok = C.solar_seasonal({ city: ' Lahore ', ...z, jan: '1,500' }, data);
  assert.equal(ok.ok, true); assert.equal(ok.annual_units, 1500);
});

// ---------- N6 forecast ----------
test('N6 typical day = kWp × yield; forecast = kWp × ΣGTI/1000 × PR; sky bands at boundaries', () => {
  const t = C.solar_forecast({ city: 'lahore', kwp: 5 }, data);
  near(t.units, 20);
  const day = (sum) => { const h = Array(24).fill(0); let left = sum; for (let i = 6; i < 18 && left > 0; i++) { h[i] = Math.min(1000, left); left -= h[i]; } return h; };
  for (const [pct, sky] of [[85, 'Sunny'], [84.99, 'Partly cloudy'], [60, 'Partly cloudy'], [30, 'Cloudy'], [29.9, 'Overcast or rain'], [0, 'Overcast or rain']]) {
    const sum = pct / 100 * 20 / (5 * 0.78) * 1000; // ΣGTI that gives this % of typical
    const r = C.solar_forecast({ city: 'lahore', kwp: 5, gti_wm2: day(sum) }, data);
    near(r.pct_of_typical, pct, 1e-6); assert.equal(r.sky, sky, `pct ${pct}`);
  }
  assert.equal(C.solar_forecast({ city: 'lahore', kwp: 5, gti_wm2: Array(49).fill(0) }, data).error, 'forecast_invalid');
  assert.equal(C.solar_forecast({ city: 'lahore', kwp: 5, gti_wm2: [1600] }, data).error, 'forecast_invalid');
  assert.equal(C.solar_forecast({ city: 'lahore', kwp: 5, gti_wm2: Array(13).fill(1000) }, data).error, 'forecast_invalid');
  assert.equal(C.solar_forecast({ city: 'lahore', kwp: 5, gti_wm2: [null, 500] }, data).error, 'forecast_invalid');
});

// ---------- Prices ----------
const fine = (lo, hi, step) => { const a = []; for (let x = lo; x <= hi + 1e-9; x += step) a.push(+x.toFixed(4)); return a; };
test('priceRange: total price non-decreasing in kW, per-W between the endpoints of its segment, continuous at listed sizes', () => {
  for (const type of ['on-grid', 'hybrid']) {
    const rows = data.solar_prices.systems.filter((r) => r.type === type).sort((a, b) => a.kw - b.kw);
    let prevLo = 0, prevHi = 0;
    for (const kw of fine(0.1, 30, 0.01)) {
      const r = priceRange(data, type, kw);
      const lo = r.lo * kw * 1000, hi = r.hi * kw * 1000;
      assert.ok(lo >= prevLo - 1e-6 && hi >= prevHi - 1e-6, `${type} ${kw} kW total fell`);
      assert.ok(r.lo <= r.hi + 1e-12);
      prevLo = lo; prevHi = hi;
      const a = rows.filter((x) => x.kw <= kw).pop(), b = rows.find((x) => x.kw >= kw);
      if (a && b && a !== b) {
        const pa = a.low_rs / a.kw / 1000, pb = b.low_rs / b.kw / 1000;
        assert.ok(r.lo >= Math.min(pa, pb) - 1e-9 && r.lo <= Math.max(pa, pb) + 1e-9, `${type} ${kw} per-W outside segment`);
      }
    }
    for (const row of rows) { const r = priceRange(data, type, row.kw); near(r.lo * row.kw * 1000, row.low_rs); near(r.hi * row.kw * 1000, row.high_rs); }
  }
});
test('D14, N3 and D9 agree for the same size (same data, same arithmetic)', () => {
  for (const kw of [1, 3, 3.51, 5, 7.5, 10, 12, 20, 25]) for (const type of ['on-grid', 'hybrid']) {
    const est = C.solar_price_estimate({ kwp: kw, type }, data);
    const q = C.quote_checker({ kwp: kw, type, price: est.price_mid_rs }, data);
    near(q.range_low_rs, est.price_low_rs); near(q.range_high_rs, est.price_high_rs); assert.equal(q.verdict, 'within');
    assert.equal(C.quote_checker({ kwp: kw, type, price: est.price_low_rs }, data).verdict, 'within'); // boundary inclusive
    assert.equal(C.quote_checker({ kwp: kw, type, price: est.price_low_rs - 1 }, data).verdict, 'below');
    assert.equal(C.quote_checker({ kwp: kw, type, price: est.price_high_rs + 1 }, data).verdict, 'above');
    assert.equal(est.low_confidence, q.low_confidence);
  }
  const p = C.panel_price({ panel_w: 585, panels: 17 }, data);
  const e = C.solar_price_estimate({ kwp: 9.945, type: 'on-grid' }, data);
  near(p.total_low_rs, e.panels_low_rs); near(p.total_high_rs, e.panels_high_rs);
});
test('D14 payback = price ÷ (saving × 12); N3 percentages', () => {
  const r = C.solar_price_estimate({ kwp: 10, type: 'on-grid', monthly_saving_rs: 25000 }, data);
  near(r.payback_years_low, 950000 / 300000); near(r.payback_years_high, 1200000 / 300000);
  const q = C.quote_checker({ kwp: 10, type: 'on-grid', price: 1100000 }, data);
  near(q.vs_low_pct, (110 - 95) / 95 * 100); near(q.vs_high_pct, (110 - 120) / 120 * 100);
  assert.equal(C.quote_checker({ kwp: 10, price: 1e6, range_low: 130, range_high: 100 }, data).error, 'range_invalid');
});
test('inverterAt: monotone non-decreasing in kW for both inverter types', () => {
  for (const cat of ['ongrid_inverter', 'hybrid_inverter']) {
    let prev = 0;
    for (const kw of fine(0.5, 20, 0.05)) { const [v] = inverterAt(data.component_prices.items, cat, kw); assert.ok(v >= prev - 1e-6, `${cat} ${kw}`); prev = v; }
  }
});

// ---------- Invariants ----------
test('invariants: more kWh never fewer panels, more sun never more panels, same input same output', () => {
  for (const city of CITIES) {
    let prev = 0;
    for (let u = 10; u <= 3000; u += 7) { const p = C.solar_size({ monthly_units: u, city }, data).panels; assert.ok(p >= prev); prev = p; }
  }
  const byYield = CITIES.map((c) => [data.cities[c].yield, C.solar_size({ monthly_units: 600, city: c }, data).panels]).sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < byYield.length; k++) assert.ok(byYield[k][1] <= byYield[k - 1][1]);
  const base = [{ id: 'led-bulb', qty: 4, hours: 6 }];
  let prev = 0;
  for (let h = 0; h <= 24; h += 2) { const r = C.solar_from_loads({ loads: [...base, { id: 'ac-split-1-5ton-inverter', hours: h }], city: 'lahore' }, data); assert.ok(r.panels >= prev); prev = r.panels; }
  for (const id of ['D8', 'N17', 'D14', 'D6']) { const { calc, inputs } = pageInputs(id); assert.deepEqual(C[calc](structuredClone(inputs), data), C[calc](structuredClone(inputs), data)); }
});

// ---------- Invalid input fuzz ----------
test('fuzz: every invalid input gives ok:false with a specific message; valid results never NaN/Infinity/negative/blank', () => {
  const BAD = [0, -1, '', null, 'abc', '1,5', '12abc', 1e13, NaN, Infinity, true, [], {}, '١٢'];
  const GOOD = ['1,500', ' 12 ', '1.5', 0.5, 1e11];
  for (const id of ['D1', 'D2', 'D3', 'D5', 'D6', 'D7', 'D8', 'D9', 'D12', 'D13', 'D14', 'D15', 'D16', 'N3', 'N6', 'N12', 'N13', 'N14', 'N17']) {
    const { calc, inputs } = pageInputs(id);
    for (const k of Object.keys(inputs).filter((x) => x !== 'loads')) for (const v of [...BAD, ...GOOD]) {
      const r = C[calc]({ ...structuredClone(inputs), [k]: v }, data);
      if (!r.ok) assert.notEqual(errorMessage(r.error), generic, `${id}.${k}=${JSON.stringify(v)} -> ${r.error}`);
      else assertClean(r, ['vs_low_pct', 'vs_high_pct']);
    }
  }
});

// ---------- Data ----------
test('cities: Σ pvout_month within ±1.2% of yield × 365, and yield ≈ PSH × 0.78 within ±2.5%', () => {
  for (const [k, c] of Object.entries(data.cities)) {
    const s = c.pvout_month.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s / (c.yield * 365) - 1) < 0.012, `${k} ${s} vs ${c.yield * 365}`);
    assert.ok(Math.abs(c.yield / (c.psh * 0.78) - 1) < 0.025, `${k} yield/psh`);
  }
});
test('solar-prices: low ≤ high, low_rs and high_rs non-decreasing with size per type; points within 120 days', () => {
  const s = data.solar_prices;
  for (const type of ['on-grid', 'hybrid']) {
    const rows = s.systems.filter((r) => r.type === type).sort((a, b) => a.kw - b.kw);
    for (let i = 0; i < rows.length; i++) { assert.ok(rows[i].low_rs <= rows[i].high_rs); if (i) assert.ok(rows[i].low_rs >= rows[i - 1].low_rs && rows[i].high_rs >= rows[i - 1].high_rs); }
  }
  const age = (d) => (Date.parse('2026-10-15') - Date.parse(d)) / 864e5;
  const pts = [...s.panel_rs_per_w.sources, ...s.systems.flatMap((r) => r.sources)].filter((p) => !p.excluded);
  for (const p of pts) assert.ok(age(p.price_date) <= 120, `${p.publisher} ${p.price_date}`);
});
