// 21 Oct 2026 audit, fix Phase 7 (technical SEO plumbing): WL-208 to WL-213.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';
import { outboundLinks, linkFlags, checkLinks, report, markdown } from '../tools/maintenance.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const read = (f) => readFileSync(join(root, f), 'utf8');
const readJson = (f) => JSON.parse(read(f));
const render = read('includes/class-wattlyst-render.php');
const fn = (src, name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n\t}\n', src.indexOf(`function ${name}(`)));

test('WL-208: an upper-case path without its slash is sent to the lower-case page with the slash in one absolute 301', () => {
  const gate = fn(read('includes/class-wattlyst-site.php'), 'gate');
  assert.match(gate, /wp_safe_redirect\( home_url\( user_trailingslashit\( strtolower\( \$path \) \) \)/);
  assert.match(gate, /\? '\?' \. \$query : ''/, 'the query string is kept');
});

test('WL-209: the author has a crawlable home: Person url = the About entry, which carries the same id', () => {
  const site = readJson('data/site.json');
  const about = byId.get('about');
  for (const p of site.people) {
    assert.match(about.content.html, new RegExp(`<li id="${p.id}">`), `${p.id}: About entry has the anchor`);
    assert.equal(about.url, '/about/');
  }
  const graph = (id) => {
    const s = byId.get(id).schema;
    return (Array.isArray(s) ? s : [s]).flatMap((x) => x['@graph'] || [x]);
  };
  const person = graph('F1').find((x) => x['@type'] === 'Person');
  assert.equal(person.url, `${site.url}about/#${site.people[0].id}`);
  const org = graph('F1').find((x) => x['@type'] === 'Organization');
  assert.deepEqual(org.areaServed, { '@type': 'Country', name: site.area_served });
  assert.deepEqual(org.knowsLanguage, site.languages);
});

test('WL-210: error-code H2s are short; the full name and models sit in a line under the heading', () => {
  const n2 = byId.get('N2').content;
  assert.ok(n2.tables.length > 5);
  for (const t of n2.tables) {
    assert.ok(t.caption.length <= 70, `"${t.caption}" is ${t.caption.length} characters`);
    assert.doesNotMatch(t.caption, /\(/, 'no scope notes in the heading');
    assert.match(t.note, /Models: /);
  }
  const ref = fn(render, 'ref_table');
  assert.match(ref, /\$t\['note'\]/);
  assert.match(ref, /aria-describedby/, 'the note describes the table');
});

test('WL-211: no much-linked page gets most of its internal links with the exact H1 as anchor', () => {
  // Mirrors the render: Next step box under the result (Next + two related, by H1) on tool and lookup pages,
  // the Related list at the bottom (Next + related, by the page's anchor), hub cards (H1) and in-text links.
  assert.match(fn(render, 'related'), /self::link_to\( \$r, true \)/);
  assert.match(fn(render, 'related'), /self::link_to\( \$next, true \)/);
  const live = pages.filter((p) => p.live);
  const byUrl = new Map(live.map((p) => [p.url, p]));
  const inb = new Map();
  const add = (u, t) => { if (byUrl.has(u)) (inb.get(u) || inb.set(u, []).get(u)).push(t); };
  for (const p of live) {
    const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.t && o.u) add(o.u, o.t); Object.values(o).forEach(walk); } };
    walk(p.content);
    const box = ['tool', 'appliance', 'lookup'].includes(p.type);
    const nx = byId.get(p.next);
    if (nx?.live) { add(nx.url, nx.anchor || nx.h1); if (box) add(nx.url, nx.h1); }
    let k = 0;
    for (const id of p.related || []) {
      const x = byId.get(id);
      if (!x?.live) continue;
      add(x.url, x.anchor || x.h1);
      if (box && id !== p.next && k < 2) { add(x.url, x.h1); k++; }
    }
    for (const id of p.children || []) if (byId.get(id)?.live) add(byId.get(id).url, byId.get(id).h1);
  }
  const bad = [];
  for (const [u, a] of inb) {
    const h1 = byUrl.get(u).h1.toLowerCase();
    const exact = a.filter((t) => t.toLowerCase() === h1).length;
    if (a.length >= 12 && exact / a.length > 0.6) bad.push(`${byUrl.get(u).id}: ${exact} of ${a.length}`);
  }
  assert.deepEqual(bad, [], 'give the page an "anchor" in its content JSON');
  for (const p of live.filter((x) => x.anchor)) assert.notEqual(p.anchor.toLowerCase(), p.h1.toLowerCase(), p.id);
});

test('WL-212: the upkeep report lists http and watch-list links, and the quarterly pass reports redirects and errors', async () => {
  const cfg = readJson('data/maintenance.json');
  const links = outboundLinks();
  assert.ok(links.length > 50, 'built pages and data/ sources are collected');
  assert.ok(links.every((l) => !l.url.startsWith('https://wattlyst.com')), 'own links left out');
  assert.ok(links.some((l) => l.url.includes(' ')), 'whole-string URLs kept as they are (manual names with spaces)');
  assert.deepEqual(linkFlags(links, cfg), [], 'no http or watch-list link is live');
  assert.ok(cfg.link_watch_hosts.includes('goshop.pk'));
  const fake = [{ url: 'http://example.org/a', where: ['X1'] }, { url: 'https://www.goshop.pk/x', where: ['data/y.json'] }];
  assert.deepEqual(linkFlags(fake, cfg).map((l) => l.url), fake.map((l) => l.url));
  // No network in tests: a stub answers like the real hosts did in the audit.
  const answers = { 'https://a.test/': [200], 'https://b.test/old': [301, 'https://b.test/new'], 'https://c.test/': [301, 'https://www.c.test/'], 'https://d.test/': [404], 'https://e.test/': [405, 403] };
  const seen = [];
  const stub = async (url, opt) => {
    seen.push(opt.method);
    const [s, loc] = answers[url];
    const status = opt.method === 'GET' && s === 405 ? loc : s;
    return { status, headers: { get: () => (typeof loc === 'string' ? loc : null) } };
  };
  const res = await checkLinks(Object.keys(answers).map((url) => ({ url, where: ['P1'] })), { fetchImpl: stub, delayMs: 0 });
  assert.deepEqual(res.map((r) => [r.url, r.kind]), [
    ['https://b.test/old', 'redirect'], ['https://c.test/', 'redirect to another host'], ['https://d.test/', 'broken'], ['https://e.test/', 'check by hand'],
  ]);
  assert.equal(res[0].to, 'https://b.test/new');
  assert.ok(seen.includes('GET'), 'GET when a host refuses HEAD');
  const r = report({ today: '2026-10-21' });
  assert.match(markdown(r, cfg), /## Outbound links[\s\S]*run with --links/);
  r.link_check = res;
  assert.match(markdown(r, cfg), /b\.test\/old: redirect 301 -> https:\/\/b\.test\/new \(replace with the final address\)/);
  // The links the audit found redirecting point at their final address now.
  const all = JSON.stringify(files) + links.map((l) => l.url).join(' ');
  for (const old of ['webstore.iec.ch/publication/', 'www.nepra.org.pk', '//batteryuniversity.com', 'maxpower.com.pk/?p=', 'icons.com.pk/?p=', 'murdochs.com/learning-center', 'http://manuals.fronius.com', 'ke.com.pk/?p=280', 'jsbl.com/?p=']) {
    assert.ok(!all.includes(old), `${old} still linked`);
  }
});

test('WL-213: a new warm-up drops every queued warm-up event, also the later batches that carry an argument', () => {
  const pages = read('includes/class-wattlyst-pages.php');
  assert.match(fn(pages, 'queue_warm'), /wp_unschedule_hook\( self::WARM \);\s*wp_schedule_single_event\( time\(\) \+ 15, self::WARM \)/);
  assert.match(fn(pages, 'warm'), /wp_schedule_single_event\( time\(\) \+ 10, self::WARM, array\( count\( \$queue \) \) \)/, 'later batches still carry the count, so WordPress does not drop them as duplicates');
  assert.doesNotMatch(read('wattlyst-tools.php') + read('uninstall.php'), /wp_clear_scheduled_hook\( (Wattlyst_Pages::WARM|'wattlyst_warm') \)/);
});
