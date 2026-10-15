// Phase 2 guardrails: generated/ is fresh, page text has no hand-typed results, schema matches the
// visible content, trust pages and brand images exist, data/appliances.json is valid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, readJson } from './load-data.js';
import { parseCsv } from '../tools/lib/csv.js';
import { build } from '../tools/build.js';
import { fmt, render } from '../engine/format.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const manifest = JSON.parse(files['generated/manifest.json']);
const llms = files['generated/llms.txt'];
const site = readJson('data/site.json');

test('generated/ matches a fresh build (run: node tools/build.js)', () => {
  for (const [p, body] of Object.entries(files)) {
    const full = join(root, p);
    assert.ok(existsSync(full), `${p} missing`);
    assert.equal(readFileSync(full, 'utf8'), body, `${p} is stale`);
  }
  const extra = readdirSync(join(root, 'generated/pages')).filter((f) => !(`generated/pages/${f}` in files));
  assert.deepEqual(extra, [], 'stale files in generated/pages');
});

test('format: numbers are never blank, NaN or Infinity', () => {
  assert.equal(fmt(3.4, 'hm'), '3 h 24 min');
  assert.equal(fmt(0.5, 'hm'), '30 min');
  assert.equal(fmt(1.9999, 'hm'), '1 h 59 min', 'runtimes round the minutes down (WL-16)');
  assert.equal(fmt(2.0000000001, 'hm'), '2 h', 'float noise is not a lost minute');
  assert.equal(fmt(102.1, 'up'), '103', 'minimum sizes round up (WL-16)');
  assert.equal(fmt(102, 'up'), '102');
  assert.equal(fmt(2.71, 'up1'), '2.8');
  assert.equal(fmt(3.371, 'up2'), '3.38');
  assert.equal(fmt(2.6999999999999997, 'up1'), '2.7', 'float noise does not add a step');
  assert.equal(fmt(1020.4, 'int'), '1,020');
  assert.equal(fmt(0.85, 'pct'), '85%');
  assert.equal(fmt(8275.4, 'rs'), 'Rs 8,275');
  assert.equal(fmt(33.1, 'rs2'), 'Rs 33.10', 'per-unit rates keep two decimals');
  assert.equal(fmt(1234.5, 'rs2'), 'Rs 1,234.50');
  assert.equal(fmt(true, 'yesno'), 'Yes');
  assert.equal(fmt(false, 'yesno'), 'No');
  assert.equal(fmt(true), '', 'a flag without the yesno spec never prints as a number');
  assert.equal(fmt(NaN), '');
  assert.equal(fmt(Infinity), '');
  assert.equal(fmt(-0.001), '0', 'no "-0"');
  assert.equal(fmt(-0.4, 'int'), '0');
  assert.equal(fmt(-0.5, 'hm'), '-30 min');
  assert.equal(fmt(0.001, 'hm'), '< 1 min');
  assert.equal(render('{{a.b|1}} W', { a: { b: 2.25 } }), '2.3 W');
  assert.equal(render('{{missing}} W', {}), null, 'a missing value must not print a blank');
});

const siteRows = parseCsv(readFileSync(join(root, 'specs/site-pages.csv'), 'utf8'));
const kwRows = parseCsv(readFileSync(join(root, 'specs/keyword-map.csv'), 'utf8'));

test('site-pages.csv: titles, metas and URLs follow seo-rules.md 2 and never clash with keyword-map.csv', () => {
  const seen = new Map(kwRows.flatMap((r) => [[`url:${r.url}`, r.id], [`title:${r.title.toLowerCase()}`, r.id], [`meta:${r.meta_description.toLowerCase()}`, r.id]]));
  for (const r of siteRows) {
    assert.ok(['trust', 'pillar', 'data', 'embed'].includes(r.type), `${r.id}: type`);
    assert.ok(r.title.length >= 30 && r.title.length <= 60, `${r.id}: title ${r.title.length}`);
    assert.ok(r.title.endsWith('| Wattlyst'), `${r.id}: brand suffix`);
    assert.ok(r.meta_description.length >= 120 && r.meta_description.length <= 155, `${r.id}: meta ${r.meta_description.length}`);
    assert.equal(Number(r.title_len), r.title.length, `${r.id}: title_len`);
    assert.equal(Number(r.meta_len), r.meta_description.length, `${r.id}: meta_len`);
    assert.ok(/^\/([a-z0-9]+(-[a-z0-9]+)*\/)+$/.test(r.url), `${r.id}: url ${r.url}`);
    assert.ok(!/["<>]/.test(r.meta_description), `${r.id}: no quotes/HTML in meta`);
    for (const k of [`url:${r.url}`, `title:${r.title.toLowerCase()}`, `meta:${r.meta_description.toLowerCase()}`]) {
      assert.ok(!seen.has(k), `${r.id}: ${k} already used by ${seen.get(k)}`);
      seen.set(k, r.id);
    }
  }
});

test('all seven trust pages exist and are live (seo-rules.md 7)', () => {
  for (const id of ['about', 'methodology', 'editorial-policy', 'contact', 'privacy-policy', 'terms', 'disclaimer']) {
    const p = pages.find((x) => x.id === id);
    assert.ok(p && p.live, `${id} live`);
    assert.ok(p.content.html.length > 500, `${id} has content`);
    assert.ok(!/\{\{|<!--(if|block)/.test(p.content.html), `${id}: unrendered template`);
  }
  const privacy = pages.find((x) => x.id === 'privacy-policy').content.html;
  for (const must of ['third-party vendors, including google, use cookies', 'myadcenter.google.com', 'aboutads.info', 'consent']) {
    assert.ok(privacy.toLowerCase().includes(must), `privacy policy must mention: ${must}`);
  }
  assert.ok(pages.find((x) => x.id === 'contact').content.html.includes(site.contact_email));
  assert.ok(pages.find((x) => x.id === 'disclaimer').content.html.includes('licensed electrician'));
});

test('content: numbers in page text come from the engine or data/, never typed (seo-rules.md 1)', () => {
  const dir = join(root, 'content/pages');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const allowed = c.literal_numbers || [];
    const texts = [c.answer, c.intro, c.how, c.how_ur, c.safety, ...(c.key_facts || []), ...(c.mistakes || []),
      ...(c.faq || []).flatMap((x) => [x.q, x.a]), ...(c.examples || []).flatMap((x) => [x.title, x.text]),
      c.table?.caption, ...(c.sections || []).flatMap((s) => [s.h2, ...(s.p || [])])].filter(Boolean);
    for (const t of texts) {
      let s = t.replace(/\{\{[^}]*\}\}/g, '');
      for (const a of allowed) s = s.split(a).join('');
      assert.ok(!/\d/.test(s), `${c.id}: typed number in "${t}" (use a {{placeholder}} or list it in literal_numbers)`);
    }
  }
});

test('every rendered string is free of NaN, Infinity, undefined and negative results', () => {
  for (const p of pages) {
    const c = structuredClone(p.content || {});
    if (c.tool?.how) { delete c.tool.how.tpl; delete c.tool.how.tpl_ur; } // the live templates keep their {{placeholders}}
    if (c.tool?.rtable) delete c.tool.rtable.cap; // live caption template, rendered in the browser after each calculation
    const s = JSON.stringify(c);
    assert.ok(!/NaN|Infinity|undefined|null h|\{\{/.test(s), `${p.id}: bad value in content`);
  }
});

test('schema: breadcrumb everywhere, WebApplication on tools, FAQ matches visible FAQ, no fake ratings', () => {
  for (const p of pages) {
    const g = p.schema['@graph'];
    const types = g.map((n) => n['@type']);
    assert.ok(types.includes('BreadcrumbList'), `${p.id}: BreadcrumbList`);
    assert.ok(types.includes('Organization'), `${p.id}: Organization`);
    const bc = g.find((n) => n['@type'] === 'BreadcrumbList').itemListElement;
    assert.equal(bc.length, p.breadcrumb.length, `${p.id}: schema breadcrumb = visible breadcrumb`);
    if (p.type === 'tool' || p.type === 'appliance' || p.type === 'lookup') {
      const app = g.find((n) => n['@type'] === 'WebApplication');
      assert.ok(app, `${p.id}: WebApplication`);
      assert.equal(app.applicationCategory, 'UtilitiesApplication');
      assert.equal(app.offers.price, '0');
    }
    if (p.type === 'guide') assert.ok(types.includes('Article') && types.includes('Person'), `${p.id}: Article + Person`);
    const wp = g.find((n) => /WebPage|AboutPage|ContactPage|CollectionPage/.test(n['@type']));
    if (p.author && p.type !== 'trust') {
      assert.ok(wp?.author, `${p.id}: WebPage names its author (WL-50)`);
      assert.ok(g.some((n) => n['@type'] === 'Person' && n['@id'] === wp.author['@id']), `${p.id}: author Person is in the graph`);
    }
    const faq = g.find((n) => n['@type'] === 'FAQPage');
    const visible = p.content?.faq || [];
    if (visible.length) {
      assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), visible.map((f) => [f.q, f.a]), `${p.id}: FAQ schema = visible FAQ`);
    } else assert.ok(!faq, `${p.id}: FAQPage without visible FAQ`);
    const s = JSON.stringify(p.schema);
    assert.ok(!/aggregateRating|"Review"/.test(s), `${p.id}: no ratings or reviews in schema`);
  }
  const home = manifest.website_schema['@graph'].map((n) => n['@type']);
  assert.deepEqual(home.slice(0, 2), ['WebSite', 'Organization']);
});

test('no reviewer name is shown anywhere until a PEC engineer has signed off', () => {
  if (site.reviewer.status === 'signed_off') {
    assert.ok(site.reviewer.name && site.reviewer.credential && site.reviewer.pec_registration, 'signed-off reviewer needs name, credential and PEC registration');
    return;
  }
  const all = JSON.stringify(files);
  assert.ok(!/reviewedBy|#\/person\/reviewer/.test(all), 'reviewer in schema while pending');
  assert.equal(manifest.site.reviewer.name, undefined);
});

test('llms.txt lists every live page and nothing that is not live', () => {
  for (const p of manifest.pages) {
    const url = site.url.replace(/\/$/, '') + p.url;
    const listed = llms.includes(`](${url})`);
    if (p.type !== 'home') assert.equal(listed, Boolean(p.live), `${p.id} ${p.live ? 'missing from' : 'must not be in'} llms.txt`);
  }
  assert.ok(llms.startsWith(`# ${site.brand}\n\n> `), 'llmstxt.org format: H1 then summary blockquote');
});

test('pages link only to live pages and every child has a pillar', () => {
  for (const p of manifest.pages) {
    if (p.live && p.parent) assert.ok(manifest.pages.find((x) => x.id === p.parent).live, `${p.id}: live page under a pillar that is not live`);
    for (const r of [...(p.related || []), p.next].filter(Boolean)) assert.ok(manifest.pages.find((x) => x.id === r), `${p.id}: related ${r} unknown`);
  }
});

test('data/appliances.json: 60+ appliances with running W, starting W, source and date', () => {
  const a = readJson('data/appliances.json');
  assert.ok(a._meta.source && /^\d{4}-\d{2}-\d{2}$/.test(a._meta.checked), '_meta source + checked');
  assert.ok(a.items.length >= 60, `${a.items.length} appliances`);
  const ids = new Set();
  for (const x of a.items) {
    assert.ok(!ids.has(x.id), `duplicate ${x.id}`);
    ids.add(x.id);
    assert.ok(x.name && x.category && x.source, `${x.id}: name/category/source`);
    assert.ok(x.running_w > 0 && x.starting_w >= x.running_w, `${x.id}: watts`);
    assert.ok(x.running_w >= x.running_w_range[0] && x.running_w <= x.running_w_range[1], `${x.id}: running within range`);
    assert.ok(Array.isArray(x.pk_brands), `${x.id}: pk_brands`);
    assert.ok(x.source_url === null || /^https:\/\//.test(x.source_url), `${x.id}: source_url`);
  }
});

const pngSize = (p) => { const b = readFileSync(join(root, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('brand images exist at the sizes the head tags and schema declare', () => {
  assert.deepEqual(pngSize('assets/brand/og-default.png'), [1200, 630]);
  assert.deepEqual(pngSize('assets/brand/twitter-card.png'), [1200, 600]);
  assert.deepEqual(pngSize('assets/brand/apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(pngSize('assets/brand/logo-512.png'), [512, 512]);
  assert.deepEqual(pngSize('assets/brand/icon-192.png'), [192, 192]);
  for (const f of ['favicon.ico', 'icon.svg', 'logo.svg']) assert.ok(existsSync(join(root, 'assets/brand', f)), f);
  for (const k of ['logo', 'og_image', 'twitter_image']) assert.ok(existsSync(join(root, site[k])), `site.json ${k}`);
});

test('a tool page loads under 30 KB of JavaScript (seo-rules.md 4)', () => {
  // Measured on what the browser actually loads: the stripped copies in dist/.
  const size = (p) => Buffer.byteLength(files[`dist/${p}`]);
  const base = ['assets/js/wattlyst-tool.js', 'engine/format.js', 'engine/messages.js', 'engine/core.js'].reduce((s, p) => s + size(p), 0);
  for (const m of ['conversions', 'battery', 'sizing', 'solar', 'bill', 'load', 'wiring', 'planner', 'prices', 'forecast', 'fuel', 'solartools']) {
    assert.ok(base + size(`engine/${m}.js`) < 30 * 1024, `${m}: ${base + size(`engine/${m}.js`)} bytes`);
  }
  // Pages with an appliance list also load assets/js/wattlyst-loads.js (audit Phase 3 split it out of the tool script);
  // the live forecast (N6) and diagram (N11) pages load assets/js/wattlyst-extra.js (audit Phase 6).
  for (const p of pages.filter((x) => x.content?.tool)) {
    const t = p.content.tool;
    const total = base + size(`engine/${t.module}`) + (t.fields.some((f) => f.type === 'loads') ? size('assets/js/wattlyst-loads.js') : 0) + (t.live || t.diagram ? size('assets/js/wattlyst-extra.js') : 0);
    assert.ok(total < 30 * 1024, `${p.id}: ${total} bytes`);
  }
});

test('PHP files have no syntax errors', (t) => {
  try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { t.skip('php not installed'); return; }
  const phpFiles = ['wattlyst-tools.php', ...readdirSync(join(root, 'includes')).filter((f) => f.endsWith('.php')).map((f) => `includes/${f}`)];
  for (const f of phpFiles) execFileSync('php', ['-l', join(root, f)], { stdio: 'pipe' });
});
