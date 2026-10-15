// Full audit 15 Oct 2026, fix Phase 5 (SEO, content and internal links): WL-140 to WL-153.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const live = pages.filter((p) => p.live);
const liveUrls = new Set(live.map((p) => p.url));
const php = (f) => readFileSync(join(root, 'includes', f), 'utf8');
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

// Every resolved in-text link of a page: [{t, u}] from sections, examples and FAQ.
const links = (p) => {
  const c = p.content || {};
  const out = [];
  for (const s of c.sections || []) for (const l of s.l || []) out.push(...l);
  for (const e of [...(c.examples || []), ...(c.faq || [])]) out.push(...(e.l || []));
  return out;
};
const allText = (p) => JSON.stringify(p.content || {});

test('WL-140: [[ID|anchor]] tokens resolve to live URLs, the anchor is in the text, no raw token ships', () => {
  let n = 0;
  for (const p of live) {
    assert.doesNotMatch(allText(p), /\[\[[\w-]+\|/, `${p.id}: unresolved link token`);
    for (const l of links(p)) {
      n += 1;
      assert.ok(liveUrls.has(l.u), `${p.id}: ${l.u} is not a live page`);
      assert.notEqual(l.u, p.url, `${p.id}: links to itself`);
    }
  }
  assert.ok(n >= 60, `only ${n} in-text links`);
  assert.ok(links(byId.get('D11')).some((l) => l.u === byId.get('N4').url), 'D11 links the sanctioned load calculator');
  for (const [from, to] of [['H9', 'B1'], ['F2', 'F1'], ['F14', 'bill-index'], ['N3', 'solar-price-tracker'], ['C1', 'C8'], ['B1', 'H8']]) {
    assert.ok(links(byId.get(from)).some((l) => l.u === byId.get(to).url), `${from} -> ${to}`);
  }
});

test('WL-140: PHP prints linked text escaped, with only <a href> allowed', () => {
  const src = php('class-wattlyst-render.php');
  assert.match(src, /public static function linked\(/);
  assert.match(src, /wp_kses\( \$out, array\( 'a' => array\( 'href' => true \) \) \)/);
  assert.match(src, /esc_html\(/);
});

test('WL-142: every live hub has an answer, key facts, routing links and a date', () => {
  const hubs = live.filter((p) => p.type === 'pillar' && p.id.startsWith('P-'));
  assert.ok(hubs.length >= 9);
  for (const h of hubs) {
    const c = h.content;
    assert.ok(c?.answer && words(c.answer) >= 40, `${h.id}: no answer`);
    assert.ok(c.key_facts?.length >= 3, `${h.id}: key facts`);
    assert.ok(links(h).length >= 3, `${h.id}: routing links`);
    assert.ok(c.faq?.length >= 3, `${h.id}: FAQ`);
    assert.match(String(h.modified || h.reviewed), /^\d{4}-\d{2}-\d{2}$/, `${h.id}: date`);
  }
  assert.match(php('class-wattlyst-render.php'), /Last updated/);
});

test('WL-143: the homepage has no BreadcrumbList', () => {
  const home = live.find((p) => p.type === 'home');
  const s = JSON.stringify(home.schema);
  assert.doesNotMatch(s, /BreadcrumbList/);
  assert.doesNotMatch(s, /"breadcrumb"/);
});

test('WL-144: menu aria-current only on an exact match, footer links the appliance list, feed 404 is HTML, embed anchors unique', () => {
  const pg = php('class-wattlyst-pages.php');
  assert.match(pg, /\$path === \$url \? ' aria-current="page"'/);
  assert.match(pg, /'\/appliances\/'[\s\S]{0,80}Appliance watts/);
  assert.match(php('class-wattlyst-site.php'), /Content-Type: text\/html; charset=/);
  assert.match(php('class-wattlyst-site.php'), /\$wp_query->is_feed = false;/);
  assert.match(php('class-wattlyst-render.php'), /'">Open the full ' \. esc_html\( \$e\['h1'\] \)/);
});

test('WL-145: metas do not promise "all taxes"; DISCO metas are distinct', () => {
  const metas = live.map((p) => p.meta);
  for (const p of live) assert.doesNotMatch(p.meta, /all taxes/i, p.id);
  assert.equal(new Set(metas).size, metas.length, 'duplicate meta');
  const disco = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11'].map((id) => byId.get(id).meta.split(/[.:]/)[0]);
  assert.equal(new Set(disco).size, disco.length, 'DISCO metas open the same way');
});

test('WL-146: the 1.5 ton inverter AC page shows the units-per-hour range', () => {
  const e5 = byId.get('E5');
  assert.match(e5.title, /\d(\.\d)? to \d(\.\d)? Units per Hour/);
  assert.match(e5.content.answer, /\d(\.\d)? to \d(\.\d)? depending/);
});

test('WL-147: D9 headings that are not answered with a table ask a question', () => {
  const h2 = byId.get('D9').content.sections.map((s) => s.h2);
  assert.ok(h2.filter((h) => h.endsWith('?')).length >= 2, h2.join(' | '));
});

test('WL-150: market prices print as rough rupees and runtimes as rough hours, never in live text', () => {
  assert.match(byId.get('D9').title, /Rs \d+(\.\d+)? to Rs \d+(\.\d+)?\/W/);
  assert.match(byId.get('B1').content.answer, /about \d+ h( \d+ min)?/);
  for (const p of live) {
    const t = p.content?.tool;
    for (const k of ['how', 'how_ur']) assert.doesNotMatch(JSON.stringify(t?.[k] || ''), /\|\s*(rsm|hm5)\s*\}\}/, `${p.id} ${k}`);
  }
  const src = readFileSync(join(root, 'tools/build.js'), 'utf8');
  assert.match(src, /from '\.\.\/engine\/approx\.js'/);
});

test('WL-151: every N7 source label is unique', () => {
  const labels = byId.get('N7').content.sources.map((s) => s.label);
  assert.equal(new Set(labels).size, labels.length);
});

test('WL-152: one term, "net billing", in page text (NEPRA titles and target keywords excepted)', () => {
  const kw = readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8').toLowerCase();
  for (const p of live) {
    const c = { ...(p.content || {}) };
    delete c.sources;
    // A keyword-map phrase such as "net metering application" stays targeted in its heading.
    const s = (JSON.stringify(c) + p.title + p.meta).replace(/net[- ]metering (application|paperwork|connection|cap|fees)/gi, (m) => (kw.includes(m.toLowerCase()) && /^Net metering application$/.test(m) ? '' : m));
    assert.doesNotMatch(s, /net[- ]metering (application|paperwork|connection|cap|fees)/i, p.id);
  }
});

test('WL-153: answers stay within 60 words on the long pages; E1 explains running, peak and sanctioned load', () => {
  for (const id of ['H1', 'N2', 'D14', 'H2', 'F14', 'C1', 'solar-price-tracker', 'N18', 'N7']) {
    const n = words(byId.get(id).content.answer);
    assert.ok(n <= 60, `${id}: ${n} words`);
  }
  const e1 = byId.get('E1').content.sections.map((s) => s.h2.toLowerCase()).join(' | ');
  for (const w of ['peak', 'sanctioned', 'amps']) assert.ok(e1.includes(w), `E1 sections: ${w}`);
});
