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

test('after a purge the cache is warmed one page at a time, home and hubs first (WL-75)', () => {
  const pages = php('includes/class-wattlyst-pages.php');
  assert.match(pages, /self::purge_cache\(\);\s*\$this->queue_warm\(\);/, 'warm-up queued right after the purge');
  assert.match(pages, /add_action\( self::WARM, array\( \$this, 'warm' \) \)/);
  assert.match(pages, /foreach \( \$batch as \$url \) \{\s*wp_remote_get\(/, 'pages fetched in turn, never in parallel');
  assert.match(pages, /array\( 'home', 'pillar' \)/, 'home and hubs first');
  assert.match(php('wattlyst-tools.php'), /wp_unschedule_hook\( Wattlyst_Pages::WARM \)/);
  const un = php('uninstall.php');
  assert.match(un, /wattlyst_warm_queue/);
  assert.match(un, /wp_unschedule_hook\( 'wattlyst_warm' \)/);
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
  for (const k of ['wattlyst_sync_hash', 'wattlyst_indexnow_key', 'wattlyst_indexnow_sent', 'wattlyst_lead_cleanup', 'wattlyst_sync', "'wattlyst_lead'", "'draft'"]) assert.ok(u.includes(k), k);
  assert.match(php('includes/class-wattlyst-pages.php'), /trashed or drafted in WordPress is published again/);
});

test('re-audit SEO hygiene: feed 404 without a redirect, robots respects noindex, sitemap lastmod, lean CSS, versioned brand images (WL-82 to WL-87)', () => {
  assert.match(wpsite, /function not_found\(\)[\s\S]*?remove_action\( 'template_redirect', 'redirect_canonical' \)/, '/<page>/feed/ is a plain 404 (WL-82)');
  const head = php('includes/class-wattlyst-head.php');
  assert.match(head, /add_filter\( 'wp_robots', array\( \$this, 'robots' \), 99 \)/);
  assert.match(head, /empty\( \$robots\['noindex'\] \)/, 'never "index" next to "noindex" (WL-83)');
  for (const p of manifest.pages.filter((x) => x.live)) {
    assert.match(p.lastmod || '', /^\d{4}-\d{2}-\d{2}$/, `${p.id} has a lastmod`);
    const node = page(p.id).schema['@graph'].find((n) => n.dateModified && !/Dataset|Person|Organization/.test([].concat(n['@type']).join()));
    if (node) assert.equal(node.dateModified, p.lastmod, `${p.id}: sitemap lastmod = schema dateModified (WL-84)`);
  }
  assert.match(php('includes/class-wattlyst-endpoints.php'), /add_filter\( 'wp_sitemaps_posts_entry', array\( \$this, 'sitemap_lastmod' \), 10, 2 \)/);
  assert.match(head, /function drop_block_styles\(\)[\s\S]*?'wp-block-library'[\s\S]*?'global-styles'/, 'no block CSS on Wattlyst pages (WL-85)');
  assert.match(php('includes/class-wattlyst-tools.php'), /'assets\/brand\/'[\s\S]*?filemtime/, 'brand image URLs carry the file time (WL-87)');
});

test('Search Console verification tag comes from data/site.json and prints on the front page only', () => {
  const code = readJson('data/site.json').verification?.google;
  assert.match(code, /^[A-Za-z0-9_-]{20,}$/);
  assert.equal(manifest.site.verification.google, code, 'manifest ships the code to PHP');
  const head = php('includes/class-wattlyst-head.php');
  assert.match(head, /name="google-site-verification"/);
  assert.match(head, /is_front_page\(\)/);
});

test('IndexNow: changed pages go out in one batch after each sync, keyed on the sitemap lastmod (growth phase)', () => {
  const pages = php('includes/class-wattlyst-pages.php');
  const ep = php('includes/class-wattlyst-endpoints.php');
  assert.match(pages, /self::purge_cache\(\);[\s\S]*?do_action\( 'wattlyst_synced' \)/, 'batch runs after the sync and purge');
  assert.match(ep, /add_action\( 'wattlyst_synced', array\( \$this, 'indexnow_changed' \) \)/);
  assert.match(ep, /\$row\['lastmod'\]/, 'change signal is the manifest lastmod');
  assert.match(ep, /update_option\( self::OPT_SENT/, 'sent dates saved');
  assert.match(ep, /array\( 200, 202 \)/, 'saved only when the engine accepted the batch');
  assert.match(ep, /Wattlyst_Pages::\$syncing/, 'per-post ping quiet during sync');
  assert.match(ep, /'production' !== wp_get_environment_type\(\)/, 'never pings from a local copy');
  for (const r of manifest.pages.filter((p) => p.live)) assert.match(r.lastmod || '', /^\d{4}-\d{2}-\d{2}$/, `${r.id} has a lastmod`);
});

test('a shared homepage plan (/?load=a:1,b:2) is served as is, not 301ed to a re-encoded copy (WL-89)', () => {
  assert.match(wpsite, /add_filter\( 'redirect_canonical', array\( \$this, 'keep_share_link' \) \)/);
  assert.match(wpsite, /function keep_share_link\( \$redirect \) \{\s*return is_front_page\(\) && isset\( \$_GET\['load'\] \) \? false : \$redirect;/);
});

test('Escape closes the GeneratePress phone menu, added by the plugin without editing the theme (WL-137)', () => {
  assert.match(wpsite, /wp_add_inline_script\( 'generate-menu', "[^"]*Escape[^"]*\.menu-toggle\[aria-expanded=\\"true\\"\][^"]*b\.click\(\);b\.focus\(\)/);
});
