// Full audit 2026-10-15, fix Phase 6 (speed and hygiene): WL-107, WL-136, WL-138, WL-154, WL-155.
// The JS chain budget is in site.test.js and the message limits in messages.test.js; this file holds the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, cases } from './load-data.js';
import { build } from '../tools/build.js';
import { calculators } from '../engine/index.js';
import { markdown } from '../tools/maintenance.js';

const files = await build();
const read = (p) => readFileSync(join(root, p), 'utf8');
const page = (id) => JSON.parse(files[`generated/pages/${id}.json`]);

test('WL-136 the result-table, diagram and forecast module is not on the start-up path', () => {
  const tool = read('assets/js/wattlyst-tool.js');
  const start = tool.slice(tool.indexOf('await Promise.all('), tool.indexOf('\n', tool.indexOf('await Promise.all(')));
  assert.doesNotMatch(start, /wattlyst-extra/);
  assert.match(tool, /x \|\|= import\(`\.\/wattlyst-extra\.js\$\{q\}`\)/, 'loaded once, on first use');
  // The head does not preload it for result-table pages either (only the live forecast and the diagram need it early).
  assert.doesNotMatch(read('includes/class-wattlyst-head.php'), /rtable/);
  assert.ok(page('H1').content.tool.rtable, 'the homepage has a result table');
});

// content-visibility:auto on the homepage folds was tried and left out: Lighthouse's accessibility audit cannot
// read colours or tap sizes inside skipped content (score 93 < 95). The local 94 in the audit came from the
// uncompressed test server; the live site sends HTML compressed, and so does the test site now.
test('WL-136 the local test site compresses HTML like the live server, so Lighthouse measures what visitors get', () => {
  assert.match(read('tools/wp-test-site.sh'), /ini_set\('zlib\.output_compression', '1'\);/);
  assert.doesNotMatch(read('assets/css/wattlyst-home.css'), /content-visibility/);
});

test('WL-138 versioned dist/ files are cached for a year; the embed script and HTML are not', () => {
  const h = files['dist/.htaccess'];
  assert.match(h, /Cache-Control "public, max-age=31536000, immutable"/);
  assert.equal(read('dist/.htaccess'), h, 'run node tools/build.js');
  assert.doesNotMatch(read('.htaccess'), /max-age|Expires/);
  // Every dist/ import carries ?ver=<hash>, so a long cache never serves an old build: tests/deploy.test.js checks it.
});

test('GA4 on (owner, 26 Oct 2026): tag settings in the manifest, privacy policy names Google Analytics', () => {
  const site = JSON.parse(read('data/site.json'));
  assert.equal(site.analytics.enabled, true);
  const m = JSON.parse(files['generated/manifest.json']).site.analytics;
  assert.equal(m.ga4_id, site.analytics.ga4_id);
  assert.match(m.ga4_id, /^G-[A-Z0-9]+$/);
  for (const r of ['DE', 'FR', 'GB', 'CH', 'NO']) assert.ok(m.consent_regions.includes(r), r);
  assert.ok(m.load_delay_ms > 0);
  const html = page('privacy-policy').content.html;
  assert.match(html, /<h2>Analytics<\/h2>/);
  assert.match(html, /Google Analytics opt-out/);
  assert.match(html, /embeds\) carry no analytics/);
});

test('GA4 tag: deferred gtag.js, consent default before config, not on embeds or for editors', () => {
  const php = read('includes/class-wattlyst-head.php');
  const fn = php.slice(php.indexOf('public function analytics()'), php.indexOf('On the front page our Organization'));
  assert.match(php, /add_action\( 'wp_head', array\( \$this, 'analytics' \)/);
  assert.match(fn, /current_user_can\( 'edit_posts' \)/);
  assert.ok(fn.indexOf('"consent","default"') < fn.indexOf('"config"'), 'consent default must come before config');
  assert.match(fn, /allow_google_signals:false/);
  assert.match(fn, /addEventListener\("load"/);
  assert.doesNotMatch(fn, /<script async src/, 'gtag.js must not load in the head before the page');
  assert.doesNotMatch(read('includes/class-wattlyst-endpoints.php'), /googletagmanager|wp_head\(/);
});

test('WL-155 every calculator has at least three spec cases', () => {
  const n = {};
  for (const c of cases) n[c.calc] = (n[c.calc] || 0) + 1;
  const few = Object.keys(calculators).filter((k) => (n[k] || 0) < 3);
  assert.deepEqual(few, []);
});

test('WL-155 the upkeep report prints "- none" only when no stale line follows', () => {
  const cfg = { data_max_age_days: 35, page_review_days: 180, thin_words: 300 };
  const base = { today: '2026-10-16', stale_data: [], stale_points: [], bill_index: { latest: 'x', due: false }, buyback: { verified: true }, pages_to_review: [], thin_pages: [], refresh_candidates: [], owner: [] };
  const point = { file: 'data/solar-prices.json', old: 2, of: 3, oldest: '2026-07-01' };
  const section = (md) => md.split('## Monthly releases')[0];
  assert.doesNotMatch(section(markdown({ ...base, stale_points: [point] }, cfg)), /- none/);
  assert.match(section(markdown(base, cfg)), /- none/);
});
