// Rule 7: results never show NaN, Infinity, negative or blank. Mutate every spec case's inputs
// (zero, negative, huge, tiny, blank, text, null) and require either a clean result or a named user error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculators } from '../engine/index.js';
import { data, cases } from './load-data.js';

const MUTATIONS = [0, -1, -1e6, 1e12, 1e-9, '', 'abc', null, undefined, NaN, Infinity, '  42 '];

function variants(inputs) {
  const out = [];
  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === 'number' || typeof v === 'string') {
      for (const m of MUTATIONS) out.push({ ...inputs, [k]: m });
    }
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      for (const m of MUTATIONS) out.push({ ...inputs, [k]: v.map((l, i) => (i === 0 ? { ...l, run: m } : l)) });
      out.push({ ...inputs, [k]: 'not a list' });
    }
    if (Array.isArray(v) && typeof v[0] === 'number') {
      for (const m of MUTATIONS) out.push({ ...inputs, [k]: [m, ...v.slice(1)] });
    }
  }
  return out;
}

function checkClean(value, path) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is ${value}`);
  } else if (value === undefined || value === '') {
    assert.fail(`${path} is blank`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) checkClean(v, `${path}.${k}`);
  }
}

for (const name of Object.keys(calculators)) {
  test(`guardrails: ${name}`, () => {
    const own = cases.filter((c) => c.calc === name);
    let checked = 0;
    for (const c of own) {
      for (const inputs of [c.inputs, ...variants(c.inputs)]) {
        const r = calculators[name](inputs, data);
        checked++;
        if (r.ok) {
          checkClean(r, name);
        } else {
          assert.equal(typeof r.error, 'string');
          assert.ok(!r.error.startsWith('internal_') && !r.error.startsWith('missing_default'), `${name} ${JSON.stringify(inputs)} -> ${r.error} ${r.field}`);
        }
      }
    }
    assert.ok(checked > 0);
  });
}

test('calculators never throw on missing data or inputs', () => {
  for (const fn of Object.values(calculators)) {
    assert.doesNotThrow(() => fn());
    assert.doesNotThrow(() => fn({}, {}));
  }
});
