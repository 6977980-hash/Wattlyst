// Net billing review 30 Oct 2026, Phase B: payback on D10 (WL-250) and the DISCO select (WL-251), no new pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './load-data.js';
import { build } from '../tools/build.js';
import { calculators as C } from '../engine/index.js';
import { render } from '../engine/format.js';

const files = await build();
const page = (id) => JSON.parse(files[`generated/pages/${id}.json`]);
const D10 = page('D10');
const tool = D10.content.tool;
const defaults = Object.fromEntries(tool.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));

test('WL-251 the DISCO list comes from data, starts blank and links every DISCO bill page', () => {
  const f = tool.fields.find((x) => x.name === 'disco');
  assert.deepEqual(f.options.map(([v]) => v), ['', ...Object.keys(data.tariff.discos)]);
  assert.ok(data.tariff.discos_source && data.tariff.discos_checked);
  const bills = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((id) => page(id).url);
  assert.deepEqual(f.l.map((x) => x.u), bills);
  assert.deepEqual(f.l.map((x) => x.t), Object.keys(data.tariff.discos));
});

test('WL-251 the DISCO is named in the result (so in the shared text) and changes no number', () => {
  const plain = C[tool.calc](defaults, data);
  const lesco = C[tool.calc]({ ...defaults, disco: 'LESCO' }, data);
  assert.equal(lesco.disco, 'LESCO');
  for (const k of ['net_energy_rs', 'export_credit_rs', 'net_metering_rs', 'extra_vs_net_metering_rs']) assert.equal(lesco[k], plain[k], k);
  const out = tool.outputs.find((o) => o.key === 'disco');
  assert.ok(out.optional && out.value === '', 'hidden until a DISCO is picked');
});

test('WL-250 payback: blank boxes keep the page as before and the how text asks for the two inputs', () => {
  const r = C[tool.calc](defaults, data);
  assert.equal(r.payback_years, undefined);
  for (const k of ['monthly_saving_rs', 'payback_years']) assert.equal(tool.outputs.find((o) => o.key === k).value, '', k);
  assert.match(render(tool.how.tpl, { in: r, out: r, d: data.defaults }), /enter your monthly units before solar and the system price/);
});

test('WL-250 payback: the live how text prints the sums the result shows', () => {
  const r = C[tool.calc]({ ...defaults, before_units: 600, system_rs: 600000 }, data);
  assert.equal(r.ok, true, r.error);
  const how = render(tool.how.tpl, { in: r, out: r, d: data.defaults });
  assert.ok(how.includes(`Payback = Rs 600,000 ÷ Rs 143,844 = ${(600000 / 143844).toFixed(1)} years`), how);
  assert.equal(r.monthly_saving_rs, r.before_energy_rs - r.net_energy_rs);
});

test('WL-250 the FAQ no longer says the payback tool is planned, and the error texts ship with the page', () => {
  assert.doesNotMatch(JSON.stringify(D10.content.faq), /planned/);
  for (const k of ['payback_needs_before_units', 'before_below_import', 'payback_no_saving', 'disco_invalid']) assert.ok(tool.msg[k], k);
});

test('only D10 ships the payback module: D11 and the homepage chain stay as they were', () => {
  assert.equal(tool.module, 'payback.js');
  assert.equal(page('D11').content.tool.module, 'bill.js');
  const deps = JSON.parse(files['generated/manifest.json']).assets.deps;
  assert.ok(!deps['decision.js'].includes('payback.js'));
});
