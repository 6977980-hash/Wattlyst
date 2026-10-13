import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage } from '../engine/messages.js';
import { calculators } from '../engine/index.js';
import { data, cases } from './load-data.js';

test('every error code from the spec cases has a specific message', () => {
  const generic = errorMessage('__nope__');
  for (const c of cases.filter((x) => x.expected.error)) {
    const r = calculators[c.calc](c.inputs, data);
    assert.notEqual(errorMessage(r.error), generic, r.error);
  }
});
