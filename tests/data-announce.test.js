// Audit 2026-10-21, fix Phase 1 (correct data live and announced): WL-156, WL-158, WL-159, WL-160, WL-206,
// WL-207, WL-214, WL-228. Data values live in data/; these tests pin where they flow, not the figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson } from './load-data.js';
import { build, changedOn, PAGE_DATES } from '../tools/build.js';
import { report, markdown } from '../tools/maintenance.js';

const files = await build();
const read = (p) => readFileSync(join(root, p), 'utf8');
const page = (id) => JSON.parse(files[`generated/pages/${id}.json`]);
const manifest = JSON.parse(files['generated/manifest.json']);
const ix = readJson('data/bill-index.json');
const site = readJson('data/site.json');

test('WL-156: the July 2026 FPA is NEPRA\'s approved rate, verified, and covers K-Electric', () => {
  const sep = ix.months.find((m) => m.fpa_for === 'July 2026');
  assert.equal(sep.fpa_verified, true);
  assert.equal(sep.fpa_ke, true, 'SRO 1499(I)/2026 para 20 applies the FCA to K-Electric');
  assert.notEqual(sep.fpa_per_unit, 2.5182, 'CPPA-G\'s requested figure is not the decided one');
  assert.match(sep.fpa_url, /nepra\.org\.pk/);
  // F14 pre-fills the newest verified month.
  const f14 = page('F14');
  const fpa = f14.content.tool.fields.find((f) => f.name === 'fpa_per_unit');
  assert.equal(fpa.default, ix.months.find((m) => m.fpa_verified).fpa_per_unit);
});

test('WL-158: the October FPA stays "reported" and F14 opens with the newest month', () => {
  const oct = ix.months[0];
  assert.equal(oct.fpa_verified, false, 'no NEPRA PDF yet: a news figure is never marked verified');
  const answer = page('F14').content.answer;
  assert.ok(answer.indexOf(oct.label) > -1 && answer.indexOf(oct.label) < answer.indexOf(ix.months.find((m) => m.fpa_verified).fpa_for), 'newest month named before the verified month');
});

test('WL-160: no hijacked source link or its price point anywhere in the build', () => {
  assert.doesNotMatch(JSON.stringify(files), /goshop\.pk\//);
  for (const u of readJson('data/backup-prices.json').ups) assert.equal(u.n_sources, u.sources.length, `${u.label}: n_sources counts the listed sources`);
});

test('WL-159: fuel prices carry a day, the page prints it, and the upkeep report flags an old price', () => {
  const p = readJson('data/generator-fuel.json').prices;
  for (const k of ['petrol', 'diesel']) assert.match(p[k].effective, /^\d{4}-\d{2}-\d{2}$/, `${k}: one effective day, not a window`);
  assert.doesNotMatch(JSON.stringify(page('C8').content), /\d{4}-\d{2}-\d{2} to \d{4}/);
  const cfg = readJson('data/maintenance.json');
  assert.ok(cfg.fuel_price_max_age_days > 0);
  const late = new Date(Date.parse(p.petrol.effective) + (cfg.fuel_price_max_age_days + 1) * 864e5).toISOString().slice(0, 10);
  const r = report({ today: late });
  assert.equal(r.fuel.due, true);
  assert.match(markdown(r, cfg), /Fuel prices .*DUE/);
  assert.equal(report({ today: p.petrol.effective }).fuel.due, false);
});

test('WL-228: Hazara is HAZECO, not PESCO; SEPCO is not called the youngest', () => {
  const f7 = JSON.stringify(page('F7').content);
  assert.doesNotMatch(f7, /home in [^.]*Abbottabad/);
  assert.match(f7, /HAZECO/);
  assert.doesNotMatch(JSON.stringify(page('F9').content), /SEPCO[^.]*the youngest of/);
  assert.match(JSON.stringify(page('bill-index').content), /HAZECO/);
});

test('WL-214: "Updated" and no lastReviewed until the engineer signs off', () => {
  const r = read('includes/class-wattlyst-render.php');
  assert.match(r, /'signed_off' === /);
  assert.match(r, /array\( 'Updated', \$date \)/);
  if (site.reviewer.status !== 'signed_off') {
    for (const p of manifest.pages.filter((x) => x.live)) {
      const s = JSON.stringify(page(p.id).schema);
      assert.doesNotMatch(s, /lastReviewed/, `${p.id}: lastReviewed without a reviewer`);
    }
  }
});

test('WL-206: page dates follow content changes, deterministically', () => {
  assert.equal(changedOn({ hash: 'a', date: '2026-01-01' }, 'a', '2025-12-01', '2026-10-21'), '2026-01-01', 'same content keeps its day');
  assert.equal(changedOn({ hash: 'a', date: '2026-01-01' }, 'b', '2025-12-01', '2026-10-21'), '2026-10-21', 'changed content gets the build day');
  assert.equal(changedOn(undefined, 'b', '2025-12-01', '2026-10-21'), '2025-12-01', 'a new entry starts from the review date');
  const dates = JSON.parse(files[PAGE_DATES]);
  for (const p of manifest.pages) {
    const g = page(p.id);
    assert.ok(dates[p.id]?.hash, `${p.id} has a hash`);
    assert.equal(p.lastmod, g.modified, `${p.id}: sitemap lastmod = page modified`);
    if (g.reviewed) assert.ok(g.modified >= g.reviewed, `${p.id}: modified is never before the review date`);
    if (p.live && g.schema) {
      const node = g.schema['@graph'].find((n) => n.dateModified);
      if (node) assert.equal(node.dateModified, g.modified, `${p.id}: schema dateModified = modified`);
    }
  }
  // IndexNow keys on the manifest lastmod, so a moved date is announced.
  assert.match(read('includes/class-wattlyst-endpoints.php'), /\$row\['lastmod'\]/);
});

test('WL-207: front-end HTML is sent with a short cache lifetime', () => {
  const s = read('includes/class-wattlyst-site.php');
  const m = s.match(/HTML_CACHE = '([^']+)'/);
  assert.ok(m, 'HTML_CACHE constant');
  const age = (k) => Number((m[1].match(new RegExp(`(?:^|[ ,])${k}=(\\d+)`)) || [])[1]);
  assert.ok(age('max-age') <= 600, 'browsers re-check within minutes');
  assert.ok(age('s-maxage') <= 3600, 'a CDN copy lives at most an hour');
  assert.match(s, /\$headers\['Cache-Control'\] = self::HTML_CACHE;/);
  assert.match(s, /! isset\( \$headers\['Cache-Control'\] \) && ! is_user_logged_in\(\)/);
});
