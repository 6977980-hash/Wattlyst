// Urdu version, Phase U1 (owner OW-8, plan in the project folder urdu/urdu-version-plan.md): Urdu pages under /ur/
// built from specs/keyword-map-ur.csv and content/ur/, the same engine numbers as their English page, hreflang only
// between live pairs, the Nastaliq font and RTL styles only on Urdu pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { parseCsv } from '../tools/lib/csv.js';
import { build } from '../tools/build.js';

const read = (f) => readFileSync(join(root, f), 'utf8');
const pagesOf = (files) => Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const files = await build();
const pages = pagesOf(files);
// The drafts as they will be once the csv status says publish (local preview, tools/build.js opts.urLive).
const preview = pagesOf(await build({ urLive: true }));
const byId = (list) => new Map(list.map((p) => [p.id, p]));
const P = byId(preview);
const rows = parseCsv(read('specs/keyword-map-ur.csv'));
const URDU = /[؀-ۿ]/;

test('every Urdu row has an English twin, a /ur/ URL with the same slug and an Urdu title and meta', () => {
  assert.ok(rows.length >= 5);
  const urls = new Set();
  for (const r of rows) {
    const en = P.get(r.en_id);
    assert.ok(en, `${r.id}: English page ${r.en_id}`);
    assert.ok(r.url === '/ur/' || r.url === `/ur${en.url}`, `${r.id}: ${r.url}`);
    assert.ok(!urls.has(r.url), `${r.id}: one URL per page`);
    urls.add(r.url);
    assert.ok(['draft', 'publish'].includes(r.status), `${r.id}: status`);
    assert.match(r.title, URDU, `${r.id}: Urdu title`);
    assert.match(r.title, / \| Wattlyst$/, `${r.id}: brand at the end of the title (seo-rules.md)`);
    assert.match(r.meta_description, URDU, `${r.id}: Urdu meta`);
    assert.ok(r.meta_description.length <= 160, `${r.id}: meta ${r.meta_description.length} characters`);
  }
});

test('Urdu page text has no typed numbers (rule 8): every figure is a {{placeholder}} or a listed fixed fact', () => {
  for (const f of readdirSync(join(root, 'content/ur/pages'))) {
    const c = JSON.parse(read(`content/ur/pages/${f}`));
    const en = JSON.parse(read(`content/pages/${f}`));
    const allowed = [...(en.literal_numbers || []), ...(c.literal_numbers || [])].sort((x, y) => y.length - x.length); // "8118" before "118"
    const texts = [c.h1, c.answer, c.intro, c.how, c.safety, ...(c.key_facts || []), ...(c.mistakes || []), ...(c.faq || []).flatMap((x) => [x.q, x.a]),
      ...(c.examples || []).flatMap((x) => [x.title, x.text]), c.table?.caption, ...(c.table?.labels || []), ...(c.sections || []).flatMap((s) => [s.h2, ...(s.p || [])]),
      ...Object.values(c.fields || {}).flatMap((x) => [x.label, x.hint, x.placeholder]), ...Object.values(c.outputs || {})].filter((x) => typeof x === 'string' && x);
    for (const t of texts) {
      let s = t.replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[[\w-]+\|/g, '');
      for (const a of allowed) s = s.split(a).join('');
      assert.ok(!/[\d۰-۹]/.test(s), `${f}: typed number in "${t}"`);
    }
  }
});

test('an Urdu calculator prints the same engine numbers as its English page (rule 8)', () => {
  for (const p of preview.filter((x) => x.lang === 'ur' && x.content?.tool)) {
    const en = P.get(p.en);
    const t = p.content.tool;
    assert.equal(t.calc, en.content.tool.calc);
    assert.deepEqual(t.fields.map((f) => [f.name, f.default]), en.content.tool.fields.map((f) => [f.name, f.default]), `${p.id}: same fields and defaults`);
    for (const o of t.outputs) {
      const e = en.content.tool.outputs.find((x) => x.key === o.key);
      assert.ok(e, `${p.id}: ${o.key}`);
      if (o.yn) assert.equal(o.value, o.yn[e.value === 'Yes' ? 0 : 1], `${p.id}: ${o.key} yes/no`);
      else assert.equal(o.value, e.value, `${p.id}: ${o.key}`);
      assert.match(o.label, URDU, `${p.id}: ${o.key} has an Urdu label`);
      assert.equal(o.label_ur, undefined, `${p.id}: no Roman Urdu toggle on an Urdu page`);
    }
    for (const f of t.fields) assert.match(f.label, URDU, `${p.id}: field ${f.name} has an Urdu label`);
    assert.match(t.submit, URDU);
    if (t.notice) assert.match(t.notice, URDU, `${p.id}: Urdu notice`);
    for (const [code, text] of Object.entries(t.msg)) assert.match(text, URDU, `${p.id}: ${code}`);
    assert.equal(p.content.examples.length, en.content.examples.length, `${p.id}: one example per English example`);
  }
});

test('drafts stay off the live site: no hreflang, no Urdu in llms.txt, no Urdu link on an English page', () => {
  for (const r of rows.filter((x) => x.status === 'draft')) {
    const p = pages.find((x) => x.id === r.id);
    assert.equal(p.live, false, `${r.id} is a draft`);
    assert.equal(p.alt, undefined);
    assert.equal(pages.find((x) => x.id === r.en_id).alt, undefined, `${r.en_id} links no draft`);
  }
  const llms = files['generated/llms.txt'];
  for (const r of rows.filter((x) => x.status === 'draft')) assert.ok(!llms.includes(r.url), `${r.id} not in llms.txt`);
  const home = pages.find((p) => p.type === 'home');
  assert.ok(home.cards.every((c) => !c.url.startsWith('/ur/')), 'the English home lists English hubs only');
});

test('published Urdu pages: hreflang pairs both ways, parents under /ur/, links to Urdu twins, Urdu breadcrumb', async () => {
  for (const p of preview.filter((x) => x.lang === 'ur')) {
    const en = P.get(p.en);
    assert.ok(p.live, `${p.id} live in the preview`);
    assert.deepEqual(p.alt, { en: en.url, ur: p.url }, `${p.id}: alt`);
    assert.deepEqual(en.alt, p.alt, `${p.en}: alt back`);
    assert.equal(p.breadcrumb[0].url, '/ur/');
    if (p.url !== '/ur/') {
      const parent = P.get(p.parent);
      assert.ok(parent && parent.live && parent.url.startsWith('/ur/'), `${p.id}: parent ${p.parent}`);
    }
    assert.equal(p.schema['@graph'].find((g) => g['@type'] === 'WebPage' || g['@type'] === 'CollectionPage' || g['@type'] === 'AboutPage' || g['@type'] === 'ContactPage').inLanguage, 'ur');
    // Every in-text link goes to the Urdu twin when there is one, else to a live English page.
    const links = JSON.stringify(p.content).match(/"u":"[^"]+"/g) || [];
    for (const l of links) {
      const u = l.slice(5, -1);
      if (!u.startsWith('/')) continue;
      const target = preview.find((x) => x.url === u);
      if (!target) continue; // a source link (methodology) or a data CSV
      assert.ok(target.live, `${p.id} links ${u}`);
      if (target.lang !== 'ur') assert.ok(!P.get(`ur-${target.id}`) || target.type === 'home', `${p.id} links the English ${u} although it has an Urdu twin`);
    }
    for (const r of [...(p.related || []), p.next].filter(Boolean)) if (P.get(`ur-${r}`)) assert.fail(`${p.id}: related ${r} should be its Urdu twin`);
  }
  assert.ok(P.get('ur-P-F').children.includes('ur-F2'), 'the Urdu bills hub lists the Urdu bill pages');
  assert.ok(P.get('ur-H1').children.includes('ur-P-F'), 'the Urdu home lists the Urdu hubs');
  assert.ok(!P.get('ur-H1').children.some((id) => P.get(id).type === 'trust'), 'trust pages are not hub cards');
  const llms = (await build({ urLive: true }))['generated/llms.txt'];
  assert.match(llms, /## Urdu/);
});

test('Urdu font and right-to-left styles: small, subset, only on Urdu pages', () => {
  const css = read('assets/css/wattlyst-ur.css');
  assert.ok(!css.includes('<'), 'inlined through wp_strip_all_tags');
  assert.ok(Buffer.byteLength(css) < 8 * 1024, `Urdu CSS is ${Buffer.byteLength(css)} bytes`);
  assert.match(css, /src:url\(%FONT%\)/, 'the PHP puts the versioned font URL in');
  assert.match(css, /font-display:swap/);
  // Digits are not in the font's range, so results and tables keep the theme font (plan section 3).
  const range = /unicode-range:([^}]+)\}/.exec(css)[1];
  assert.ok(!/U\+00|U\+003|U\+06F0/.test(range), range);
  const font = statSync(join(root, 'assets/fonts/noto-nastaliq-urdu.woff2')).size;
  assert.ok(font < 150 * 1024, `font is ${font} bytes`);
  assert.match(read('assets/fonts/OFL.txt'), /SIL Open Font License/);
  const head = read('includes/class-wattlyst-head.php');
  assert.match(head, /if \( \$ur \) \{\s*\$files\['wattlyst-ur-css'\][\s\S]*?rel="preload"[^\n]*as="font"/, 'font preload and Urdu CSS only when the page is Urdu');
  assert.match(head, /'ur' === \( \$page\['lang'\] \?\? '' \) \? 'lang="ur" dir="rtl"'/);
  assert.match(head, /hreflang="%s"/);
  // Header, menu and footer stay English and left to right on Urdu pages (owner, 30 Oct 2026); the footer lists English trust pages only.
  assert.match(css, /\.site-header,[^{]*\.site-footer,[^{]*\.wl-footer\{direction:ltr;text-align:left/);
  assert.match(read('includes/class-wattlyst-pages.php'), /'trust', 'embed' \), true \) && ! empty\( \$row\['live'\] \) && empty\( \$row\['lang'\] \)/);
});

test('every phrase the PHP translates on an Urdu page has its Urdu words in content/ur/ui.json', () => {
  const ui = JSON.parse(read('content/ur/ui.json'));
  const render = read('includes/class-wattlyst-render.php');
  const keys = [...render.matchAll(/\$this->t\( '([^']+)' \)/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  for (const k of keys) assert.ok(ui[k], `ui.json: ${k}`);
  for (const k of ['Last updated', 'Last reviewed', 'Updated', 'Reviewed', 'More {h}', 'All {h}', 'yes', 'no', 'January', 'December']) assert.ok(ui[k], k);
});

test('Urdu pages add no JavaScript: the browser chain stays within the budget', () => {
  const js = read('assets/js/wattlyst-tool.js');
  assert.ok(!URDU.test(js) && !URDU.test(read('engine/messages.js')), 'no Urdu text in the shared scripts');
  // Urdu words reach the browser as page data (tool msg, output yn), not as code.
  const f2 = P.get('ur-F2').content.tool;
  assert.ok(Object.keys(f2.msg).length > 0);
});
