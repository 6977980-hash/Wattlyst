// GSC audit part 2, batch 1 (owner approved 22 Nov 2026): 15 calculator pages leave the shared H2 skeleton
// ("How this result was calculated / Key facts / Formula / Worked examples / Common mistakes / FAQ / Sources /
// Related calculators"). Each sets its own block order and page-named headings in content `layout`; the how text and
// the formula share one section. Report: /mnt/project-files/wattlyst-page-quality-compare-2026-11-22.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const render = readFileSync(join(root, 'includes/class-wattlyst-render.php'), 'utf8');

const BATCH1 = ['H3', 'C6', 'H4', 'C7', 'H5', 'C5', 'E4', 'B3', 'E3', 'N4', 'H7', 'N8', 'D15', 'N9', 'N18'];
const SHARED = ['how this result was calculated', 'key facts', 'formula', 'worked examples', 'common mistakes', 'frequently asked questions', 'related calculators', 'sources'];

// The H2s in the order Wattlyst_Render::laid_out() prints them.
const h2s = (c) => [...c.layout.order.flatMap((b) => {
  const s = /^s(\d+)$/.exec(b);
  if (s) return [c.sections[+s[1]].h2];
  if (b === 'table') return [c.table.caption];
  if (b === 'tables') return c.tables.map((t) => t.caption);
  return [c.layout.h2[b]];
}), c.layout.h2.sources];

test('batch 1: exactly the 15 owner-approved pages have their own layout', () => {
  const withLayout = pages.filter((p) => p.content?.layout).map((p) => p.id).sort();
  assert.deepEqual(withLayout, [...BATCH1].sort());
  for (const id of BATCH1) assert.ok(byId.get(id).live, `${id} live`);
});

test('batch 1: no shared template heading, every block listed once, no two pages with the same order', () => {
  const seqs = new Map();
  const orders = new Map();
  for (const id of BATCH1) {
    const c = byId.get(id).content;
    const seq = h2s(c);
    for (const h of seq) {
      assert.ok(typeof h === 'string' && h.trim(), `${id}: empty H2`);
      assert.ok(!SHARED.includes(h.toLowerCase()), `${id}: shared heading "${h}"`);
      assert.doesNotMatch(h, /\{\{|\}\}|NaN|undefined/, `${id}: ${h}`);
    }
    assert.equal(new Set(seq).size, seq.length, `${id}: an H2 repeats`);
    assert.equal(c.layout.order.filter((b) => /^s\d+$/.test(b)).length, c.sections.length, `${id}: every text section placed`);
    for (const b of ['how', 'facts', 'examples', 'table', 'mistakes', 'faq', 'related']) assert.ok(c.layout.order.includes(b), `${id}: ${b} kept`);
    const key = seq.join(' | ');
    assert.ok(!seqs.has(key), `${id} has the same H2 sequence as ${seqs.get(key)}`);
    seqs.set(key, id);
    const shape = c.layout.order.map((b) => (/^s\d+$/.test(b) ? 's' : b)).join(',');
    assert.ok(!orders.has(shape), `${id} has the same block order as ${orders.get(shape)}`);
    orders.set(shape, id);
  }
});

test('batch 1: numbers, FAQ, Quick answers and sources stay as they were', () => {
  for (const id of BATCH1) {
    const p = byId.get(id);
    const c = p.content;
    assert.ok(c.tool.how?.text && c.formula?.text, `${id}: how text and formula both kept (one section)`);
    assert.ok(c.faq.length >= 6, `${id}: FAQ kept`);
    const faqLd = [p.schema].flat().flatMap((s) => (s['@graph'] || [s])).find((s) => s['@type'] === 'FAQPage');
    assert.equal(faqLd?.mainEntity?.length, c.faq.length, `${id}: FAQPage schema matches the FAQ`);
    assert.ok(c.sources.length > 0, `${id}: sources kept`);
  }
  for (const id of ['H3', 'C6', 'C7', 'H4', 'H5', 'B3', 'E4']) assert.ok(byId.get(id).content.quick, `${id}: Quick answer from PR #62 kept`);
});

test('renderer: layout pages print the page order, one how + formula section with the live hook, sources last', () => {
  assert.match(render, /if \( ! empty\( \$this->c\['layout'\] \) \) \{\s*return \$out \. \$this->laid_out\(\)/);
  assert.match(render, /private function method\( string \$h2 \): string \{[\s\S]*?data-wl-how[\s\S]*?wl-eq/);
  assert.match(render, /\$this->author_box\(\) \. \$this->sources\( \$h\['sources'\] \)/);
  // Ads (off today): unit 1 only after the block that follows the how section, unit 2 above the mistakes, unit 3 after Related.
  const laid = render.slice(render.indexOf('private function laid_out()'), render.indexOf('private function method('));
  assert.match(laid, /! \$ad1 && \$how \) \{\s*\$out \.= \$this->ad\( 'content-1' \)/);
  assert.equal([...laid.matchAll(/\$this->ad\( '([\w-]+)' \)/g)].map((x) => x[1]).join(), 'content-2,content-3,content-1');
  // The default template is untouched for every other page.
  assert.match(render, /\$out \.= empty\( \$this->c\['layout'\] \) \? \$this->how\(\) : '';/);
});
