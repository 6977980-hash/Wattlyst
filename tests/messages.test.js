import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, noticeCode } from '../engine/messages.js';
import { calculators } from '../engine/index.js';
import { data, cases } from './load-data.js';

test('every error code from the spec cases has a specific message', () => {
  const generic = errorMessage('__nope__');
  for (const c of cases.filter((x) => x.expected.error)) {
    const r = calculators[c.calc](c.inputs, data);
    assert.notEqual(errorMessage(r.error), generic, r.error);
  }
});

test('a generator above the standard sizes gets generator advice, other sizes keep the split advice', () => {
  const r = calculators.generator_size({ loads: [{ id: 'custom', watts: 1e6 }] }, data);
  assert.equal(r.ok, true);
  assert.equal(r.above_standard_sizes, true);
  assert.equal(noticeCode(r), 'generator_above_standard_sizes');
  assert.match(errorMessage('generator_above_standard_sizes'), /two generators/);
  assert.doesNotMatch(errorMessage(noticeCode(r)), /array/);
  assert.equal(noticeCode({ ok: true, generator_above_standard_sizes: true }), 'generator_above_standard_sizes');
  assert.equal(noticeCode({ ok: true, above_standard_sizes: true }), 'above_standard_sizes');
});

// Full audit 2026-10-15 WL-107: one source per constant. Codes that carry a limit print it; the few fixed messages
// that name a data/ value must agree with that value, so changing the data fails here instead of misleading users.
test('WL-107 limits in error messages come from data/', () => {
  const d = data.defaults;
  assert.match(errorMessage('protected_max_150_units'), /up to 150 units/);
  assert.match(errorMessage('lifeline_max_80_units'), /^Lifeline tariff applies only up to 80 units a month\.$/);
  assert.match(errorMessage(`history_needs_${d.protected_months}_months`), new RegExp(`last ${d.protected_months} months`));
  assert.match(errorMessage('tou_required_at_5kw'), new RegExp(`of ${d.tou_threshold_kw} kW or more`));
  const amb = data.cables.derating.ambient_factors;
  const grp = data.cables.derating.grouping_factors;
  assert.match(errorMessage('ambient_out_of_range'), new RegExp(`between ${amb[0][0]} and ${amb[amb.length - 1][0]} °C`));
  assert.match(errorMessage('circuits_out_of_range'), new RegExp(`from 1 to ${grp[grp.length - 1][0]}\\.`));
  assert.match(errorMessage('soiling_rate_invalid'), new RegExp(`Maximum ${d.soiling_rate_max_per_day}\\.`));
  assert.match(errorMessage('ac_protected_lost'), new RegExp(`following ${['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][d.protected_months]} months`));
});

test('WL-107 the 1.5 ton AC planning figures live only in data/appliances.json', () => {
  assert.equal(data.defaults.ac_inverter_avg_kw_1_5_ton, undefined);
  assert.equal(data.defaults.ac_noninverter_kw_1_5_ton, undefined);
});
