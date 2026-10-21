// 21 Oct 2026 audit fix Phase 3 (input and error fixes): WL-197, WL-221 to WL-227, WL-241, WL-242.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { calculators } from '../engine/index.js';
import { errorMessage as pageMessage, noticeCode } from '../engine/messages.js';
import { errorMessage, EXACT } from '../engine/message-text.js';
import { data, cases, root, readJson } from './load-data.js';

const pages = readdirSync(join(root, 'generated/pages')).map((f) => readJson(`generated/pages/${f}`));
const tools = pages.filter((p) => p.content?.tool);
const read = (p) => readFileSync(join(root, p), 'utf8');

// Every error and notice a calculator gives on its spec cases, and on each input of those cases set to a blank, text,
// a negative, zero, a fraction and a huge value: the page ships the same text the full table gives (WL-226).
function codesOf(calc) {
  const out = new Map();
  const run = (inputs) => {
    const r = calculators[calc](inputs, data);
    if (!r.ok) out.set(r.error, r);
    else if (noticeCode(r)) out.set(noticeCode(r), {});
  };
  for (const c of cases.filter((x) => x.calc === calc)) {
    run(c.inputs);
    for (const k of Object.keys(c.inputs)) for (const v of ['', 'abc', -5, 0, 0.5, 1e13]) run({ ...c.inputs, [k]: v });
  }
  return out;
}

test('WL-226 every page ships the message text for every error its calculator gives', () => {
  const byCalc = new Map();
  for (const p of tools) {
    const t = p.content.tool;
    if (!byCalc.has(t.calc)) byCalc.set(t.calc, codesOf(t.calc));
    for (const [code, r] of byCalc.get(t.calc)) {
      const c = { fields: t.fields, limit: r.limit };
      assert.equal(pageMessage(code, { ...c, texts: t.msg }), errorMessage(code, c), `${p.id}: ${code}`);
    }
  }
});

test('WL-226 the browser message module carries no exact-code text table', () => {
  const src = read('engine/messages.js');
  for (const text of Object.values(EXACT).filter((x) => x.length > 40)) assert.ok(!src.includes(text), text);
  assert.ok(Buffer.byteLength(read('dist/engine/messages.js')) < 4 * 1024);
});

test('WL-226 messages name the field, its unit, an example or the limit', () => {
  const fields = [{ name: 'watts', label: 'Power', unit: 'W', default: 1500 }, { name: 'mode', label: 'Supply type', options: ['dc'] }];
  assert.equal(errorMessage('watts_required', { fields }), 'Enter power (W), for example 1500.');
  assert.equal(errorMessage('watts_invalid', { fields }), 'Enter power (W) as a plain number, for example 1500.');
  assert.equal(errorMessage('mode_invalid', { fields }), 'Choose supply type from the list.');
  assert.equal(errorMessage('watts_too_small', { fields, limit: 1 }), 'Power (W) must be at least 1.');
  assert.equal(errorMessage('watts_too_large', { fields, limit: 1000000 }), 'Power (W) must be 1,000,000 or less.');
  assert.match(errorMessage('watts_too_large', { fields }), /too large\. Check the number and its unit\./);
  // The engine hands the bound it checked to the page.
  const r = calculators.generator_for_ac({ ac: 'ac-split-1-5ton-inverter', other_w: 500, margin: 12 }, data);
  assert.equal(r.limit, data.defaults.margin_max);
  // B4: a blank backup-hours box is about that box, not an appliance list.
  const b4 = tools.find((p) => p.id === 'B4').content.tool;
  const e = calculators.battery_bank({ load_w: 500, volts: 24, chemistry: 'tubular' }, data);
  assert.equal(pageMessage(e.error, { fields: b4.fields, texts: b4.msg }), 'Enter backup hours (h), for example 4.');
  const d3 = calculators.solar_from_loads({ loads: [{ id: 'led-bulb', hours: 0 }], city: 'lahore' }, data);
  assert.match(errorMessage(d3.error), /at least one appliance/);
});

test('WL-197 an error is printed under the wrong field, with a red border that survives focus', () => {
  const js = read('assets/js/wattlyst-tool.js');
  assert.match(js, /bad\.closest\('\.wl-field'\)\?\.append\(errorEl\)/);
  assert.match(js, /results\.before\(errorEl\)/);
  const css = read('assets/css/wattlyst.css');
  assert.match(css, /\.wl-field \[aria-invalid=true\]:focus\{border-color:#b00020/);
  // Ordinary fields get the dark ring with the amber halo (old WL-134 / UX-05), not amber alone.
  assert.match(css, /\.wl-field input:focus,[^{]+\{outline:3px solid var\(--wl-ink\)/);
});

test('WL-221 blank boxes use typical values and the page says so; D9 panels are required', () => {
  const full = calculators.home_load({ loads: [{ id: 'ceiling-fan-ac', watts: 80, qty: 2, hours: 12 }] }, data);
  assert.equal(full.typical_used, undefined);
  const blank = calculators.home_load({ loads: [{ id: 'ceiling-fan-ac', watts: '', qty: 2, hours: '' }] }, data);
  assert.equal(blank.typical_used, true);
  assert.equal(noticeCode(blank), 'typical_used');
  assert.match(errorMessage('typical_used'), /typical value/);
  assert.equal(calculators.solar_for_ac({ ac: 'ac-split-1-5ton-inverter', city: 'lahore' }, data).typical_used, true);
  assert.equal(calculators.panel_price({ panel_w: 585 }, data).error, 'panels_required');
  // Default page results never carry the notice: the form shows every value the result used.
  for (const p of tools) assert.doesNotMatch(p.content.tool.notice, /typical value/, p.id);
  // E1 ships the notice text (list page).
  assert.ok(tools.find((p) => p.id === 'E1').content.tool.msg.typical_used);
});

test('WL-222 D7 sizes from the monthly units by default, and 600 and 1,500 units give different sizes', () => {
  const d7 = tools.find((p) => p.id === 'D7').content.tool;
  const f = Object.fromEntries(d7.fields.map((x) => [x.name, x]));
  assert.ok(f.monthly_units.default > 0);
  assert.equal(f.daily_kwh.default, undefined);
  const size = (u) => calculators.solar_size({ monthly_units: u, city: 'lahore' }, data).installed_kw;
  assert.ok(size(1500) > size(600));
  assert.match(errorMessage('usage_both'), /units a day are used/);
});

test('WL-224 C8 gives no per-unit figure near zero load', () => {
  const base = { kva: 5, load_w: 2000, hours: 4, fuel: 'petrol' };
  assert.ok(calculators.generator_fuel(base, data).rs_per_unit > 0);
  const tiny = calculators.generator_fuel({ ...base, load_w: 0.0001 }, data);
  assert.equal(tiny.ok, true);
  assert.equal(tiny.rs_per_unit, undefined);
  assert.equal(tiny.l_per_kwh, undefined);
  for (const k of ['margin_max', 'psh_min', 'load_w_max', 'fuel_per_unit_min_load_pct']) assert.ok(data.defaults[`${k}_source`], k);
});

test('WL-225 every result on a page with the Roman Urdu toggle has a Roman Urdu label', () => {
  for (const p of tools) {
    const outs = p.content.tool.outputs;
    if (!outs.some((o) => o.label_ur)) continue;
    for (const o of outs) assert.ok(o.label_ur, `${p.id}: ${o.label}`);
    assert.ok(outs.some((o) => o.label_ur !== o.label), `${p.id}: the toggle changes nothing`);
  }
  // No page has a Roman Urdu "how" text yet: its heading says "(English)" while the toggle is on.
  assert.match(read('assets/css/wattlyst.css'), /\[data-lang=ur\]~\.wl-how-en h2::after\{content:" \(English\)"\}/);
});

test('WL-241/242 FC surcharge and GST defaults per category come from the tariff file', () => {
  const a = data.tariff.addons_secondary;
  assert.equal(a.fc_surcharge_per_unit.by_category.lifeline, 0);
  assert.ok(a.fc_surcharge_per_unit.by_category_source && a.gst_pct.by_category_source);
  assert.equal(a.gst_pct.by_category_verified, false);
  const life = { units: 80, lifeline: true, sanctioned_kw: 1 };
  assert.equal(calculators.bill_total(life, data).fc_rs, 0);
  // The engine reads the file, so a confirmed value changes the bill without a code change.
  const d2 = structuredClone(data);
  d2.tariff.addons_secondary.fc_surcharge_per_unit.by_category.lifeline = 1;
  d2.tariff.addons_secondary.gst_pct.by_category.lifeline = 18;
  const r = calculators.bill_total(life, d2);
  assert.equal(r.fc_rs, 80);
  assert.equal(r.gst_pct, 18);
  assert.doesNotMatch(read('engine/bill.js'), /'(fc_surcharge_per_unit|gst_pct)', \{?\s*(def: )?life \?/);
});
