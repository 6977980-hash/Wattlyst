// Random differential test: engine vs independent reference (ref.mjs). Prints mismatches.
import { data, C } from './h.mjs';
import * as R from './ref.mjs';
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const apps = data.appliances;
const mism = {};
const add = (k, msg) => { (mism[k] = mism[k] || []).push(msg); };
let count = {};
const inc = (k) => { count[k] = (count[k] || 0) + 1; };

// data integrity vs IEC / policy
const t = data.cables;
for (const c of t.cables) for (const m of ['B1', 'C']) {
  if (c.ampacity_a[m] !== R.IEC[2][m][c.area_mm2]) add('data', `2-loaded ${m} ${c.area_mm2}: data ${c.ampacity_a[m]} IEC ${R.IEC[2][m][c.area_mm2]}`);
  if (c.ampacity_3ph_a[m] !== R.IEC[3][m][c.area_mm2]) add('data', `3-loaded ${m} ${c.area_mm2}: data ${c.ampacity_3ph_a[m]} IEC ${R.IEC[3][m][c.area_mm2]}`);
}
if (JSON.stringify(t.derating.ambient_factors) !== JSON.stringify(R.AMB)) add('data', 'ambient factors differ');
if (JSON.stringify(t.derating.grouping_factors) !== JSON.stringify(R.GRP)) add('data', 'grouping factors differ');
for (const p of t.pk_sizes) { const mine = R.PK.find((x) => x.name === p.name); if (Math.abs(mine.area - p.area_mm2) > 0.006) add('data', `pk ${p.name} data ${p.area_mm2} mine ${mine.area.toFixed(3)}`); const ratedMine = [...R.SIZES].reverse().find((s) => s <= mine.area); if (ratedMine !== p.rated_as_mm2) add('data', `pk ${p.name} rated_as ${p.rated_as_mm2} vs ${ratedMine}`); }
const D = data.defaults;
const chk = (k, v) => { if (JSON.stringify(D[k]) !== JSON.stringify(v)) add('data', `defaults.${k} = ${JSON.stringify(D[k])}, policy ${JSON.stringify(v)}`); };
chk('v_1ph', 230); chk('v_3ph', 400); chk('pf_mixed', 0.8); chk('pf_generator', 0.8); chk('margin', 1.25); chk('rho_copper', R.RHO_CU); chk('rho_aluminium', R.RHO_AL); chk('w_per_hp', 745.7); chk('standard_breaker_a', R.POLICY.breakers); chk('standard_generator_kva', R.POLICY.gen_kva);
const f = data.generator_fuel.fuels;
for (const ft of ['petrol', 'diesel']) { const r = R.fuel(5, 0, ft); if (Math.abs(r.slope - f[ft].slope_l_per_kwh) > 0.01 || Math.abs(r.icpt - f[ft].intercept_l_per_h_per_kw_rated) > 0.005) add('data', `fuel ${ft}: data ${f[ft].intercept_l_per_h_per_kw_rated}/${f[ft].slope_l_per_kwh} refit ${r.icpt.toFixed(4)}/${r.slope.toFixed(4)}`); }

// conversions
for (let k = 0; k < 3000; k++) {
  const mode = pick(['dc', 'ac1', 'ac3']);
  const i = { mode, volts: mode === 'dc' ? pick([12, 24, 48, 51.2, 420]) : pick([undefined, 220, 230, 120, 400, 415]), pf: mode === 'dc' ? undefined : pick([undefined, 0.6, 0.8, 0.95, 1]), watts: Math.round(rnd() * 20000), amps: Math.round(rnd() * 1000) / 10, kw: Math.round(rnd() * 500) / 10 };
  for (const [c, keys] of [['watts_to_amps', ['amps']], ['amps_to_watts', ['watts', 'va']], ['kw_to_amps', ['amps']]]) {
    const e = C[c](i, data); const r = R[c](i); inc(c);
    if (!e.ok) { add(c, `${JSON.stringify(i)} -> ${e.error}`); continue; }
    for (const key of keys) if (!close(e[key], r[key])) add(c, `${JSON.stringify(i)} ${key} ${e[key]} vs ${r[key]}`);
  }
  // round trip W -> A -> W
  const a = C.watts_to_amps(i, data); const back = C.amps_to_watts({ ...i, amps: a.amps }, data);
  if (!close(back.watts, i.watts)) add('roundtrip', `${JSON.stringify(i)} ${back.watts}`);
}
// battery
for (let k = 0; k < 3000; k++) {
  const chemistry = pick(['tubular', 'lead_acid', 'agm', 'gel', 'lifepo4']);
  const i = { chemistry, ah: pick([7, 100, 150, 200, 280]), volts: pick([12, 12.8, 24, 25.6, 48, 51.2]), load_w: 1 + Math.round(rnd() * 3000), inverter_eff: pick([undefined, 1, 0.85, 0.9]), dod: pick([undefined, undefined, 0.6, 0.8]) };
  const e = C.battery_runtime(i, data); const r = R.runtime(i); inc('battery_runtime');
  if (!e.ok || !close(e.hours, r.hours) || !close(e.usable_wh, r.usable_wh)) add('battery_runtime', `${JSON.stringify(i)} ${e.hours} vs ${r.hours}`);
  const bv = pick([12, 12.8, 24]);
  const j = { ...i, hours: pick([1, 2.5, 4, 8]), battery_ah: pick([100, 150, 200]), battery_v: bv };
  const eb = C.battery_bank(j, data); const rb = R.bank(j); inc('battery_bank');
  const whole = Math.abs(rb.series - Math.round(rb.series)) < 1e-9;
  if (!whole) { if (eb.ok || eb.error !== 'bank_voltage_not_multiple_of_battery') add('battery_bank', `${JSON.stringify(j)} expected multiple error got ${JSON.stringify(eb).slice(0, 80)}`); continue; }
  if (!eb.ok || !close(eb.ah_required, rb.ah_required) || eb.batteries !== Math.round(rb.batteries) || eb.strings !== rb.strings) add('battery_bank', `${JSON.stringify(j)} ${eb.batteries} vs ${rb.batteries}`);
}
// generators
const ids = Object.keys(apps);
for (let k = 0; k < 3000; k++) {
  const loads = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => (rnd() < 0.8 ? { id: pick(ids), qty: pick([1, 1, 2, 3]) } : { id: 'custom', watts: Math.round(rnd() * 3000), start: undefined, qty: 1 }));
  for (const l of loads) if (l.id === 'custom' && rnd() < 0.5) l.start = l.watts * pick([1, 2, 3]);
  const e = C.generator_size({ loads }, data); inc('generator_size');
  const s = R.sum(R.rows(loads, apps)); const g = R.gen(s.running_w, s.peak_w);
  if (!(s.running_w > 0)) { if (e.ok) add('generator_size', 'zero load ok'); continue; }
  if (!e.ok) { add('generator_size', `${JSON.stringify(loads)} ${e.error}`); continue; }
  if (!close(e.running_w, s.running_w) || !close(e.peak_w, s.peak_w) || !close(e.recommended_kva, g.recommended_kva) || e.standard_kva !== g.standard_kva) add('generator_size', `${JSON.stringify(loads)} ${e.standard_kva} vs ${g.standard_kva}`);
  const kva = pick([2.5, 3, 3.5, 5, 6.5, 7, 7.5, 10]);
  const app = pick(ids);
  const ec = C.generator_capacity({ kva, loads, appliance: app }, data); inc('generator_capacity');
  const cap = kva * 800;
  const fits = s.running_w * 1.25 <= cap + 1e-9 && s.peak_w <= cap + 1e-9;
  const cnt = R.capacityCount(kva, apps[app].running_w, apps[app].starting_w);
  if (!ec.ok || ec.fits !== fits || ec.appliance_count !== cnt) add('generator_capacity', `kva ${kva} ${app} fits ${ec.fits}/${fits} count ${ec.appliance_count}/${cnt}`);
}
for (const hp of [0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10]) for (const ow of [0, 4, 100, 500, 2000]) {
  const e = C.generator_for_pump({ hp, other_w: ow }, data); const r = R.pump(hp, ow); inc('generator_for_pump');
  if (!e.ok || !close(e.recommended_kva, r.recommended_kva) || e.standard_kva !== r.standard_kva) add('generator_for_pump', `${hp} ${ow} ${e.standard_kva} vs ${r.standard_kva}`);
}
for (const ac of ids.filter((x) => /^ac-|heat-pump/.test(x))) for (const ow of [0, 300, 500, 1500]) {
  const e = C.generator_for_ac({ ac, other_w: ow }, data); const a = apps[ac];
  const run = a.running_w + ow; const peak = run + (a.starting_w - a.running_w); const g = R.gen(run, peak); inc('generator_for_ac');
  if (!e.ok || !close(e.recommended_kva, g.recommended_kva) || e.standard_kva !== g.standard_kva) add('generator_for_ac', `${ac} ${ow} ${e.standard_kva} vs ${g.standard_kva}`);
  const e2 = C.generator_size({ loads: [{ id: ac }, ...(ow ? [{ id: 'custom', watts: ow }] : [])] }, data);
  if (e2.standard_kva !== e.standard_kva || !close(e2.recommended_kva, e.recommended_kva)) add('C1vsC6', `${ac} ${ow}: C1 ${e2.standard_kva} C6 ${e.standard_kva}`);
}
// fuel
for (let k = 0; k < 500; k++) {
  const kva = pick([2.5, 3.5, 5, 7.5, 10]); const ft = pick(['petrol', 'diesel']); const load_w = Math.round(rnd() * kva * 800);
  const e = C.generator_fuel({ kva, fuel: ft, load_w, hours: 4 }, data); const r = R.fuel(kva, load_w, ft); inc('generator_fuel');
  const lph = data.generator_fuel.fuels[ft].intercept_l_per_h_per_kw_rated * kva * 0.8 + data.generator_fuel.fuels[ft].slope_l_per_kwh * load_w / 1000;
  if (!e.ok || !close(e.l_per_h, lph)) add('generator_fuel', `${kva} ${ft} ${load_w} ${e.l_per_h} vs ${lph}`);
  if (Math.abs(e.l_per_h - r.l_per_h) / r.l_per_h > 0.03) add('fuel_fit', `${kva} ${ft} ${load_w}: engine ${e.l_per_h.toFixed(3)} refit ${r.l_per_h.toFixed(3)}`);
}
// wiring
const types = ['sockets', 'lighting', 'resistive', 'motor', 'compressor', 'inverter_compressor', 'electronic', 'high_inrush'];
const acIds = ids;
for (let k = 0; k < 20000; k++) {
  const mode = pick(['ac1', 'ac1', 'ac3', 'dc']);
  const i = { mode, volts: mode === 'dc' ? pick([12, 24, 48, 120, 420]) : pick([undefined, 220, 230, 400]), length_m: pick([1, 5, 10, 15, 20, 30, 50, 80, 120]), method: pick(['B1', 'C']), ambient_c: pick([undefined, 25, 30, 33, 40, 45, 46, 50, 60]), circuits: pick([undefined, 1, 2, 3, 6, 10, 20]), circuit: pick(['other', 'lighting']) };
  if (rnd() < 0.3 && mode !== 'dc') i.appliance = pick(acIds); else if (rnd() < 0.2) i.amps = Math.round(rnd() * 800) / 10; else i.watts = 10 + Math.round(rnd() * 15000);
  if (!i.appliance) i.load_type = pick(types);
  if (rnd() < 0.2 && mode !== 'dc') i.pf = pick([0.7, 0.9, 1]);
  const e = C.wire_size(i, data); const r = R.wire(i, apps); inc('wire_size');
  if (r.error) { if (e.ok || e.error !== r.error) add('wire_size', `${JSON.stringify(i)} expected ${r.error} got ${e.ok ? e.area_mm2 : e.error}`); }
  else if (!e.ok) add('wire_size', `${JSON.stringify(i)} expected ${r.area_mm2} got ${e.error}`);
  else if (e.area_mm2 !== r.area_mm2 || e.breaker_a !== r.breaker_a || !close(e.drop_pct, r.drop_pct) || e.pk_size !== r.pk_size) add('wire_size', `${JSON.stringify(i)} ${e.area_mm2}/${e.breaker_a}/${e.pk_size} vs ${r.area_mm2}/${r.breaker_a}/${r.pk_size}`);
  // invariants on valid results: Ib <= In <= Iz, drop within limit
  if (e.ok) {
    if (!(e.ib_a <= e.breaker_a + 1e-9 && e.breaker_a <= e.ampacity_a + 1e-9)) add('Ib<=In<=Iz', JSON.stringify(i));
    if (e.ampacity_a + 1e-9 < e.ib_a * 1.25) add('Iz>=1.25Ib', JSON.stringify(i));
    if (e.drop_pct > e.limit_pct + 1e-9) add('drop<=limit', JSON.stringify(i));
  }
  if (mode !== 'dc') {
    const j = { ...i }; delete j.circuit; delete j.length_m;
    const em = C.breaker_size(j, data); const rm = R.mcb(j, apps); inc('breaker_size');
    if (rm.error) { if (em.ok || em.error !== rm.error) add('breaker_size', `${JSON.stringify(j)} expected ${rm.error} got ${em.ok ? em.breaker_a : em.error}`); }
    else if (!em.ok || em.breaker_a !== rm.breaker_a || em.area_mm2 !== rm.area_mm2 || em.curve !== rm.curve) add('breaker_size', `${JSON.stringify(j)} ${em.breaker_a}/${em.area_mm2}/${em.curve} vs ${rm.breaker_a}/${rm.area_mm2}/${rm.curve}`);
    if (e.ok && em.ok && e.breaker_a !== em.breaker_a) add('W2vsW3', JSON.stringify(i));
  }
}
for (let k = 0; k < 5000; k++) {
  const mode = pick(['ac1', 'ac3', 'dc']);
  const i = { mode, volts: mode === 'dc' ? pick([12, 48, 420]) : pick([undefined, 230, 400]), length_m: pick([1, 10, 30, 100]), area_mm2: pick([0.75, 1, 1.28, 1.5, 2.5, 2.98, 4, 6, 9.59, 10, 16, 25, 35, 50]), conductor: pick(['copper', 'copper', 'aluminium']), ambient_c: pick([undefined, 30, 45]), circuits: pick([undefined, 1, 3]) };
  if (rnd() < 0.5) i.amps = Math.round(rnd() * 1200) / 10; else i.watts = 10 + Math.round(rnd() * 20000);
  const e = C.voltage_drop(i, data); const r = R.vdrop(i); inc('voltage_drop');
  const volts = i.volts ?? (mode === 'ac3' ? 400 : 230);
  if (r.drop_v >= volts) { if (e.ok || e.error !== 'cable_far_too_small_for_load') add('voltage_drop', `${JSON.stringify(i)} expected far_too_small got ${JSON.stringify(e).slice(0, 60)}`); continue; }
  if (!e.ok || !close(e.drop_v, r.drop_v) || (i.conductor !== 'aluminium' && e.over_cable_rating !== r.over_cable_rating)) add('voltage_drop', `${JSON.stringify(i)} ${e.drop_v}/${e.over_cable_rating} vs ${r.drop_v}/${r.over_cable_rating}`);
}
// N18 vs W2 per row
for (let k = 0; k < 3000; k++) {
  const id = pick(['custom', ...ids]); const row = { id, length: pick([3, 10, 20, 40, 80]), qty: pick([1, 1, 2, 4]) };
  if (id === 'custom' || rnd() < 0.3) row.watts = 20 + Math.round(rnd() * 4000);
  const shared = { method: pick(['B1', 'C']), ambient_c: pick([30, 45, 50]), circuits: pick([1, 3]) };
  const e = C.circuit_schedule({ loads: [row], ...shared }, data); inc('circuit_schedule');
  const a = id === 'custom' ? null : apps[id];
  const lt = a?.load_type ?? 'sockets'; const watts = row.watts ?? a.running_w;
  const dw = lt === 'inverter_compressor' ? (a.starting_w * watts * row.qty) / a.running_w : watts * row.qty;
  const r = R.wire({ watts: dw, load_type: lt, circuit: lt === 'lighting' ? 'lighting' : 'other', length_m: row.length, ...shared }, apps);
  if (r.error) { if (e.ok) add('circuit_schedule', `${JSON.stringify(row)} expected ${r.error}`); continue; }
  if (!e.ok) { add('circuit_schedule', `${JSON.stringify(row)} ${e.error} vs ${r.area_mm2}`); continue; }
  const x = e.rows[0];
  if (x.area_mm2 !== r.area_mm2 || x.breaker_a !== r.breaker_a || x.curve !== R.POLICY.curve[lt]) add('circuit_schedule', `${JSON.stringify(row)} ${x.area_mm2}/${x.breaker_a} vs ${r.area_mm2}/${r.breaker_a}`);
  // same appliance on W1 (wire_size with appliance) when qty 1 and no watts override
  if (a && row.qty === 1 && row.watts === undefined) {
    const w1 = C.wire_size({ appliance: id, length_m: row.length, circuit: lt === 'lighting' ? 'lighting' : 'other', ...shared }, data);
    if (w1.ok && (w1.area_mm2 !== x.area_mm2 || w1.breaker_a !== x.breaker_a)) add('N18vsW1', `${id} ${row.length}: W1 ${w1.area_mm2}/${w1.breaker_a} N18 ${x.area_mm2}/${x.breaker_a}`);
  }
}
// sanctioned load
for (let k = 0; k < 2000; k++) {
  const ckw = Math.round(rnd() * 3000) / 100 + 0.01; const div = pick([undefined, 0.5, 0.6, 0.8, 1]);
  const e = C.sanctioned_load({ connected_kw: ckw, diversity: div }, data); inc('sanctioned_load');
  const dem = ckw * (div ?? 0.6); const rec = Math.max(1, Math.ceil(dem - 1e-9));
  if (!e.ok || e.recommended_kw !== rec || e.tou_warning !== rec >= 5) add('sanctioned_load', `${ckw} ${div} ${e.recommended_kw} vs ${rec}`);
}
// series/parallel
for (let s = 1; s <= 16; s++) for (const p of [1, 2, 3, 5]) for (const v of [2, 3.2, 12, 12.8]) {
  const e = C.series_parallel({ n_series: s, n_parallel: p, v, ah: 100 }, data); inc('series_parallel');
  if (!e.ok || !close(e.kwh, (s * v * p * 100) / 1000) || e.batteries !== s * p) add('series_parallel', `${s} ${p} ${v}`);
}
console.log(JSON.stringify(count));
for (const [k, v] of Object.entries(mism)) { console.log(`MISMATCH ${k}: ${v.length}`); for (const m of v.slice(0, 8)) console.log('   ', m); }
if (!Object.keys(mism).length) console.log('NO MISMATCHES');
