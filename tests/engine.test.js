// Runs every case in specs/calculator-test-cases.json against the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculators } from '../engine/index.js';
import { data, cases } from './load-data.js';

for (const c of cases) {
  test(`${c.calc}: ${c.name}`, () => {
    const fn = calculators[c.calc];
    assert.ok(fn, `no engine function for calc "${c.calc}"`);
    const r = fn(c.inputs, data);
    for (const [key, want] of Object.entries(c.expected)) {
      if (key === 'error') {
        assert.equal(r.ok, false, `expected error ${want}, got ${JSON.stringify(r)}`);
        assert.equal(r.error, want);
        continue;
      }
      assert.equal(r.ok, true, `unexpected error ${r.error} (${r.field})`);
      const got = r[key];
      if (typeof want === 'number') {
        assert.equal(typeof got, 'number', `${key} missing: ${JSON.stringify(r)}`);
        assert.ok(Math.abs(got - want) <= c.tolerance + 1e-9, `${key}: got ${got}, want ${want} ±${c.tolerance}`);
      } else {
        assert.deepEqual(got, want, `${key}`);
      }
    }
  });
}

test('every calculator in the engine has at least one spec test case', () => {
  const tested = new Set(cases.map((c) => c.calc));
  const untested = Object.keys(calculators).filter((n) => !tested.has(n));
  assert.deepEqual(untested, []);
});
