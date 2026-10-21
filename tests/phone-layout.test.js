// 21 Oct 2026 audit, fix Phase 6 (phone layout and navigation): WL-198, WL-238, WL-202, WL-204, WL-200, WL-239, WL-205.
// The live layout is also checked in a browser on every page by tools/browser-check.js (Next step, embed order).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const read = (f) => readFileSync(join(root, f), 'utf8');
const render = read('includes/class-wattlyst-render.php');
const css = read('assets/css/wattlyst.css');
const home = read('assets/css/wattlyst-home.css');
const fn = (name) => render.slice(render.indexOf(`function ${name}(`), render.indexOf('\n\t}\n', render.indexOf(`function ${name}(`)));

test('WL-198: the Next step and two related tools sit right under the result, from the same next/related data', () => {
  const tool = fn('tool');
  assert.match(tool, /\$share \. \( \$home \? '' : \$this->next_inline\(\) \)/, 'Next step printed after the share bar, inside the result block');
  const next = fn('next_inline');
  assert.match(next, /\$this->page\['next'\]/);
  assert.match(next, /count\( \$more \) < 2/, 'two related links, not the whole list');
  assert.match(next, /if \( \$this->embed \)/, 'no links out of an embed but the credit');
  assert.match(fn('lookup'), /\$this->next_inline\(\)/, 'the error-code lookup has one too');
  assert.match(fn('related'), /wl-next/, 'the full Related list stays at the bottom');
  // Every live tool page has a live Next step to show.
  for (const p of pages.filter((x) => x.live && x.content?.tool && x.type !== 'home')) {
    assert.ok(p.next && byId.get(p.next)?.live, `${p.id}: no live Next step`);
  }
  const check = read('tools/browser-check.js');
  assert.match(check, /\.wl-next-inline/, 'the CI browser check measures it');
  assert.match(check, /gap > 400/);
});

test('WL-238: the iframe embed prints the result first and list calculators get a taller frame', () => {
  assert.match(fn('tool'), /\$this->embed \? \$out \. \$inputs : \$inputs \. \$out/);
  const site = JSON.parse(read('data/site.json'));
  assert.ok(site.embed.iframe_height_list > site.embed.iframe_height);
  const embeds = byId.get('embed').content.embeds;
  const h = (id) => Number(/height="(\d+)"/.exec(embeds.find((e) => e.id === id).iframe)[1]);
  assert.equal(h('E1'), site.embed.iframe_height_list, 'E1 has an appliance list');
  assert.equal(h('C1'), site.embed.iframe_height_list);
  assert.equal(h('A1'), site.embed.iframe_height, 'A1 has a short form');
  const e = fn('embeds');
  assert.ok(e.indexOf('-script">') < e.indexOf('-iframe">'), 'script code (resizes itself) listed first');
});

test('WL-202: error codes show a count with a jump while filtered, and stack as cards on a phone', () => {
  assert.match(fn('lookup'), /data-wl-count role="status" hidden/);
  const js = read('assets/js/wattlyst-page.js');
  assert.match(js, /codes match/);
  assert.match(js, /lastChild\.href = `#\$\{first\.id\}`/, 'jump to the first matching brand table');
  assert.match(fn('tables'), /ref_table\( \$t, ' data-wl-group="' \. esc_attr\( \$t\['key'\] \) \. '"', true \)/, 'brand tables stacked');
  assert.match(fn('ref_table'), /data-l="/, 'each cell carries its column name for the card');
  assert.match(css, /@media \(max-width:768px\)\{[^@]*\.wl-stack :is\(table,tbody,tr,td\)\{display:block\}/);
  assert.match(css, /\.wl-stack td::before\{content:attr\(data-l\)/);
});

test('WL-204: list calculators put the result beside the list on wide screens', () => {
  assert.match(render, /\$list = in_array\( 'loads', array_column\( \$this->c\['tool'\]\['fields'\], 'type' \), true \);\s*\$out \.= \$this->tool\( \$list \);/);
  assert.match(css, /@media \(min-width:1100px\)\{\.wl-tool-list\{display:grid;grid-template-columns:minmax\(0,1fr\) 19rem/);
  assert.match(css, /\.wl-tool-list>\.wl-in\{grid-column:1;grid-row:1\}/, 'inputs pinned to column 1, so an error cannot swap the columns (as WL-90)');
  assert.match(css, /@media \(min-width:1100px\) and \(min-height:960px\)\{\.wl-tool-list>\.wl-out\{position:sticky/, 'sticky only where the column fits');
  assert.ok(!/\.wl-page \.wl-out-title\{/.test(home), 'the column title style is shared, not home-only');
});

test('WL-200: hub pages group their calculators under the task sections, each live child exactly once', () => {
  const pillar = render.slice(render.indexOf("'pillar' === $type"), render.indexOf("} else {", render.indexOf("'pillar' === $type")));
  assert.ok(pillar.indexOf('children()') < pillar.indexOf('key_facts()'), 'task groups before the key facts');
  assert.match(pillar, /\$this->sections\( false, true \)/, 'grouped sections are not printed twice');
  assert.match(fn('children'), /<section class="wl-group"><h2>/, 'every card list has a heading');
  // Same rule as groups(): a section owns the live children it links, first link wins.
  for (const p of pages.filter((x) => x.type === 'pillar' && x.live)) {
    const urls = new Map(p.children.map((id) => byId.get(id)).filter((r) => r?.live).map((r) => [r.url, r.id]));
    const used = new Set();
    let grouped = 0;
    for (const s of p.content.sections || []) {
      const own = (s.l || []).flat().map((l) => l.u).filter((u) => urls.has(u) && !used.has(u) && used.add(u));
      if (own.length) grouped += 1;
    }
    if (p.id.startsWith('P-') && p.children.length > 2) assert.ok(grouped > 0, `${p.id}: no section groups its calculators`);
  }
  const solar = byId.get('P-D');
  const first = (solar.content.sections[0].l || []).flat().map((l) => l.u);
  assert.ok(first.includes(byId.get('D7').url), 'the solar hub starts with sizing from units');
});

test('WL-239: reference tables of appliances or sets name each row in a row-header column', () => {
  assert.match(fn('ref_table'), /<th scope="row">/);
  for (const id of ['C1', 'C2', 'C3', 'C4', 'D4', 'E2']) {
    const t = byId.get(id).content.table;
    assert.equal(t.row_head, true, id);
    assert.equal(t.head.length, t.rows[0].length, `${id}: one head per column`);
    assert.ok(t.rows.every((r) => r[0] && !/\d+\s*(W|kVA|units)$/.test(r[0])), `${id}: first cell is a name`);
    assert.ok(!/from the top/.test(t.caption) && t.caption.length < 80, `${id}: short caption, the names are in the rows`);
  }
});

test('WL-205: small phone fixes stay in place', () => {
  assert.match(css, /body \.site-info \.wl-footer a\{display:inline-flex;align-items:center;min-height:44px/, 'footer links 44 px tall');
  assert.match(css, /\.wl-check input\[type=checkbox\]\{width:22px;height:22px/, 'checkbox 22 px');
  assert.match(css, /body\.error404 \.entry-title\{[^}]*font-weight:800[^}]*color:var\(--wl-accent\)/, '404 heading in the brand style');
  assert.match(css, /\.wl-table-wrap\{[^}]*no-repeat local/, 'scroll cue: an edge shadow while a table can scroll');
  assert.match(home, /\.wl-hero-cats-title\{[^}]*color:#ffd27a\}/, 'BROWSE BY TASK at 4.5:1 on the hero gradient');
  assert.match(fn('catalog_groups'), /\$groups\[ \$a\['category'\] \]\[\] = \$a\['id'\]/, 'one picker group per category');
  assert.match(fn('home_hero'), /free calculators/, 'calculators and guides counted apart');
  assert.ok(!/free tools/.test(render));
  assert.match(fn('loads_row'), /'Starting watts', ' placeholder="auto"'/, 'short per-row label; the field hint explains blank');
  for (const id of ['A1', 'A2']) {
    for (const f of byId.get(id).content.tool.fields) for (const o of f.options || []) assert.ok(o[1].length <= 34, `${id}: "${o[1]}" is cut at 375 px`);
  }
});
