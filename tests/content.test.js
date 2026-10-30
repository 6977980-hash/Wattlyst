// Phase 3 content checklist (build-plan.md "Content checklist", seo-rules.md 3, 5, 6) and the link graph:
// every live page is reachable from at least 3 other live pages and links out to 4-8 (pillar + Next step + related).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { parseCsv } from '../tools/lib/csv.js';
import { build } from '../tools/build.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const live = pages.filter((p) => p.live);
const kw = new Map(parseCsv(readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8')).map((r) => [r.id, r]));
const STOP = new Set('a an the to for of in on and or my do i is can what how much many with by per vs at it run need'.split(' '));
const tokens = (s) => (s.toLowerCase().match(/[a-z0-9.]+/g) || []).filter((t) => !STOP.has(t));
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

for (const p of live.filter((x) => ['tool', 'appliance', 'guide', 'pillar', 'home', 'lookup', 'data'].includes(x.type) && x.content)) {
  test(`content checklist: ${p.id} ${p.url}`, () => {
    const c = p.content;
    const row = kw.get(p.id);
    if (row) {
      const missing = tokens(row.primary_keyword.replace('(brand)', '')).filter((t) => !tokens(p.h1).includes(t));
      assert.deepEqual(missing, [], `H1 "${p.h1}" must contain the primary keyword words`);
    }
    if (p.type === 'pillar' && !c.sections?.length) return; // bare hub: children list only
    const n = words(c.answer);
    assert.ok(n >= 40 && n <= 75, `direct answer is ${n} words (40-60 target, seo-rules.md 5)`);
    assert.ok((c.key_facts || []).length >= 3, 'at least 3 key facts (seo-rules.md 6)');
    assert.ok((c.faq || []).length >= 4 && c.faq.length <= 8, `${(c.faq || []).length} FAQs (4-8)`);
    assert.ok(p.reviewed || (p.type === 'pillar' && p.modified), 'last reviewed date (a hub: its newest page, WL-142)');
    assert.ok((c.sources || []).length >= 1, 'sources');
    if (p.type === 'data') {
      assert.ok(c.chart?.groups?.length >= 3, 'data page chart');
      assert.ok(c.tables?.length >= 2 && c.tables.every((t) => t.rows.length >= 5), 'data tables with 5+ rows');
      assert.ok(c.download?.url && files[`generated${c.download.url}`], 'CSV download built');
      assert.ok(c.sections.some((s) => /journalists/i.test(s.h2)) && c.sections.some((s) => /method/i.test(s.h2)), 'method and press summary sections');
      const age = (Date.parse(p.reviewed) - Date.parse(c.download.checked)) / 864e5;
      assert.ok(age <= 35, `data checked ${c.download.checked} is more than 35 days before the review date`);
    }
    if (p.type === 'lookup') {
      assert.ok(c.lookup && c.tables?.length >= 3 && c.tables.every((t) => t.rows.length >= 5), 'lookup tables with 5+ rows each');
      for (const t of c.tables) for (const r of t.rows) assert.ok(r.every((v) => String(v).trim() !== ''), `${t.key}: empty cell`);
    }
    if (p.type === 'tool' || p.type === 'appliance') {
      assert.ok(c.tool, 'calculator');
      assert.ok(c.tool.how?.text, '"How this result was calculated" text');
      assert.ok(c.formula?.text, 'formula section');
      assert.ok(c.examples.length >= 3 && c.examples.length <= 5, `${c.examples.length} worked examples (3-5)`);
      assert.ok(c.table && c.table.rows.length >= 5 && c.table.rows.length <= 8, 'reference table with 5-8 rows');
      assert.ok((c.mistakes || []).length >= 3, 'at least 3 common mistakes');
      assert.ok(c.faq.length >= 5, 'at least 5 FAQs on a tool page');
      if (['B', 'C', 'D', 'W'].includes(p.silo)) assert.ok(/licensed electrician/i.test(c.safety || ''), 'safety note naming a licensed electrician');
      for (const f of c.tool.fields) assert.ok(f.label, `field ${f.name} has a label`);
      // An optional output (absent for some inputs) may start empty; its card is then hidden (render: wl-result hidden).
      for (const o of c.tool.outputs) assert.ok((o.value !== '' || o.optional) && !/NaN|Infinity|-/.test(o.value) || o.spec === 'raw', `${o.key} default value "${o.value}"`);
    }
  });
}

test('link graph: every live page has 3+ inbound links and tool pages link out to 4-8 live pages', () => {
  const inbound = new Map(live.map((p) => [p.id, new Set()]));
  const outbound = new Map();
  for (const p of live) {
    const out = new Set();
    for (const r of [...(p.related || []), p.next, p.parent].filter(Boolean)) if (byId.get(r)?.live) out.add(r);
    for (const cid of p.children || []) if (byId.get(cid)?.live) out.add(cid);
    for (const card of p.cards || []) { if (byId.get(card.id)?.live) out.add(card.id); for (const ch of card.children) if (byId.get(ch.id)?.live) out.add(ch.id); }
    outbound.set(p.id, out);
    for (const r of out) inbound.get(r).add(p.id);
  }
  const problems = [];
  for (const p of live) {
    if (p.type === 'trust' || p.type === 'home' || p.type === 'embed') continue; // linked from every page's footer
    if (inbound.get(p.id).size < 3) problems.push(`${p.id} has only ${inbound.get(p.id).size} inbound links (${[...inbound.get(p.id)].join(', ')})`);
    if (['tool', 'appliance', 'guide', 'lookup', 'data'].includes(p.type)) {
      const n = outbound.get(p.id).size;
      if (n < 4 || n > 8) problems.push(`${p.id} links out to ${n} live pages (4-8)`);
    }
  }
  assert.deepEqual(problems, []);
});

test('home page lists every live hub and every live tool is under a live hub', () => {
  const home = live.find((p) => p.type === 'home');
  assert.ok(home, 'home page live');
  // The English home lists the English hubs; the Urdu home (a pillar at /ur/) lists the Urdu hubs.
  const hubs = live.filter((p) => p.type === 'pillar' && !p.lang).map((p) => p.id).sort();
  assert.deepEqual(home.cards.map((c) => c.id).sort(), hubs);
  const urHome = live.find((p) => p.url === '/ur/');
  for (const h of live.filter((p) => p.type === 'pillar' && p.lang === 'ur' && p !== urHome)) assert.ok(urHome?.children.includes(h.id), `${h.id} on the Urdu home`);
  for (const p of live.filter((x) => ['tool', 'guide', 'appliance', 'lookup'].includes(x.type))) assert.ok(p.parent && byId.get(p.parent).live, `${p.id} under a live hub`);
});
