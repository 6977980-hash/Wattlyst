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
