// Audit tests for the H1 Home Power Decision Engine and N7 (read-only audit, 15 Oct 2026).
// Run: node --test /tmp/claude-0/-home-user-wattlyst/10a88ae1-cea1-556c-b13a-8987bcd472f7/scratchpad/decision/decision.test.mjs
// Tests named "OK ..." describe correct behaviour and pass today. Tests named "DEFECT DE-xx ..." encode the
// expected behaviour for a confirmed defect and FAIL today (they are the regression tests for the fix).
import test from 'node:test';
import assert from 'node:assert/strict';
import { data, manifest, gen, E } from './lib.mjs';
import { decide, bill } from './indep.mjs';
import { SCEN } from './scenarios.mjs';

const { home_decision } = await E('decision');
const { backup_compare } = await E('backup');
const { calculators: C } = await E('index');
const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const BIG = [{ id: 'ceiling-fan-ac', qty: 8 }, { id: 'led-bulb', qty: 20 }, { id: 'ac-split-1-5ton-inverter', qty: 3, hours: 8 }, { id: 'refrigerator-inverter', qty: 2 }, { id: 'led-tv-43', qty: 2 }];
const POWER_LIMITED = [{ id: 'ac-split-1-5ton-inverter', qty: 3, hours: 2 }, { id: 'led-bulb', qty: 5 }];

// ---------- correct behaviour (pass) ----------
test('OK engine = independent re-implementation on 34 scenarios (prices, replacements, pick, budget flag)', () => {
  for (const [name, ov] of SCEN) {
    const inp = { ...H, ...ov };
    const e = home_decision(structuredClone(inp), data);
    const x = decide(inp, data);
    assert.ok(e.ok, name);
    for (const k of ['ongrid', 'hybrid', 'standby', 'combo']) {
      if (!x.S[k]) { assert.equal(e[`${k}_available`], false, `${name} ${k}`); continue; }
      assert.ok(Math.abs(e[`${k}_rs`] - x.S[k].buy) < 0.5, `${name} ${k} buy`);
      assert.ok(Math.abs(e[`${k}_repl_rs`] - x.S[k].repl) < 0.5, `${name} ${k} repl`);
    }
    const ek = ['ups', 'gen'].includes(e.decision_key) ? 'standby' : e.decision_key;
    assert.equal(ek, x.pick, `${name} pick`);
    assert.equal(Boolean(e.over_budget), x.over, `${name} over`);
  }
});

test('OK result table rows and decision_text carry the same setups and the recommended mark', () => {
  for (const [name, ov] of SCEN) {
    const e = home_decision({ ...H, ...ov }, data);
    const marked = e.setups.filter((s) => s.option.endsWith('(recommended)'));
    if (e.over_budget) assert.ok(e.decision_text.includes('over it'), name);
    assert.ok(marked.length <= 1, name);
    if (['ongrid', 'hybrid', 'combo', 'ups', 'gen'].includes(e.decision_key)) {
      assert.equal(marked.length, 1, name);
      assert.ok(e.decision_text.includes(e.decision.replace(/ \(over your budget.*$/, '')), name);
    }
  }
});

test('OK budget threshold: middle price = budget fits, budget − 1 is over by Rs 1', () => {
  const at = home_decision({ ...H, budget_rs: 157369 }, data);
  const below = home_decision({ ...H, budget_rs: 157368 }, data);
  assert.equal(at.over_budget, false);
  assert.equal(below.over_budget, true);
  assert.equal(below.budget_gap_rs, 1);
});

test('OK browser copy of the data gives the same H1 and N7 results as data/ over many inputs (not only defaults)', () => {
  const ship = (id) => { const t = gen(id).content.tool; return { defaults: manifest.data.defaults, ...Object.fromEntries(t.data_keys.map((k) => [k, manifest.data[k]])), ...(t.appliances ? { appliances: t.appliances } : {}) }; };
  const h1 = ship('H1'), n7 = ship('N7');
  for (const [, ov] of SCEN) assert.deepEqual(home_decision({ ...H, ...ov }, h1), home_decision({ ...H, ...ov }, data));
  for (const load_w of [100, 600, 1500, 5000]) for (const hours of [1, 4, 12, 24]) for (const years of [1, 5, 30]) {
    const i = { load_w, hours, years, tariff: 36.46, city: 'karachi' };
    assert.deepEqual(backup_compare(i, n7), backup_compare(i, data));
  }
});

test('OK cross-tool: H1 = D2/D7 solar size for an energy-limited home; H1 battery = D1; AC bill delta H1 = N16', () => {
  const h = home_decision(H, data);
  assert.equal(C.solar_size({ monthly_units: h.monthly_units, city: 'lahore', panel_w: 585 }, data).installed_kw, h.installed_kw);
  assert.ok(Math.abs(C.solar_battery({ night_kwh: 2, volts: 24, dod: 0.9, inverter_eff: 0.9 }, data).ah - h.battery_ah) < 1e-9);
  const noac = C.home_plan({ ...H, loads: DEF.filter((r) => !r.id.startsWith('ac-')) }, data);
  const n16 = C.ac_bill_impact({ ac: 'ac-split-1-5ton-inverter', hours: 7, days: 30, other_units: noac.monthly_units, sanctioned_kw: 4, protected: false }, data);
  assert.ok(Math.abs(n16.extra_rs - (h.full_before_rs - noac.full_before_rs)) < 1e-6);
});

test('OK guard: N7 key fact "generator dearest within the first year, cheapest to buy" holds at the current data (fails below about Rs 363/L petrol)', () => {
  const n = backup_compare({ load_w: 600, hours: 4, years: 5, tariff: 36.46 }, data);
  assert.ok(n.gen_buy < n.ups_buy && n.gen_buy < n.solar_buy);
  assert.ok(n.gen_buy + n.gen_run_year > Math.max(n.ups_buy + n.ups_run_year, n.solar_buy));
});

// ---------- confirmed defects (fail today) ----------
test('DEFECT DE-01 an on-grid/hybrid array above the sanctioned load is not priced and recommended in full', () => {
  const e = home_decision({ ...H, loads: BIG }, data); // 9.36 kW array, 4 kW sanctioned, 3.51 kW billed
  // expected: the setups price (and name) only the array net billing allows, or the decision says it cannot be net-billed
  assert.ok(!/9\.36 kW/.test(e.decision), `decision names ${e.decision}`);
  assert.ok(e.ongrid_rs <= 482875 + 1, `on-grid priced at ${e.ongrid_rs} for a ${e.net_billing_kw} kW billed array`);
});

test('DEFECT DE-02 the net-billed setups are not sized by the off-grid midday-power rule (H1 vs D7 for the same units)', () => {
  const e = home_decision({ ...H, loads: POWER_LIMITED, backup_hours: 0 }, data);
  const d7 = C.solar_size({ monthly_units: e.monthly_units, city: 'lahore', panel_w: 585 }, data);
  assert.equal(e.installed_kw, d7.installed_kw, `H1 ${e.installed_kw} kW (${e.solar_limited_by}) vs D7 ${d7.installed_kw} kW for ${Math.round(e.monthly_units)} units`);
});

test('DEFECT DE-03 with 24 h of cuts a day the solar setups cannot earn a net-billing saving (no grid to export to)', () => {
  const e = home_decision({ ...H, backup_hours: 24 }, data);
  const ups = backup_compare({ load_w: 500, hours: 24, years: 10, tariff: 36.46 }, data);
  assert.equal(ups.refill_hours, 0); // the engine itself says the grid is never on
  const combo = e.setups[3];
  assert.equal(combo.saving_month, 0, `combo still saves ${combo.saving_month} a month exporting ${e.export_units} units`);
});

test('DEFECT DE-04 a close call is stated as one (runner-up within the shown price uncertainty)', () => {
  const e = home_decision({ ...H, backup_w: 255, backup_hours: 4, years: 5 }, data); // combo vs hybrid nets Rs 1,959 apart
  assert.ok(/close|similar|within the price range|either/i.test(e.decision_text), e.decision_text.split('. ').pop());
});

test('DEFECT DE-05 the generator is not charged twice for the backup units (petrol + the same units on the bill)', () => {
  const inp = { ...H, backup_hours: 12 };
  const e = home_decision(inp, data);
  assert.ok(e.standby_option.startsWith('Petrol generator'));
  const n = backup_compare({ load_w: 500, hours: 12, years: 10, tariff: e.rate_before, city: 'lahore' }, data);
  const credit = e.full_before_rs - bill(e.monthly_units - 0.5 * 12 * 30, 4).total; // 180 units the grid no longer supplies
  assert.ok(Math.abs(e.standby_running_rs - (n.gen_run_year / 12 - credit)) < 1, `running ${e.standby_running_rs} vs ${n.gen_run_year / 12 - credit}`);
});

test('DEFECT DE-06 the N7/H1 generator can start the backup load (C1 rule: max(run × margin, peak) ÷ PF)', () => {
  const loads = [{ id: 'water-motor-1hp', qty: 1 }, { id: 'ceiling-fan-ac', qty: 2 }];
  const c1 = C.generator_size({ loads, margin: 1.25, pf: 0.8 }, data);
  const n = backup_compare({ load_w: c1.running_w, surge_w: c1.peak_w, hours: 3, years: 5, tariff: 36.46 }, data);
  assert.ok(n.gen_rated_kw * 1000 >= c1.peak_w, `N7 ${n.gen_kva} kVA (${n.gen_rated_kw * 1000} W) for a ${c1.peak_w} W start; C1 says ${c1.standard_kva} kVA`);
});

test('DEFECT DE-07 a "UPS 1 kVA" N7/H1 picks for 700 W is not rejected by B5 for a 1 kVA UPS', () => {
  const n = backup_compare({ load_w: 700, hours: 2, years: 5, tariff: 36.46 }, data);
  assert.equal(n.ups_kva, 1);
  const b5 = C.ups_backup({ va: n.ups_kva * 1000, ah: 200, volts: 12, chemistry: 'tubular', load_w: 700 }, data);
  assert.ok(b5.ok, `B5 says ${b5.error} for the UPS N7 recommends`);
});

test('DEFECT DE-12 a backup load above the whole running load (or backup energy above the day\'s use) is rejected', () => {
  const e = home_decision({ ...H, backup_w: 2000, backup_hours: 10 }, data); // 20 kWh/day backup, home uses 13.2 kWh/day
  assert.equal(e.ok, false, `accepted: ${e.decision}`);
});
