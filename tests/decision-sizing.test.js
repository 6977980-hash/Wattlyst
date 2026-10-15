// Full audit 15 Oct 2026, fix Phase 2a (decision engine sizing and pricing, P0): the regression tests DE-01, DE-02
// (audit decision tests) and MD-01 (audit solar tests), plus the WL-100 premium wording and component price order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, readJson } from './load-data.js';
import { calculators as C } from '../engine/index.js';
import { home_decision } from '../engine/decision.js';
import { priceRange, inverterAt } from '../engine/prices.js';
import { fmt } from '../engine/format.js';

const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const BIG = [{ id: 'ceiling-fan-ac', qty: 8 }, { id: 'led-bulb', qty: 20 }, { id: 'ac-split-1-5ton-inverter', qty: 3, hours: 8 }, { id: 'refrigerator-inverter', qty: 2 }, { id: 'led-tv-43', qty: 2 }];
const POWER_LIMITED = [{ id: 'ac-split-1-5ton-inverter', qty: 3, hours: 2 }, { id: 'led-bulb', qty: 5 }];

/** A page's default inputs, resolved the way the build does (`@` defaults, fixed inputs). */
function pageInputs(id) {
  const c = readJson(`content/pages/${id}.json`);
  const look = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const lp = readJson('data/load-profiles.json').profiles;
  const inp = {};
  for (const f of c.fields) {
    let v = f.default;
    if (typeof v === 'string' && v.startsWith('@')) {
      const p = v.slice(1);
      v = p.startsWith('data.load_profiles.') ? look(lp, p.slice(19)) : p.startsWith('data.') ? look(data, p.slice(5)) : data.defaults[p];
    }
    if (v !== undefined) inp[f.name] = v;
  }
  return { ...inp, ...(c.fixed_inputs || {}) };
}

test('DEFECT DE-01 (WL-91): an array above the sanctioned load is priced and named at the array net billing accepts', () => {
  const e = home_decision({ ...H, loads: BIG }, data);
  assert.ok(e.solar_above_sanctioned && e.installed_kw > e.net_billing_kw, 'precondition: the list needs more than net billing allows');
  assert.ok(!e.decision.includes(`${fmt(e.installed_kw, '2')} kW`), `decision names ${e.decision}`);
  const r = priceRange(data, 'on-grid', e.net_billing_kw);
  assert.ok(Math.abs(e.ongrid_rs - ((r.lo + r.hi) / 2) * e.net_billing_kw * 1000) < 0.5, `on-grid priced at ${e.ongrid_rs} for a ${e.net_billing_kw} kW billed array`);
  assert.ok(e.decision_text.startsWith(`On-grid solar ${fmt(e.net_billing_kw, '2')} kW`), e.decision_text);
  // Below one panel of sanctioned load no solar setup is offered.
  const tiny = home_decision({ ...H, sanctioned_kw: 0.5 }, data);
  for (const k of ['ongrid', 'hybrid', 'combo']) assert.equal(tiny[`${k}_available`], false, k);
  assert.equal(tiny.combo_running_rs, 0, 'a setup not offered has no running cost');
  assert.ok(!['ongrid', 'hybrid', 'combo'].includes(tiny.decision_key), tiny.decision);
  const tiny0 = home_decision({ ...H, sanctioned_kw: 0.5, backup_hours: 0 }, data);
  assert.equal(tiny0.decision_key, 'grid');
});

test('DEFECT DE-02 (WL-92): the net-billed setups are sized by energy, as D7 for the same units', () => {
  const e = home_decision({ ...H, loads: POWER_LIMITED, backup_hours: 0 }, data);
  const d7 = C.solar_size({ monthly_units: e.monthly_units, city: 'lahore', panel_w: 585 }, data);
  assert.equal(e.installed_kw, d7.installed_kw, `H1 ${e.installed_kw} kW (${e.solar_limited_by}) vs D7 ${d7.installed_kw} kW for ${Math.round(e.monthly_units)} units`);
});

test('DEFECT MD-01 (WL-92): grid-tied house and building lists (D8, D12, D13, N13) are sized like D7 for the same daily units', () => {
  for (const id of ['D8', 'D12', 'D13', 'N13']) {
    const inputs = pageInputs(id);
    const r = C.solar_from_loads(inputs, data);
    const d7 = C.solar_size({ daily_kwh: r.daily_kwh, city: inputs.city }, data);
    assert.ok(r.ok && d7.ok, id);
    assert.equal(r.panels, d7.panels, `${id} ${r.panels} panels vs D7 ${d7.panels} for ${r.daily_kwh} kWh/day`);
  }
});

test('WL-92: the midday power rule stays for off-grid lists (D3), an AC on sun (D5) and a solar pump (D15)', () => {
  const d3 = C.solar_from_loads(pageInputs('D3'), data);
  assert.equal(d3.kw, Math.max(d3.kw_energy, d3.kw_power));
  const d5 = C.solar_for_ac({ ac: 'ac-split-1-5ton-inverter', hours: 2, city: 'lahore' }, data);
  assert.equal(d5.limited_by, 'power');
  const d15 = C.solar_for_pump({ hp: 10, hours: 2, city: 'multan' }, data);
  assert.equal(d15.limited_by, 'power');
  const grid = C.solar_from_loads({ loads: POWER_LIMITED, city: 'lahore' }, data);
  assert.equal(grid.limited_by, 'energy');
  assert.ok(grid.kw_power > grid.kw_energy, 'the power term is still shown');
});

test('WL-100: a hybrid inverter premium the price lists cannot tell is "not known", never "Rs 0 extra"', () => {
  for (const kw of [1, 2, 3, 4, 6, 9]) {
    for (const loads of [DEF, BIG]) {
      const e = home_decision({ ...H, loads, backup_w: kw * 600 }, data);
      if (!e.hybrid_available) continue;
      assert.ok(!/Rs\s?0 extra/.test(e.decision_text), e.decision_text);
      assert.equal(/extra cost not known \(none added\)/.test(e.decision_text), !(e.hybrid_premium_rs > 0), e.decision_text);
    }
  }
});

test('WL-100: inverter middle prices in component-prices.json never fall as the size rises (rows and between them)', () => {
  const items = data.component_prices.items;
  for (const cat of ['ongrid_inverter', 'hybrid_inverter']) {
    const rows = items.filter((x) => x.category === cat && x.export_capable !== false).map((x) => ({ kw: parseFloat(x.size), mid: (x.low + x.high) / 2, low: x.low })).sort((a, b) => a.kw - b.kw);
    for (let n = 1; n < rows.length; n++) {
      for (const k of ['mid', 'low']) assert.ok(rows[n][k] >= rows[n - 1][k], `${cat} ${rows[n].kw} kW ${k} below ${rows[n - 1].kw} kW`);
    }
    let prev = 0;
    for (let kw = 0.5; kw <= 15.0001; kw += 0.25) {
      const [v] = inverterAt(items, cat, kw);
      assert.ok(v >= prev - 1e-6, `${cat} ${kw} kW ${v} < ${prev}`);
      prev = v;
    }
  }
});
