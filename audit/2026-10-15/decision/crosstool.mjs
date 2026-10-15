// Cross-tool pairs with matched inputs (engine calls; this checks consistency between tools, not the maths).
import { data, E } from './lib.mjs';
const { calculators: C } = await E('index');
const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const h = C.home_decision(structuredClone(H), data);
const out = {};
const r2 = (x) => Math.round(x * 100) / 100;

// 1. Solar kW: H1 vs D2/D7 (solar_size monthly units) vs N17 (twelve equal months) vs D8 (solar_from_loads)
const d2 = C.solar_size({ monthly_units: h.monthly_units, city: 'lahore', panel_w: 585 }, data);
const n17 = C.solar_seasonal({ city: 'lahore', ...Object.fromEntries(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map((k) => [k, h.monthly_units])), panel_w: 585, buyback_rs: 8.13, day_share: 0.5 }, data);
const d8 = C.solar_from_loads({ loads: DEF, city: 'lahore', panel_w: 585, margin: 1.25 }, data);
out.solar = { H1_kw: h.solar_kw, H1_installed: h.installed_kw, D2_kw: d2.kw, D2_installed: d2.installed_kw, N17_kw_year: n17.kw_annual, N17_installed: n17.installed_kw, N17_pvout_year: n17.pvout_year, yield_x365: data.cities.lahore.yield * 365, D8_installed: d8.installed_kw };
// power-limited home: big running load, few hours
const PL = [{ id: 'ac-split-1-5ton-inverter', qty: 3, hours: 2 }, { id: 'led-bulb', qty: 5 }];
const hp = C.home_decision({ ...H, loads: PL }, data);
const d2p = C.solar_size({ monthly_units: hp.monthly_units, city: 'lahore', panel_w: 585 }, data);
out.solar_power_limited = { H1_units: hp.monthly_units, H1_installed: hp.installed_kw, H1_limited_by: hp.solar_limited_by, D2_installed: d2p.installed_kw };

// 2. Battery: H1 vs D1 vs B4 (lithium, 500 W 4 h, 24 V)
const d1 = C.solar_battery({ night_kwh: 2, days: 1, volts: 24, dod: 0.9, inverter_eff: 0.9 }, data);
const b4 = C.battery_bank({ load_w: 500, hours: 4, volts: 24, chemistry: 'lifepo4' }, data);
const b4t = C.battery_bank({ load_w: 500, hours: 4, volts: 24, chemistry: 'tubular' }, data);
const ht = C.home_plan({ ...H, chemistry: 'tubular' }, data);
const n7b = C.backup_compare({ load_w: 500, hours: 4, years: 10, tariff: h.rate_before, city: 'lahore' }, data);
out.battery = { H1_ah: h.battery_ah, H1_kwh: h.battery_kwh, D1_ah: d1.ah, B4_lifepo4_ah: b4.ah_required, B4_eff: b4.inverter_eff, H1_tubular_ah: ht.battery_ah, B4_tubular_ah: b4t.ah_required, N7_ups_bank_wh: n7b.bank_wh, H1_tub_wh: ht.battery_kwh * 1000, H1_hybrid_pack_kwh: 5.12 };

// 3. Inverter: H1 vs D4 for the same list
const d4 = C.inverter_size({ loads: DEF, margin: 1.25, pf: 0.8 }, data);
out.inverter = { H1_kw: h.inverter_kw, D4_kw: d4.continuous_w / 1000, D4_kva: d4.kva, H1_kva: h.inverter_kva };

// 4. Bill: H1 full_before vs F1 (page defaults: period QTA) for the same units and sanctioned load
const f1 = C.bill_total({ units: h.monthly_units, sanctioned_kw: 4, protected: false, period: '2026-09..2026-11', fc_surcharge_per_unit: 3.23, gst_pct: 18 }, data);
const f1np = C.bill_total({ units: h.monthly_units, sanctioned_kw: 4, protected: false }, data);
out.bill = { H1_full_before: h.full_before_rs, F1_page_defaults: f1.total_rs, F1_no_period: f1np.total_rs, diff: f1.total_rs - h.full_before_rs };

// 5. N16 AC bill vs H1: the AC's share of H1's bill (with vs without the AC row)
const noac = C.home_plan({ ...H, loads: DEF.filter((x) => !x.id.startsWith('ac-')) }, data);
const n16 = C.ac_bill_impact({ ac: 'ac-split-1-5ton-inverter', hours: 7, days: 30, other_units: noac.monthly_units, sanctioned_kw: 4, protected: false }, data);
out.ac = { H1_units_with: h.monthly_units, H1_units_without: noac.monthly_units, H1_bill_delta: h.full_before_rs - noac.full_before_rs, N16_extra: n16.extra_rs, N16_ac_units: n16.ac_units };

// 6. N7 vs H1 standby (same load/hours/years/tariff)
out.n7 = { N7_cheapest: n7b.cheapest, N7_ups_total: n7b.ups_total, N7_gen_total: n7b.gen_total, N7_solar_total: n7b.solar_total, N7_ups_run_month: n7b.ups_run_year / 12, H1_standby: h.standby_option, H1_standby_run_month: h.standby_running_rs, H1_decision: h.decision };
const n7def = C.backup_compare({ load_w: 600, hours: 4, years: 5, tariff: 36.46 }, data);
const h7 = C.home_decision({ ...H, backup_w: 600, backup_hours: 4, years: 5 }, data);
out.n7_defaults_vs_h1 = { N7_cheapest: n7def.cheapest, N7_totals: [n7def.ups_total, n7def.gen_total, n7def.solar_total].map(Math.round), H1_decision: h7.decision, H1_nets: h7.setups.map((s) => s.net) };

// 7. D14 hybrid system price vs H1 hybrid price at the same kW
const d14 = C.solar_price_estimate({ kwp: h.installed_kw, type: 'hybrid' }, data);
const d14o = C.solar_price_estimate({ kwp: h.installed_kw, type: 'on-grid' }, data);
out.price = { H1_ongrid: [h.ongrid_low_rs, h.ongrid_high_rs], D14_ongrid: [d14o.price_low_rs, d14o.price_high_rs], H1_hybrid: [h.hybrid_low_rs, h.hybrid_high_rs], D14_hybrid: [d14.price_low_rs, d14.price_high_rs] };

// 8. Generator: H1 whole-list vs C1, and H1 standby generator vs C1 for a backup load with a motor
const c1 = C.generator_size({ loads: DEF, margin: 1.25, pf: 0.8 }, data);
out.gen = { H1_whole_list_kva: h.generator_pick_kva, C1_kva: c1.standard_kva, H1_standby: h.standby_option };
const mot = C.generator_size({ loads: [{ id: 'water-motor-1hp', qty: 1 }, { id: 'ceiling-fan-ac', qty: 2 }], margin: 1.25, pf: 0.8 }, data);
const n7m = C.backup_compare({ load_w: mot.running_w, hours: 2, years: 5, tariff: 36.46 }, data);
out.gen_motor = { running_w: mot.running_w, peak_w: mot.peak_w, C1_kva: mot.standard_kva, C1_recommended_kva: mot.recommended_kva, N7_gen_kva: n7m.gen_kva, N7_gen_rated_w: n7m.gen_rated_kw * 1000 };

// 9. UPS sizing: N7's UPS for 500 W vs B5 ups_capacity PF
out.ups = { N7_ups_kva: n7b.ups_kva, N7_rated_w: n7b.ups_rated_w, B5_pf: data.defaults.pf_ups_line_interactive, B5_max_w_1kva: 1000 * data.defaults.pf_ups_line_interactive };
const b5 = C.ups_backup({ va: 1000, ah: 200, volts: 12, chemistry: 'tubular', load_w: 625, pf: 0.6, inverter_eff: 0.85 }, data);
out.ups.B5_1kva_runs_625W = b5.ok ? 'yes' : b5.error;

for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v, (kk, x) => (typeof x === 'number' ? r2(x) : x)));
export default out;
