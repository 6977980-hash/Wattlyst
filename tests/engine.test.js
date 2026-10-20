// Runs every case in specs/calculator-test-cases.json against the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { calculators } from '../engine/index.js';
import { stripJs, stampImports } from '../tools/lib/strip.js';
import { data, cases, root } from './load-data.js';

// The browser loads the stripped copies in dist/ (tools/build.js). Strip the current engine into a temp
// folder (with the ?ver= stamped imports, as shipped) and run every case there as well, so a stripping or
// stamping mistake can never reach the site.
const tmp = mkdtempSync(join(tmpdir(), 'wl-dist-'));
for (const f of readdirSync(join(root, 'engine')).filter((x) => x.endsWith('.js'))) writeFileSync(join(tmp, f), stampImports(stripJs(readFileSync(join(root, 'engine', f), 'utf8')), 'test'));
const { calculators: shipped } = await import(pathToFileURL(join(tmp, 'index.js')).href);

/**
 * A case may pin data values it depends on ("data": {"generator_fuel.prices.petrol.rs_per_litre": 398.3}),
 * so a monthly price refresh in data/ never changes what a formula case expects.
 */
function caseData(c) {
  if (!c.data) return data;
  const d = structuredClone(data);
  for (const [path, v] of Object.entries(c.data)) {
    const keys = path.split('.');
    const last = keys.pop();
    const obj = keys.reduce((o, k) => o?.[k], d);
    assert.ok(obj && last in obj, `${c.name}: pinned data path ${path} does not exist`);
    obj[last] = v;
  }
  return d;
}

for (const c of cases) {
  test(`${c.calc}: ${c.name}`, () => {
    const fn = calculators[c.calc];
    assert.ok(fn, `no engine function for calc "${c.calc}"`);
    const d = caseData(c);
    const r = fn(c.inputs, d);
    assert.deepEqual(shipped[c.calc](structuredClone(c.inputs), d), r, 'stripped browser copy gives the same result');
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
