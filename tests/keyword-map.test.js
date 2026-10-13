// SEO guardrails for specs/keyword-map.csv (rules in specs/seo-rules.md, section "Titles, meta, URLs").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const rows = parseCsv(readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8'));
const STOP = new Set('a an the to for of in on and or my do i is can what how much many with by per vs at it run need'.split(' '));
const tokens = (s) => (s.toLowerCase().match(/[a-z0-9.]+/g) || []).filter((t) => !STOP.has(t));
const BRAND = 'Wattlyst';
const EXCLUDED = [/flominzo/i, /bill payment aggregator/i];

test('keyword map has rows', () => assert.ok(rows.length >= 80));

for (const key of ['id', 'url', 'primary_keyword', 'title', 'meta_description']) {
  test(`keyword map: ${key} is unique (one intent = one URL)`, () => {
    const seen = new Map();
    for (const r of rows) {
      const v = r[key].trim().toLowerCase();
      assert.ok(v, `${r.id}: ${key} is blank`);
      assert.ok(!seen.has(v), `${key} "${v}" used by ${seen.get(v)} and ${r.id}`);
      seen.set(v, r.id);
    }
  });
}

for (const r of rows) {
  test(`keyword map ${r.id}: title, meta and URL follow the rules`, () => {
    const isHome = r.url === '/';
    assert.ok(r.title.length >= 30 && r.title.length <= 60, `title ${r.title.length} chars (30-60): ${r.title}`);
    assert.ok(isHome ? r.title.startsWith(BRAND) : r.title.endsWith(`| ${BRAND}`), `brand suffix: ${r.title}`);
    assert.ok(r.meta_description.length >= 120 && r.meta_description.length <= 155, `meta ${r.meta_description.length} chars (120-155)`);
    assert.equal(Number(r.title_len), r.title.length, 'title_len column out of date');
    assert.equal(Number(r.meta_len), r.meta_description.length, 'meta_len column out of date');
    assert.ok(/^\/([a-z0-9]+(-[a-z0-9]+)*\/)*$/.test(r.url), `URL must be lowercase-hyphen with trailing slash: ${r.url}`);
    assert.ok(['1', '2', '3'].includes(r.wave), `wave ${r.wave}`);
    const have = new Set(tokens(`${r.title} ${r.meta_description}`));
    const missing = tokens(r.primary_keyword.replace('(brand)', '')).filter((t) => !have.has(t));
    assert.deepEqual(missing, [], `primary keyword words missing from title+meta: ${missing}`);
    assert.ok(!/[<>]/.test(r.title + r.meta_description), 'no HTML in title/meta');
    for (const re of EXCLUDED) assert.ok(!re.test(Object.values(r).join(' ')), `excluded keyword ${re} (user removed it)`);
  });
}
