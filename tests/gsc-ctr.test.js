// GSC audit 11 Nov 2026, part 1 (owner approved #4, #5, #7, #10, #11): answer-first titles and a Quick answer on
// the page-1 pages, Roman Urdu FAQ items in the FAQPage schema, hubs as task directories with broad titles,
// and in-text links to the weakly linked pages. Report: /mnt/project-files/wattlyst-gsc-audit-2026-11-11.md.
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
const render = readFileSync(join(root, 'includes/class-wattlyst-render.php'), 'utf8');
const css = readFileSync(join(root, 'assets/css/wattlyst.css'), 'utf8');

// Page id -> the engine output its Quick answer must print (the default result on the page).
const PAGE1 = { H3: 'running_w', C6: 'standard_kva', C7: 'max_running_w', H4: 'daily_kwh', H5: 'running_w', B3: 'hours', E4: 'amps_after' };
const out = (p, key) => p.content.tool.outputs.find((o) => o.key === key).value;

test('#4: the page-1 pages carry the answer number in the title and the meta', () => {
  for (const id of Object.keys(PAGE1)) {
    const p = byId.get(id);
    assert.ok(p.live, `${id} live`);
    assert.match(p.title, /\d/, `${id}: title "${p.title}" states a number`);
    assert.match(p.meta, /\d/, `${id}: meta states a number`);
    assert.doesNotMatch(p.title + p.meta, /\{\{|\}\}|NaN|undefined/, id);
  }
  // The number in the title is the page's own result, so search result and page agree.
  assert.ok(byId.get('H5').title.includes(out(byId.get('H5'), 'running_w')));
  assert.ok(byId.get('B3').title.includes(out(byId.get('B3'), 'hours')));
  assert.ok(byId.get('H4').title.includes(out(byId.get('H4'), 'daily_kwh')));
});

test('#5: a two-sentence Quick answer with the engine result sits above the long answer', () => {
  for (const [id, key] of Object.entries(PAGE1)) {
    const q = byId.get(id).content.quick;
    assert.ok(q, `${id}: quick answer`);
    const sentences = q.split(/(?<=[a-z0-9)])\.\s+(?=[A-Z])/).length;
    assert.ok(sentences <= 2, `${id}: ${sentences} sentences`);
    assert.ok(q.split(/\s+/).length <= 45, `${id}: quick answer is ${q.split(/\s+/).length} words`);
    assert.ok(q.includes(out(byId.get(id), key)), `${id}: quick answer prints ${key} = ${out(byId.get(id), key)}`);
    assert.notEqual(q, byId.get(id).content.answer, `${id}: not a copy of the answer`);
  }
  const hero = render.slice(render.indexOf('private function hero('), render.indexOf('private function home_hero('));
  assert.ok(hero.indexOf('$this->quick()') > hero.indexOf("'</h1>'") && hero.indexOf('$this->quick()') < hero.indexOf('$this->answer('), 'H1, then Quick answer, then the answer');
  assert.match(render, /class="wl-quick"/);
  assert.match(css, /\.wl-quick\{/);
  // Pages without a quick field print nothing extra.
  assert.equal(byId.get('A1').content.quick, undefined);
});

test('#7: two or more Roman Urdu FAQ items on each page-1 page, inside the FAQPage schema', () => {
  const ru = /\b(kitne|kitna|kitni|kya|kaise|leta|leti|chahiye|chalti|ghante|mahine)\b/i;
  for (const id of Object.keys(PAGE1)) {
    const p = byId.get(id);
    const items = p.content.faq.filter((f) => ru.test(f.q));
    assert.ok(items.length >= 2 && items.length <= 3, `${id}: ${items.length} Roman Urdu FAQ items`);
    assert.ok(p.content.faq.length <= 8, `${id}: FAQ cap`);
    const schema = p.schema.find?.((n) => n['@type'] === 'FAQPage') || (p.schema['@graph'] || []).find((n) => n['@type'] === 'FAQPage');
    for (const f of items) assert.ok(schema.mainEntity.some((q) => q.name === f.q && q.acceptedAnswer.text === f.a), `${id}: "${f.q}" in FAQPage`);
  }
});

test('#10: the converters, load and wiring hubs are task directories with broad titles', () => {
  const kw = parseCsv(readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8'));
  for (const id of ['P-A', 'P-E', 'P-W']) {
    const hub = byId.get(id);
    const kids = hub.children.filter((c) => byId.get(c)?.live);
    // Every live child is linked from a task section, by a descriptive in-text anchor (not only its card).
    const linked = new Set(hub.content.sections.flatMap((s) => (s.l || []).flat()).map((l) => l.u));
    for (const c of kids) assert.ok(linked.has(byId.get(c).url), `${id}: ${c} linked from a task section`);
    const groups = hub.content.sections.filter((s) => (s.l || []).flat().some((l) => kids.some((c) => byId.get(c).url === l.u)));
    assert.ok(groups.length >= 3, `${id}: ${groups.length} task groups`);
    // The hub title never repeats a child's primary keyword, so the hub does not rank for the child's query.
    const title = hub.title.toLowerCase();
    for (const r of kw.filter((x) => kids.includes(x.id))) assert.ok(!title.includes(r.primary_keyword.toLowerCase()), `${id} title has "${r.primary_keyword}"`);
    assert.doesNotMatch(title, /calculators? \|/, `${id}: title names the list, not a calculator`);
  }
});

test('#11: the weakly linked pages get in-text links from stronger pages', () => {
  const targets = ['A2', 'A5', 'A7', 'C2', 'C3', 'C4', 'C8', 'D3', 'D9', 'H6', 'N2', 'N6', 'N8', 'N10', 'N11', 'N12', 'N14', 'N17', 'P-T', 'P-X'];
  const inText = new Map();
  for (const p of pages.filter((x) => x.live && !x.lang)) {
    const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.t && o.u) (inText.get(o.u) || inText.set(o.u, new Set()).get(o.u)).add(p.id); Object.values(o).forEach(walk); } };
    walk(p.content?.sections);
  }
  for (const id of targets) {
    const t = byId.get(id);
    assert.ok(t.live, `${id} live`);
    const from = [...(inText.get(t.url) || [])].filter((s) => s !== t.parent);
    assert.ok(from.length >= 1, `${id}: no in-text link from a page other than its hub`);
  }
});
