// Full audit 15 Oct 2026, fix Phase 2b (decision engine modelling): the regression tests DE-03 to DE-07, DE-12 and the
// "browser copy over many inputs" test from the audit decision tests (adapted to tests/load-data.js), plus the rules
// built in this phase: close calls (WL-94), battery voltage pairs (WL-98), the not-counted list (WL-99), N7 and the
// home page saying why they can differ (WL-102), N7's fixed claims (WL-104), the budget at the low price (WL-105)
// and one month length (WL-106).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { data, readJson, root } from './load-data.js';
import { calculators as C } from '../engine/index.js';
import { home_decision } from '../engine/decision.js';
import { backup_compare } from '../engine/backup.js';

const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 4, chemistry: 'lifepo4', years: 10, battery_v: 24, buyback_rs: 8.13, day_share: 0.5, margin: 1.25 };
const BIG = [{ id: 'ceiling-fan-ac', qty: 8 }, { id: 'led-bulb', qty: 20 }, { id: 'ac-split-1-5ton-inverter', qty: 3, hours: 8 }, { id: 'refrigerator-inverter', qty: 2 }, { id: 'led-tv-43', qty: 2 }];
const SMALL = [{ id: 'ceiling-fan-ac', qty: 2 }, { id: 'led-bulb', qty: 4 }, { id: 'refrigerator-inverter', qty: 1 }];
const SCEN = [{}, { loads: SMALL, backup_w: 150 }, { loads: BIG, sanctioned_kw: 4.9 }, { loads: BIG }, { backup_hours: 0 }, { backup_hours: 0, years: 1 }, { backup_hours: 12 },
  { backup_hours: 20, backup_w: 300 }, { backup_hours: 24, backup_w: 300 }, { loads: BIG, backup_w: 1500, backup_hours: 8 }, { years: 1 }, { years: 30 }, { budget_rs: 50000 },
  { budget_rs: 1e9 }, { budget_rs: 500000 }, { city: 'karachi' }, { city: 'quetta' }, { chemistry: 'tubular' }, { buyback_rs: 0 }, { day_share: 1 }, { backup_w: 200, backup_hours: 1 },
  { loads: BIG, backup_w: 3000 }, { loads: BIG, backup_w: 6000 }, { loads: SMALL, backup_hours: 0, years: 3 }, { sanctioned_kw: 0.5 }, { years: 8 }];
const bt = (units, kw = 4) => C.bill_total({ sanctioned_kw: kw, protected: false, units }, data).total_rs;
const days = data.defaults.days_per_month;

test('DEFECT DE-03 with 24 h of cuts a day the solar setups earn no net-billing saving (no grid to export to)', () => {
  const e = home_decision({ ...H, backup_w: 300, backup_hours: 24 }, data);
  assert.equal(e.ok, true, e.error);
  assert.equal(backup_compare({ load_w: 300, hours: 24, years: 10, tariff: 36.46 }, data).refill_hours, 0); // the grid is never on
  assert.equal(e.ongrid_saving_rs, 0);
  // The combo saves only what its UPS or generator saves alone: the solar part adds nothing without a grid.
  assert.ok(Math.abs(e.combo_saving_rs - e.standby_saving_rs) < 1e-6, `combo ${e.combo_saving_rs} vs standby ${e.standby_saving_rs}`);
  assert.ok(Math.abs(e.combo_running_rs - e.standby_running_rs) < 1e-6);
  // A hybrid still uses its own solar in the home but exports nothing.
  assert.ok(e.hybrid_saving_rs > 0 && e.hybrid_saving_rs < home_decision({ ...H, backup_w: 300, backup_hours: 0 }, data).ongrid_saving_rs);
});

test('WL-93 the on-grid saving falls with the share of the day the grid is off and is unchanged without cuts', () => {
  let last = Infinity;
  for (const h of [0, 4, 8, 12, 16, 20, 24]) {
    const e = home_decision({ ...H, backup_w: 300, backup_hours: h }, data);
    assert.equal(e.grid_share, 1 - h / 24);
    assert.ok(e.ongrid_saving_rs <= last + 1e-9, `${h} h`);
    last = e.ongrid_saving_rs;
    if (h === 0) assert.equal(e.ongrid_saving_rs, e.full_saving_rs);
  }
});

test('DEFECT DE-04 a close call is stated as one (runner-up within the shown price uncertainty)', () => {
  const e = home_decision({ ...H, backup_w: 255, backup_hours: 4, years: 5 }, data);
  assert.ok(/close|similar|within the price range|either/i.test(e.decision_text), e.decision_text.split('. ').pop());
  assert.equal(e.close_call, true);
  assert.ok(e.runner_up && !e.decision.startsWith(e.runner_up));
});

test('WL-94 close_call is set exactly when the runner-up\'s net range overlaps the pick\'s', () => {
  for (const ov of SCEN) {
    const e = home_decision({ ...H, ...ov }, data);
    if (!e.ok || e.over_budget) continue;
    const rows = e.setups.filter((s) => s.net !== 'Not counted');
    const end = (s, k) => {
      const [lo, hi] = s.price.match(/[\d,]+/g).map((x) => Number(x.replace(/,/g, '')));
      const mid = (lo + hi) / 2;
      const n = /saved$/.test(s.net) ? -Number(s.net.match(/[\d,]+/)[0].replace(/,/g, '')) : Number(s.net.match(/[\d,]+/)[0].replace(/,/g, ''));
      return n + (k === 'lo' ? lo - mid : hi - mid);
    };
    if (e.close_call) {
      const pick = rows.find((s) => s.option.endsWith('(recommended)'));
      const ru = rows.find((s) => s.option === e.runner_up);
      assert.ok(pick && ru, JSON.stringify(ov));
      assert.ok(end(ru, 'lo') <= end(pick, 'hi') + 2 && end(pick, 'lo') <= end(ru, 'hi') + 2, JSON.stringify(ov));
      assert.ok(e.decision_text.includes(`Close call: ${e.runner_up}`));
    } else assert.ok(!/Close call/.test(e.decision_text));
  }
});

test('DEFECT DE-05 the generator is not charged twice for the backup units (petrol + the same units on the bill)', () => {
  const e = home_decision({ ...H, backup_hours: 12 }, data);
  assert.ok(e.standby_option.startsWith('Petrol generator'), e.standby_option);
  const n = backup_compare({ load_w: 500, surge_w: e.backup_surge_w, hours: 12, years: 10, tariff: e.rate_before, city: 'lahore' }, data);
  const credit = e.full_before_rs - bt(e.monthly_units - 0.5 * 12 * days); // the units the grid no longer supplies
  assert.ok(Math.abs(e.standby_running_rs - n.gen_run_year / 12) < 1);
  assert.ok(Math.abs(e.standby_saving_rs - credit) < 1, `saving ${e.standby_saving_rs} vs ${credit}`);
  assert.ok(Math.abs(e.standby_rs + 120 * (n.gen_run_year / 12 - credit) - (e.standby_net.endsWith('cost') ? 1 : -1) * Number(e.standby_net.match(/[\d,]+/)[0].replace(/,/g, ''))) < 1);
});

test('DEFECT DE-06 the N7/H1 generator can start the backup load (C1 rule: max(run × margin, peak) ÷ PF)', () => {
  const loads = [{ id: 'water-motor-1hp', qty: 1 }, { id: 'ceiling-fan-ac', qty: 2 }];
  const c1 = C.generator_size({ loads, margin: 1.25, pf: 0.8 }, data);
  const n = backup_compare({ load_w: c1.running_w, surge_w: c1.peak_w, hours: 3, years: 5, tariff: 36.46 }, data);
  assert.ok(n.gen_rated_kw * 1000 >= c1.peak_w, `N7 ${n.gen_kva} kVA (${n.gen_rated_kw * 1000} W) for a ${c1.peak_w} W start; C1 says ${c1.standard_kva} kVA`);
  // Home page: the backup load's start is the backup watts plus the biggest start step of a motor that fits in it.
  const e = home_decision({ ...H, loads: [...loads, { id: 'led-bulb', qty: 4 }], backup_w: c1.running_w, backup_hours: 1 }, data);
  assert.equal(e.backup_surge_w, c1.peak_w);
  const g = backup_compare({ load_w: e.backup_w, surge_w: e.backup_surge_w, hours: 1, years: 10, tariff: e.rate_before }, data);
  assert.ok(g.gen_rated_kw * 1000 >= c1.peak_w);
  if (e.standby_option.startsWith('Petrol generator')) assert.equal(e.standby_option, `Petrol generator ${g.gen_kva} kVA`);
  // A motor bigger than the backup load cannot be on it, so it does not raise the backup start.
  assert.ok(home_decision({ ...H, loads: [...loads, { id: 'led-bulb', qty: 4 }], backup_w: 100, backup_hours: 2 }, data).backup_surge_w < 100 + c1.peak_w - c1.running_w);
});

test('DEFECT DE-07 every UPS N7 picks is accepted by B5 for the same VA', () => {
  for (let load_w = 100; load_w <= 1280; load_w += 20) {
    const n = backup_compare({ load_w, hours: 2, years: 5, tariff: 36.46 }, data);
    if (n.ups_kva === undefined || !n.ups_buy) continue;
    const b5 = C.ups_backup({ va: n.ups_kva * 1000, ah: 200, volts: n.bank_v, chemistry: 'tubular', load_w }, data);
    assert.ok(b5.ok, `${load_w} W: N7 picks UPS ${n.ups_kva} kVA, B5 says ${b5.error}`);
  }
});

test('WL-98 no priced hybrid pairs an inverter with a battery of another voltage', () => {
  const bp = data.backup_prices;
  const rows = data.component_prices.items.filter((x) => x.category === 'hybrid_inverter');
  assert.ok(rows.every((x) => x.bank_v > 0), 'every hybrid inverter row names its battery voltage');
  assert.ok(bp.lithium_pack.bank_v > 0);
  for (const load_w of [100, 300, 600, 1200, 3000, 6000]) {
    const n = backup_compare({ load_w, hours: 4, years: 5, tariff: 36.46 }, data);
    if (!n.ok) continue;
    const inv = rows.find((x) => parseFloat(x.size) === n.inverter_kw && x.bank_v === bp.lithium_pack.bank_v);
    assert.ok(inv, `${load_w} W: ${n.inverter_kw} kW inverter is not a ${bp.lithium_pack.bank_v} V unit`);
  }
  assert.equal(data.defaults.hybrid_bank_v, bp.lithium_pack.bank_v);
});

test('DEFECT DE-12 a backup load above the whole running load (or backup energy above the day\'s use) is rejected', () => {
  const e = home_decision({ ...H, backup_w: 2000, backup_hours: 10 }, data); // 20 kWh/day backup, the home uses less
  assert.equal(e.ok, false, `accepted: ${e.decision}`);
  assert.equal(e.error, 'backup_above_home');
  const p = C.home_plan(H, data);
  assert.equal(home_decision({ ...H, backup_w: p.running_w + 1, backup_hours: 1 }, data).error, 'backup_above_home');
  assert.equal(home_decision({ ...H, backup_w: p.running_w, backup_hours: 1 }, data).ok, true);
  // Without backup hours the backup watts are not needed (WL-105).
  assert.equal(home_decision({ ...H, backup_w: '', backup_hours: 0 }, data).ok, true);
});

test('WL-105 with a budget a setup counts when its low price fits, and the text says when only the low end fits', () => {
  const e = home_decision({ ...H, budget_rs: 500000 }, data);
  assert.equal(e.over_budget, false);
  const pick = e.setups.find((s) => s.option.endsWith('(recommended)'));
  const lo = Number(pick.price.match(/[\d,]+/)[0].replace(/,/g, ''));
  assert.ok(lo <= 500000);
  assert.equal(e.budget_low_end, e.decision_rs > 500000);
  if (e.budget_low_end) assert.ok(e.decision_text.includes('only at the low end'));
  const ups = home_decision(H, data);
  const at = home_decision({ ...H, budget_rs: ups.standby_low_rs }, data);
  const below = home_decision({ ...H, budget_rs: ups.standby_low_rs - 1 }, data);
  assert.equal(at.over_budget, false);
  assert.equal(below.over_budget, true);
  assert.ok(Math.abs(below.budget_gap_rs - 1) < 1e-6);
});

test('WL-106 one month length: a flat bill gets the same panels from the one-bill (D7) and twelve-bill (N17) tools', () => {
  assert.ok(Math.abs(data.defaults.days_per_month * 12 - 365) < 0.1);
  for (const [city, c] of Object.entries(data.cities)) {
    if (!c.pvout_month) continue;
    assert.ok(Math.abs(c.yield - c.pvout_month.reduce((a, b) => a + b, 0) / 365) <= 0.0005 + 1e-9, `${city} yield`);
    let differ = 0;
    for (let u = 50; u <= 3000; u += 10) {
      const d7 = C.solar_size({ monthly_units: u, city, panel_w: 585 }, data);
      const months = Object.fromEntries(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map((m) => [m, u]));
      const n17 = C.solar_seasonal({ city, ...months, panel_w: 585 }, data);
      if (d7.panels !== n17.panels) differ++;
    }
    assert.ok(differ <= 3, `${city}: ${differ} of 296 flat bills get a different panel count`);
  }
});

test('OK browser copy of the data gives the same H1 and N7 results as data/ over many inputs (WL-108)', () => {
  const manifest = readJson('generated/manifest.json');
  const ship = (id) => {
    const t = readJson(`generated/pages/${id}.json`).content.tool;
    return { defaults: manifest.data.defaults, ...Object.fromEntries(t.data_keys.map((k) => [k, manifest.data[k]])), ...(t.appliances ? { appliances: t.appliances } : {}) };
  };
  const h1 = ship('H1');
  const n7 = ship('N7');
  for (const ov of SCEN) assert.deepEqual(home_decision({ ...H, ...ov }, h1), home_decision({ ...H, ...ov }, data), JSON.stringify(ov));
  for (const load_w of [100, 600, 1500, 5000]) for (const hours of [1, 4, 12, 24]) for (const years of [1, 5, 30]) {
    const i = { load_w, surge_w: load_w * 2, hours, years, tariff: 36.46, city: 'karachi' };
    assert.deepEqual(backup_compare(i, n7), backup_compare(i, data), JSON.stringify(i));
  }
});

// Every "Not counted (the page says so)" item of the decision engine in specs/formulas.md, with the words that show it
// on the home page (WL-99).
const NOT_COUNTED = [
  ['installation of UPS and generator', /installation of the UPS or generator/i],
  ['battery losses on solar self-use', /battery losses/i],
  ['inverter replacement', /inverter replacement/i],
  ['the daytime solar the hybrid battery stores', /solar the hybrid battery stores/i],
  ['the leftover value of a battery', /leftover value/i],
  ['power cuts are spread evenly over the day', /spread evenly over the day/i],
  ['price changes over the years', /today's rupees/i],
];

test('WL-99 every "not counted" item of the decision engine spec is stated on the home page', () => {
  const spec = readFileSync(join(root, 'specs/formulas.md'), 'utf8');
  const para = spec.slice(spec.indexOf('**Home Power Decision Engine'));
  const at = para.indexOf('Not counted (the page says so');
  const nc = para.slice(at, para.indexOf('\n', at));
  const page = JSON.stringify(readJson('generated/pages/H1.json'));
  for (const [item, re] of NOT_COUNTED) {
    assert.ok(nc.includes(item), `spec lists "${item}"`);
    assert.ok(re.test(page), `home page says ${re}`);
  }
});

test('WL-102 N7 and the home page each say why their pick can differ and link to each other', () => {
  const n7 = JSON.stringify(readJson('generated/pages/N7.json'));
  const h1 = JSON.stringify(readJson('generated/pages/H1.json'));
  const url = (id) => readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8').split('\n').find((l) => l.startsWith(`${id},`)).split(',')[1];
  assert.ok(n7.includes('bill saving') && /home page|Home Power Planner/.test(n7));
  assert.ok(h1.includes(url('N7')), 'home page links to N7');
  assert.ok(/ignores the daytime bill saving|leaves out the bill saving/i.test(h1));
});

test('WL-104 N7 names the cheapest to buy and the dearest after one year from the engine, not as fixed text', () => {
  const n = backup_compare({ load_w: 600, hours: 4, years: 5, tariff: 36.46 }, data);
  const one = (o) => o.buy + o.run_year;
  const opts = n.options.filter((o) => o.ok !== false);
  assert.equal(n.cheapest_buy, opts.reduce((a, b) => (b.buy < a.buy ? b : a)).name);
  assert.equal(n.first_year_dearest, opts.reduce((a, b) => (one(b) > one(a) ? b : a)).name);
  const page = JSON.stringify(readJson('generated/pages/N7.json'));
  assert.ok(!/dearest option within the first year even though/.test(page));
  assert.ok(!/For bigger loads and long cuts it is the cheapest/.test(page));
  assert.ok(page.includes(`dearest after the first year (purchase plus one year of running): ${n.first_year_dearest}`));
});
