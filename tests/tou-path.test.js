// 21 Oct 2026 audit, fix Phase 9 (WL-162 c): the ToU path on the H1 planner and the net billing pages (D10, D11) for a
// sanctioned load of 5 kW and above, with the default peak share in data/ shown as an estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, readJson } from './load-data.js';
import { build } from '../tools/build.js';
import { calculators as C } from '../engine/index.js';
import { noticeCode } from '../engine/messages.js';
import { render } from '../engine/format.js';

const files = await build();
const page = (id) => JSON.parse(files[`generated/pages/${id}.json`]);
const H1 = page('H1');
const home = Object.fromEntries(H1.content.tool.fields.map((f) => [f.name, f.default]));
const T = data.tariff.tou;
const kwT = data.defaults.tou_threshold_kw;

test('the default peak share lives in data/ with its source and is marked for the engineer', () => {
  const d = readJson('data/defaults.json');
  assert.ok(d.tou_peak_share > 0 && d.tou_peak_share < 1);
  assert.match(d.tou_peak_share_source, /estimate/i);
  assert.ok(d._meta.engineer_confirm.includes('tou_peak_share'));
});

test('H1 at and above the ToU threshold gives a full plan and decision, never the ToU error', () => {
  for (const kw of [kwT, kwT + 2, kwT * 2]) {
    const r = C.home_decision({ ...home, sanctioned_kw: kw }, data);
    assert.equal(r.ok, true, `${kw} kW: ${r.error}`);
    assert.equal(r.tou, true);
    assert.equal(r.tou_estimate, true);
    assert.match(r.tariff_text, /^ToU tariff/);
    for (const k of ['full_before_rs', 'full_after_rs', 'full_saving_rs', 'bill_before_rs', 'saving_rs', 'decision_saving_rs']) {
      assert.ok(Number.isFinite(r[k]) && r[k] >= 0, `${kw} kW ${k} = ${r[k]}`);
    }
    // The planner's whole bill is the ToU bill of section F for the same split.
    const b = C.bill_tou({ sanctioned_kw: kw, peak_units: r.monthly_units * r.peak_share, offpeak_units: r.monthly_units * (1 - r.peak_share) }, data);
    assert.equal(r.full_before_rs, b.total_rs);
  }
  const flat = C.home_decision({ ...home, sanctioned_kw: kwT - 1 }, data);
  assert.equal(flat.tou, false);
  assert.equal(flat.tariff_text, 'slab tariff');
});

test('H1: solar replaces off-peak units only, and an entered share turns the estimate notice off', () => {
  const r = C.home_plan({ ...home, sanctioned_kw: kwT, peak_share: 0.3 }, data);
  assert.equal(r.tou_estimate, false);
  const peak = r.monthly_units * 0.3;
  const want = peak * T.peak + (r.import_units - peak) * T.offpeak - r.export_credit_rs;
  assert.ok(Math.abs(r.bill_after_rs - Math.max(0, want)) < 1e-6);
  const e = C.home_plan({ ...home, sanctioned_kw: kwT, day_share: 0.8, peak_share: 0.3 }, data);
  assert.equal(e.error, 'peak_share_too_large');
  assert.ok(Math.abs(e.limit - 0.2) < 1e-9);
  // Blank share with a large day share: the default is cut to what the day share leaves, never an error.
  assert.equal(C.home_plan({ ...home, sanctioned_kw: kwT, day_share: 0.9 }, data).ok, true);
});

test('H1 at 5 kW shows the ToU estimate notice and the how text names the tariff', () => {
  const r = C.home_decision({ ...home, sanctioned_kw: kwT }, data);
  assert.equal(noticeCode(r), 'tou_estimate');
  assert.ok(H1.content.tool.msg.tou_estimate, 'notice text shipped to the page');
  const how = render(H1.content.tool.how.tpl, { in: r, out: r, d: data.defaults });
  assert.ok(how && how.includes('ToU tariff ('), how);
  assert.doesNotMatch(H1.content.tool.fields.find((f) => f.name === 'sanctioned_kw').hint, /use the/);
});

test('D10 and D11 at 5 kW and above bill the import on ToU rates, with the peak units estimated when blank', () => {
  for (const id of ['D10', 'D11']) {
    const p = page(id);
    assert.ok(p.content.tool.fields.some((f) => f.name === 'peak_units'), `${id} has the peak units field`);
    for (const k of ['tou_peak_estimate', 'protected_at_tou']) assert.ok(p.content.tool.msg[k], `${id} ships ${k}`);
    const inp = { ...Object.fromEntries(p.content.tool.fields.map((f) => [f.name, f.default])), sanctioned_kw: kwT + 3 };
    const r = C[p.content.tool.calc](inp, data);
    assert.equal(r.ok, true, r.error);
    assert.equal(noticeCode(r), 'tou_peak_estimate');
    const how = render(p.content.tool.how.tpl, { in: r, out: r, d: data.defaults });
    assert.ok(how && how.includes('peak units ×'), how);
  }
});

test('the D10 ToU worked example is built by the engine', () => {
  const ex = page('D10').content.examples.find((x) => /ToU meter/.test(x.title));
  assert.ok(ex, 'ToU example on D10');
  assert.match(ex.text, /peak units ×/);
});

// Phase 9b (owner 21 Oct 2026): the same ToU path on the bill pages, E1 and N16.
test('bill pages, E1 and N16 at 5 kW and above give a ToU bill with the estimate notice and a working how text', () => {
  for (const [id, flag] of [['F1', 'tou_bill_estimate'], ['F5', 'tou_bill_estimate'], ['F14', 'tou_bill_estimate'], ['E1', 'tou_share_estimate'], ['N16', 'tou_share_estimate']]) {
    const p = page(id);
    const t = p.content.tool;
    assert.ok(t.msg[flag], `${id} ships ${flag}`);
    const inp = { ...t.fixed_inputs, ...Object.fromEntries(t.fields.filter((f) => f.default != null).map((f) => [f.name, f.default])), sanctioned_kw: kwT + 1, protected: false };
    const r = C[t.calc](inp, data);
    assert.equal(r.ok, true, `${id}: ${r.error}`);
    assert.equal(noticeCode(r), flag, id);
    const how = render(t.how.tpl, { in: r, out: r, d: data.defaults, data });
    assert.ok(how && /peak/.test(how), `${id}: ${how}`);
  }
  // An entered peak share of the bill turns the estimate off; the ToU bill equals bill_tou for the same split.
  const r = C.bill_total({ units: 700, sanctioned_kw: kwT + 1, peak_units: 100, mdi_kw: 4 }, data);
  assert.equal(r.tou_bill_estimate, false);
  assert.equal(r.total_rs, C.bill_tou({ peak_units: 100, offpeak_units: 600, sanctioned_kw: kwT + 1, mdi_kw: 4 }, data).total_rs);
  assert.equal(C.bill_total({ units: 100, sanctioned_kw: kwT, lifeline: true }, data).error, 'protected_at_tou');
});
