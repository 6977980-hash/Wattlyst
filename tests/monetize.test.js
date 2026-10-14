// Phase 6 guardrails: ad placement (max three, never near the calculator, none on home/data/embed/trust
// pages), the solar quote form and affiliate links (rel="sponsored" + disclosure), and the upkeep report.
// Rules: specs/seo-rules.md 7-8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson } from './load-data.js';
import { build } from '../tools/build.js';
import { AD_SLOTS, adsConfig, affiliatesByPage, leadsConfig } from '../tools/lib/monetize.js';
import { report } from '../tools/maintenance.js';

const files = await build();
const manifest = JSON.parse(files['generated/manifest.json']);
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const site = readJson('data/site.json');
const php = (f) => readFileSync(join(root, 'includes', f), 'utf8');
const fail = (m) => { throw new Error(m); };

/** The body of each template branch in Wattlyst_Render::html(), keyed by its condition. */
function branches() {
  const src = php('class-wattlyst-render.php');
  const body = src.slice(src.indexOf('public function html()'), src.indexOf('/* ------------------------------------------------------------ pieces */'));
  return body.split(/\n\t\t\}\s*(?:else(?:if)?\b)/).map((b) => ({ head: b.split('\n').find((l) => /if \(|else/.test(l)) || '', code: b }));
}

test('ads: exactly three manual slots, same names in data, build and PHP', () => {
  assert.deepEqual(Object.keys(site.ads.slots), AD_SLOTS);
  const m = php('class-wattlyst-ads.php').match(/SLOTS = array\(([^)]*)\)/);
  assert.deepEqual(m[1].match(/'[\w-]+'/g).map((s) => s.slice(1, -1)), AD_SLOTS);
  assert.deepEqual(Object.keys(manifest.site.ads.slots), AD_SLOTS);
});

test('ads: no template branch has more than three units; none before the result explanation', () => {
  for (const b of branches()) {
    const ads = [...b.code.matchAll(/\$this->ad\( '([\w-]+)' \)/g)].map((x) => x[1]);
    assert.ok(ads.length <= AD_SLOTS.length, `too many ads in ${b.head}`);
    assert.equal(new Set(ads).size, ads.length, `slot used twice in ${b.head}`);
    if (!ads.length) continue;
    const first = b.code.indexOf('$this->ad(');
    for (const before of ['$this->tool()', '$this->how()', '$this->lookup()', '$this->key_facts()']) {
      const at = b.code.indexOf(before);
      if (at >= 0) assert.ok(at < first, `${b.head}: ad placed before ${before}`);
    }
    assert.ok(!/'(home|data|embed|trust)' === \$type/.test(b.head), `ads in a no-ad template: ${b.head}`);
  }
  assert.ok(!php('class-wattlyst-render.php').includes('Wattlyst_Ads::slot( \'sidebar'), 'no sidebar unit');
});

test('ads: AdSense code only after approval; ads off on thank-you states and non-tool types', () => {
  const src = php('class-wattlyst-ads.php');
  assert.match(src, /empty\( \$ads\['enabled'\] \) \|\| empty\( \$ads\['adsense_pub_id'\] \)/);
  assert.match(src, /isset\( \$_GET\['lead'\] \)/);
  assert.match(src, /TYPES = array\( 'tool', 'appliance', 'guide', 'lookup' \)/);
  assert.match(src, /Advertisement/);
  assert.throws(() => adsConfig({ ads: { enabled: true, adsense_pub_id: null, slots: Object.fromEntries(AD_SLOTS.map((k) => [k, null])) } }, fail), /pub id|adsense_pub_id/);
  assert.throws(() => adsConfig({ ads: { enabled: false, adsense_pub_id: null, slots: { 'content-1': null } } }, fail), /exactly/);
  assert.throws(() => adsConfig({ ads: { enabled: false, adsense_pub_id: 'ca-pub-1', slots: Object.fromEntries(AD_SLOTS.map((k) => [k, null])) } }, fail), /pub-/);
});

test('lead form: only on the configured pages, text fully rendered, privacy section ready', () => {
  const want = new Set(site.leads.pages);
  for (const p of pages) assert.equal(Boolean(p.lead), want.has(p.id) && Boolean(p.content), `${p.id} lead flag`);
  const copy = JSON.stringify(manifest.site.leads.copy);
  assert.ok(!copy.includes('{{'), 'unrendered placeholder in lead form text');
  for (const k of ['name', 'phone', 'city', 'consent', 'rate', 'spam', 'send']) assert.ok(manifest.site.leads.copy.errors[k], `error text ${k}`);
  assert.ok(manifest.site.leads.cities.length > 0);
  const privacy = readFileSync(join(root, 'content/trust/privacy-policy.html'), 'utf8');
  assert.match(privacy, /<!--if:leads\.enabled-->[\s\S]*retention_days[\s\S]*<!--endif-->/);
  assert.throws(() => leadsConfig({ ...site, leads: { ...site.leads, pages: ['NOPE'] } }, readJson('content/lead-form.json'), manifest.pages, { lahore: {} }, fail), /unknown page/);
  const leads = php('class-wattlyst-leads.php');
  for (const guard of ["'website'", 'token_ok', 'rate_limit_per_hour', "'consent'", "'private'", 'manage_options', 'retention_days']) assert.ok(leads.includes(guard), `lead handler lacks ${guard}`);
});

test('affiliates: https only, dated, live pages only, printed with rel="sponsored" and a disclosure', () => {
  const rows = [{ id: 'D8', live: true }, { id: 'D9', live: false }];
  const aff = (links) => ({ disclosure: 'Disclosure: {{site.brand}} may earn a commission.', links });
  const ok = affiliatesByPage(aff([{ id: 'x', label: 'Panels', url: 'https://example.com/p', checked: '2026-10-14', pages: ['D8', 'D9'] }]), site, rows, fail);
  assert.deepEqual(Object.keys(ok), ['D8']);
  assert.match(ok.D8.disclosure, /Wattlyst may earn/);
  assert.throws(() => affiliatesByPage(aff([{ id: 'x', label: 'P', url: 'http://example.com', checked: '2026-10-14', pages: [] }]), site, rows, fail), /https/);
  assert.throws(() => affiliatesByPage(aff([{ id: 'x', label: 'P', url: 'https://example.com', pages: [] }]), site, rows, fail), /checked/);
  assert.throws(() => affiliatesByPage(aff([{ id: 'x', label: 'P', url: 'https://example.com', checked: '2026-10-14', pages: ['ZZ'] }]), site, rows, fail), /unknown page/);
  const render = php('class-wattlyst-render.php');
  assert.match(render, /rel="sponsored noopener"/);
  assert.match(render, /wl-disclosure/);
});

test('upkeep report: flags old data and a missing Bill Index month, lists GSC position 8-20 pages', () => {
  const now = report({ today: readJson('data/bill-index.json')._meta.checked });
  assert.equal(now.bill_index.due, false);
  const later = report({ today: '2099-01-01', gscCsv: 'Top pages,Clicks,Impressions,CTR,Position\nhttps://wattlyst.com/,1,50,2%,12.4\nhttps://wattlyst.com/x/,0,9,0%,3\n' });
  assert.equal(later.bill_index.due, true);
  assert.ok(later.stale_data.some((d) => d.file === 'data/tariff-pk-2026.json'));
  assert.deepEqual(later.refresh_candidates.map((r) => r.url), ['/']);
  assert.equal(later.refresh_candidates[0].id, 'H1');
});
