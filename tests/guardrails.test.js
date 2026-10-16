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

// Results that are signed by meaning (full audit 2026-10-15 WL-155): an FPA or QTA can be a credit, and a quote can
// sit below the typical low or high price. Every other number must be 0 or more (rule 7).
const SIGNED = new Set(['fpa_per_unit', 'fpa_rs', 'qta_per_unit', 'qta_rs', 'vs_low_pct', 'vs_high_pct']);

function checkClean(value, path) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is ${value}`);
    assert.ok(value >= 0 || SIGNED.has(path.split('.').pop()), `${path} is negative (${value})`);
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

// Audit 2026-10-14 (WL-10): the AC wire page (W1) and the add-an-AC check (E4) must print the same circuit for every AC.
test('W1, W3 and E4 give every AC the same MCB, curve and cable', () => {
  const acs = Object.keys(data.appliances).filter((id) => ['inverter_compressor', 'compressor'].includes(data.appliances[id].load_type) && /^ac-/.test(id));
  assert.ok(acs.length >= 6);
  for (const ac of acs) {
    for (const ambient_c of [undefined, 30, 50]) {
      const w = calculators.wire_size({ appliance: ac, length_m: 1, ambient_c }, data);
      const b = calculators.breaker_size({ appliance: ac, ambient_c }, data);
      const e = calculators.add_ac_check({ current_w: 1000, ac, sanctioned_kw: 5, ambient_c }, data);
      assert.ok(w.ok && b.ok && e.ok, ac);
      assert.deepEqual([e.ac_breaker_a, e.ac_curve, e.ac_cable_mm2, e.ac_pf], [w.breaker_a, b.curve, w.area_mm2, w.pf], `${ac} at ${ambient_c ?? 'default'} C`);
      // W3 with the load type and rated watts typed by hand gives the same circuit.
      const h = calculators.breaker_size({ watts: w.watts, load_type: data.appliances[ac].load_type, ambient_c }, data);
      assert.deepEqual([h.breaker_a, h.curve, h.area_mm2, h.pf], [b.breaker_a, b.curve, b.area_mm2, b.pf], `W3 by hand: ${ac}`);
    }
  }
});
