// 21 Oct 2026 audit fix Phase 4 (solar, battery and wiring engine): WL-169 to WL-182, WL-230 to WL-232.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculators as C } from '../engine/index.js';
import { EXACT } from '../engine/message-text.js';
import { data, readJson } from './load-data.js';

const page = (id) => readJson(`generated/pages/${id}.json`).content.tool;
// A page's default result: the field defaults (as built) + its fixed inputs.
function atDefault(id, over = {}) {
  const t = page(id);
  const ins = { ...(t.fixed_inputs || {}) };
  for (const f of t.fields) if (f.default !== undefined && f.default !== null && f.default !== '') ins[f.name] = f.default;
  return C[t.calc]({ ...ins, ...over }, data);
}

test('WL-171: N13, D8, D12, D13 at their defaults size an on-grid inverter from the panels alone', () => {
  const ratio = data.defaults.dc_ac_ratio_max;
  for (const id of ['N13', 'D8', 'D12', 'D13']) {
    const r = atDefault(id);
    assert.equal(r.ok, true, id);
    assert.equal(r.grid_tied, true, id);
    assert.ok(Math.abs(r.inverter_w - (r.installed_kw * 1000) / ratio) < 1e-6, `${id}: ${r.inverter_w} W`);
    assert.equal(r.inverter_surge_w, undefined, `${id} prints no surge rating for an on-grid inverter`);
  }
});

test('WL-169: with backup hours the battery the engine sizes is a result card on D5, D8, D12, D13, N13', () => {
  for (const id of ['D5', 'D8', 'D12', 'D13', 'N13']) {
    const keys = page(id).outputs.map((o) => o.key);
    assert.ok(keys.includes('battery_ah') && keys.includes('battery_kwh'), id);
    const r = atDefault(id, { night_hours: 2 });
    assert.ok(r.battery_ah > 0 && r.grid_tied === false, id);
  }
});

test('WL-174: every inverter and drive to buy is a listed size, never below the minimum', () => {
  const inv = data.defaults.standard_inverter_kw;
  for (const id of ['N13', 'D8', 'D12', 'D13', 'D5', 'D3']) {
    const r = atDefault(id);
    assert.ok(inv.includes(r.inverter_pick_kw) && r.inverter_pick_kw * 1000 >= r.inverter_w - 1e-6, id);
  }
  const p = atDefault('D15');
  assert.ok(data.defaults.standard_vfd_kw.includes(p.drive_pick_kw) && p.drive_pick_kw >= p.drive_kw - 1e-9);
});

test('WL-230: the homepage hybrid and the N7 hybrid have enough panels in series to start', () => {
  const h = atDefault('H1');
  assert.equal(h.hybrid_available, true);
  const n7 = atDefault('N7');
  assert.ok(n7.panels >= n7.string_min && n7.string_min > 1);
});

test('WL-172: the pump string reaches the drive DC bus when hot, unless the drive maximum DC input caps it (flagged)', () => {
  for (const motor_v of [220, 400]) {
    const r = atDefault('D15', { motor_v });
    const bus = data.defaults.pump_dc_bus_factor * r.motor_v;
    assert.ok(r.string_voc_cold_v <= r.drive_max_dc_v, `${motor_v} V: cold Voc ${r.string_voc_cold_v} under the drive input`);
    assert.ok(r.string_vmp_hot_v >= bus - 1e-9 || r.string_below_bus === true, `${motor_v} V`);
    assert.ok(r.string_vmp_hot_v - r.panel_vmp_hot_v < bus);
  }
});

test('WL-170: a 5 kW inverter on a 48 V battery gets a cable; a feed above the table gets the DC message', () => {
  const r = atDefault('W2', { mode: 'dc', volts: 48, watts: 5000, length_m: 2 });
  assert.equal(r.ok, true);
  assert.ok(r.area_mm2 > 35);
  const big = C.wire_size({ mode: 'dc', volts: 12, watts: 3000, length_m: 2 }, data);
  assert.equal(big.error, 'dc_load_above_cable_table');
  assert.doesNotMatch(EXACT.dc_load_above_cable_table, /separate circuits\./);
});

test('WL-180: n/d sizes are rated at or below their real area, and the misleading shop names are printed', () => {
  for (const p of data.cables.pk_sizes) assert.ok(p.rated_as_mm2 <= p.area_mm2, p.name);
  assert.equal(C.cable_rating({ area_mm2: 10 }, data).pk_size, '7/64, sold as 16 mm²');
  const pv = atDefault('W4');
  assert.equal(pv.cable, 'pv');
  assert.ok(pv.ampacity_a > 0 && pv.ambient_c === data.cables.pv_cables.default_ambient_c);
});

test('WL-177: DC current is worked out at the low-battery cut-off on W2 and the battery pages', () => {
  const r = C.wire_size({ mode: 'dc', volts: 48, watts: 2400, length_m: 2 }, data);
  assert.ok(Math.abs(r.ib_a - 2400 / (48 * data.defaults.dc_cutoff_ratio * data.defaults.inverter_eff_hybrid)) < 1e-9);
  for (const id of ['B1', 'B2', 'B3', 'B5']) {
    const b = atDefault(id);
    assert.ok(b.cutoff_a > b.battery_a && b.high_c_rate === false, id);
  }
});

test('WL-178: the 1 hp water motor has one running and one starting figure (the C5 rule)', () => {
  const a = data.appliances['water-motor-1hp'];
  const c5 = C.generator_for_pump({ hp: 1 }, data);
  assert.equal(c5.ok, true);
  assert.equal(a.running_w, Math.round(c5.pump_run_w));
  assert.equal(a.starting_w, Math.round(c5.pump_start_w));
});

test('WL-231: E2 uses the appliance power factor unless one is entered', () => {
  const r = atDefault('E2', { loads: [{ id: 'electric-iron' }] });
  assert.ok(Math.abs(r.amps - 1000 / data.defaults.v_1ph) < 1e-9);
});

test('WL-232: roof area per panel follows the panel size', () => {
  const small = C.solar_size({ daily_kwh: 10, yield_kwh_per_kwp_day: 5, panel_w: 330 }, data);
  const big = C.solar_size({ daily_kwh: 10, yield_kwh_per_kwp_day: 5, panel_w: 585 }, data);
  assert.ok(small.panel_area_m2 < big.panel_area_m2);
});
