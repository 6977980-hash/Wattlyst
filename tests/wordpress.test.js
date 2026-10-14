// Audit Phase 4 guardrails (WordPress, SEO and security plumbing). Static checks on the PHP and the build;
// the behaviour itself is checked on a local WordPress (tools/wp-test-site.sh) before merging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson } from './load-data.js';
import { build } from '../tools/build.js';

const files = await build();
const manifest = JSON.parse(files['generated/manifest.json']);
const page = (id) => JSON.parse(files[`generated/pages/${id}.json`]);
const php = (f) => readFileSync(join(root, f), 'utf8');
const wpsite = php('includes/class-wattlyst-site.php');

test('manifest carries a hash of every generated file, so a data-only deploy re-syncs and purges (WL-36)', () => {
  assert.match(manifest.assets.content, /^[0-9a-f]{16}$/);
  const pages = php('includes/class-wattlyst-pages.php');
  assert.match(pages, /md5_file\( \$file \)/, 'sync hash is the manifest file hash');
  assert.match(pages, /litespeed_purge_all/);
  assert.match(pages, /\$this->sync\(\);[\s\S]*?self::purge_cache\(\)/, 'purge runs after a sync');
});

test('a visitor request only schedules the sync; admin, cron and WP-CLI run it (WL-70)', () => {
  const pages = php('includes/class-wattlyst-pages.php');
  assert.match(pages, /wp_schedule_single_event\( time\(\), self::CRON \)/);
  assert.match(pages, /! is_admin\(\) && ! wp_doing_cron\(\)/);
  assert.match(pages, /add_action\( self::CRON, array\( \$this, 'maybe_sync' \) \)/);
  assert.match(php('wattlyst-tools.php'), /wp_clear_scheduled_hook\( Wattlyst_Pages::CRON \)/);
});

test('author archives, empty archives and feeds are 404; feed links removed (WL-37, WL-38)', () => {
  assert.match(wpsite, /is_feed\(\) \|\| is_author\(\) \|\| \( is_archive\(\) && ! \$wp_query->have_posts\(\) \)/);
  assert.match(wpsite, /add_action\( 'template_redirect', array\( \$this, 'gate' \), 1 \)/, 'before redirect_canonical turns ?author=N into a login');
  for (const hook of ["'feed_links', 2", "'feed_links_extra', 3", "'rsd_link'", "'wlwmanifest_link'", "'wp_generator'"]) assert.ok(wpsite.includes(`remove_action( 'wp_head', ${hook}`), hook);
});

test('uppercase paths redirect to lowercase and /page/N/ on a page is a 404 (WL-41)', () => {
  assert.match(wpsite, /strtolower\( \$path \) !== \$path/);
  assert.match(wpsite, /<!--nextpage-->/);
  for (const r of manifest.pages) assert.equal(r.url, r.url.toLowerCase(), `${r.id} URL must be lowercase`);
});

test('every live pillar has dateModified; the free Offer is priced in PKR (WL-42)', () => {
  for (const r of manifest.pages.filter((x) => x.type === 'pillar' && x.live)) {
    const web = page(r.id).schema['@graph'].find((n) => n['@id'].endsWith('#webpage'));
    assert.match(web.dateModified || '', /^\d{4}-\d{2}-\d{2}$/, `${r.id} dateModified`);
  }
  const offers = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).flatMap(([, b]) => JSON.parse(b).schema['@graph'].filter((n) => n.offers).map((n) => n.offers));
  assert.ok(offers.length > 10);
  for (const o of offers) assert.equal(o.priceCurrency, 'PKR');
});

test('version leaks removed: generator, core ?ver=, readme.html, license.txt, X-Pingback, XML-RPC (WL-44, WL-67)', () => {
  assert.match(wpsite, /'the_generator', '__return_empty_string'/);
  assert.match(wpsite, /'style_loader_src'/);
  assert.match(wpsite, /'script_loader_src'/);
  assert.match(wpsite, /readme\.html', 'license\.txt'/);
  assert.match(wpsite, /_core_updated_successfully/);
  assert.match(wpsite, /unset\( \$headers\['X-Pingback'\] \)/);
  assert.match(wpsite, /'xmlrpc_enabled', '__return_false'/);
});

test('security headers on pages; the embed document may be framed, other pages may not (WL-63)', () => {
  for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security', 'X-Frame-Options', "frame-ancestors 'self'"]) assert.ok(wpsite.includes(h), h);
  assert.match(php('includes/class-wattlyst-endpoints.php'), /send_security_headers\( true \)/);
  // The live forecast reads coordinates from the city list, not the browser, so geolocation is not needed.
  for (const f of ['wattlyst-tool.js', 'wattlyst-loads.js', 'wattlyst-extra.js', 'wattlyst-page.js']) assert.doesNotMatch(php(`assets/js/${f}`), /navigator\.(geolocation|mediaDevices)/);
});

test('users REST routes and oEmbed author are hidden from visitors (WL-62 code part)', () => {
  assert.match(wpsite, /if \( ! is_user_logged_in\(\) \)[\s\S]*?'\/wp\/v2\/users'/);
  assert.match(wpsite, /unset\( \$data\['author_name'\], \$data\['author_url'\] \)/);
});

test('quote-form rate limit can key on the CDN client IP header (WL-64)', () => {
  const site = readJson('data/site.json');
  assert.ok('client_ip_header' in site.leads);
  assert.equal(manifest.site.leads.client_ip_header, site.leads.client_ip_header || '');
  const leads = php('includes/class-wattlyst-leads.php');
  assert.match(leads, /client_ip\( \(string\) \( \$leads\['client_ip_header'\]/);
  assert.match(leads, /FILTER_VALIDATE_IP/);
});

test('plugin data/ is blocked over HTTP and never fetched by the pages (WL-66)', () => {
  assert.match(php('.htaccess'), /\|data\|/);
  for (const [p, code] of Object.entries(files).filter(([q]) => q.startsWith('dist/'))) assert.doesNotMatch(code, /['"`][^'"`]*\bdata\/[\w-]+\.json/, p);
  assert.doesNotMatch(php('includes/class-wattlyst-render.php') + php('includes/class-wattlyst-head.php'), /asset\( '\/?data\//);
});

test('uninstall removes options, tasks and quote requests; pages go to draft (WL-71); trashed pages documented (WL-69)', () => {
  assert.ok(existsSync(join(root, 'uninstall.php')));
  const u = php('uninstall.php');
  assert.match(u, /WP_UNINSTALL_PLUGIN/);
  for (const k of ['wattlyst_sync_hash', 'wattlyst_indexnow_key', 'wattlyst_lead_cleanup', 'wattlyst_sync', "'wattlyst_lead'", "'draft'"]) assert.ok(u.includes(k), k);
  assert.match(php('includes/class-wattlyst-pages.php'), /trashed or drafted in WordPress is published again/);
});
