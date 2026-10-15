# Progress

## Handoff for next phase (after re-audit fix Phase A: cache warm-up) — written by the re-audit thread, 2026-10-15

Re-audit report: `/mnt/project-files/electricity-tool-hub/audit/wattlyst-audit-2026-10-15.md` (old WL-01 to 74 re-checked, new WL-75 to 88). Owner approved the fixes on 15 Oct 2026. Phase A (this PR) covers WL-75; Phase B (design follow-ups WL-77 to 81) and Phase C (SEO/speed hygiene WL-82 to 87) follow in their own PRs. Formulas and numbers are never repeated here.

**What is where (Phase A, WL-75)**
- `Wattlyst_Pages::maybe_sync()` purges the page cache and then calls `queue_warm()`: the list of live URLs (home and hubs first) goes into the option `wattlyst_warm_queue`, and the cron event `Wattlyst_Pages::WARM` (`wattlyst_warm`) runs `warm()`, which fetches up to `WARM_BATCH` pages one after another with `wp_remote_get` and schedules the next batch 10 s later. One page at a time keeps the database to one extra connection while the cache refills.
- Deactivation and `uninstall.php` clear the event and the option. Test: `tests/wordpress.test.js` (WL-75).
- Local check: `wp option delete wattlyst_sync_hash` then any WP-CLI command syncs and queues the warm-up; `do_action('wattlyst_warm')` runs a batch. The PHP built-in server is single-threaded, so run batches from WP-CLI locally, not from a web request.

**Owner (hPanel, WL-75 and WL-76)**: check the database connection limit and resource-limit log; turn on the LiteSpeed Cache crawler if available; check CDN bot protection does not challenge visitors or PageSpeed Insights.

## Earlier handoff (after design Phase 7: premium redesign) — written by the design Phase 7 thread, 2026-10-14

All build phases, audit fix Phases 1 to 6 and the design phase are done. Next is a fresh read-only audit (separate thread). Formulas and numbers are never repeated here; they live once in `specs/formulas.md`, `data/` and `engine/`.

**What is where (design Phase 7)**
- The look is CSS only: `assets/css/wattlyst.css` (inlined by `Wattlyst_Head::styles()` and in the `/embed/` document). No web fonts, no images, no new JavaScript; the JS budget is untouched. Brand tokens on `:root` (`--wl-accent`, `--wl-accent-2`, `--wl-accent-3`, `--wl-spark` amber, `--wl-bg-soft`, `--wl-bg-tint`, `--wl-line`, `--wl-field`, `--wl-shadow*`); GeneratePress colour variables (`--accent`, `--contrast`, `--base-2`) set on `html:root`. Theme markup (header, menu, footer bar) is styled with a `body` prefix because the plugin CSS prints before the theme CSS.
- Page header: `Wattlyst_Render::hero()` wraps breadcrumb, H1, the answer and `byline()` ("By <author> · Reviewed <date>", tool/appliance/guide/lookup/data pages only) in `<header class="wl-hero">`. The answer text per page type moved from `html()` into `hero()`; same texts as before. `author()` is the one author lookup (byline + author box).
- Calculator: white card `.wl-tool` with a gradient top bar; the first result card is the headline (dark green); on phones results sit two per row with the first full width. Errors red / notices amber unchanged in meaning (`.wl-error`, `.wl-notice`).
- Content blocks: "How" and Key facts as cards (check marks), formula as a dark code block, numbered worked examples (CSS counter), tables with a dark header row and zebra rows (cells top-aligned), Common mistakes with crosses, Safety as an amber callout, FAQ with hairlines, Related calculators as link cards with "Next step" as the main call to action.
- Hubs: `.wl-children` cards, whole card clickable (stretched link). Home: "What do you want to do?" is now a visible H2 (`<section class="wl-tasks">`), each hub card has an H3 and an icon chosen by class `.wl-card-<hub slug>` (encoded SVG data URIs in the CSS; never a raw `<` because PHP inlines through `wp_strip_all_tags`).
- Header: sticky from 1024 px (offset for the admin bar), amber underline on the current hub. Footer (`Wattlyst_Pages::footer()`): dark band with `logo-white.svg`, tagline from `data/site.json`, every live nav hub (site-wide internal links to all hubs) and the trust pages.
- Brand files refreshed (same names, same sizes): gradient icon in `icon.svg`, `icon-square.svg`, `logo.svg`, `logo-white.svg` (amber tile, white wordmark for dark backgrounds), new `og-default` and `twitter-card` (SVG source + PNG), PNG icons and `favicon.ico`. PNGs are screenshots of the SVGs in headless Chromium (Inter font); sizes are checked by `tests/site.test.js`.
- Tests: `tests/design.test.js` (CSS safe for `wp_strip_all_tags`, under 40 KB, no external assets; audit fixes kept: focus ring, notice colours, 44 px targets, phone breadcrumb, table scroll box; hero/byline/footer data sources).
- Checked on local WP (GeneratePress): 108 live pages in `tools/browser-check.js` (no JS errors, no sideways scroll at phone width, results never blank), screenshots of every template at 390 and 1280 px, Lighthouse mobile 98-100 performance and 100 accessibility, best practices and SEO on the six CI pages. Plugin version 0.8.0.

**Do not touch**
- Keep class names the JavaScript uses (`.wl-error`, `.wl-notice`, `.wl-result`, `.wl-share`, `.wl-wire`, `.wl-loads`, `data-*`); restyle through the tokens.
- The live site may have GeneratePress Customizer colours or a Custom Logo set by the owner; the plugin's `html:root` variables win over Customizer colours, a Custom Logo replaces `logo.svg` in the header.
- Social networks cache `og-default.png`; after deploy the owner can re-scrape a page in the Facebook Sharing Debugger if the old image still shows.

**Open to-dos (design)**
- Homepage on phones: the planner results still sit under the appliance list and fields (the form order is the logical one; the two-per-row results make the block shorter). A future idea is a short results summary near the top; it would need new markup and a JS-budget decision.

## Earlier handoff (after audit fix Phase 6: UX and accessibility) — written by the audit Phase 6 thread, 2026-10-14

All six build phases and audit fix Phases 1 to 6 are done (audit file `/mnt/project-files/electricity-tool-hub/audit/wattlyst-audit-2026-10-14.md`, WL-01 to WL-74). Next is the design phase (Phase 7: premium redesign, owner request 14 Oct 2026), then a fresh read-only audit. The design thread reads this section first; formulas and numbers are never repeated here (they live once in `specs/formulas.md`, `data/` and `engine/`).

**For the design phase: what must not break**
- Styles: one file, `assets/css/wattlyst.css`, inlined in the head by `Wattlyst_Head::styles()` (printed BEFORE GeneratePress's own inline CSS, so a rule that targets theme markup needs higher specificity, e.g. a `body` prefix; `html:root{--accent}` is how the theme accent became brand green). Brand tokens are on `:root` (`--wl-ink`, `--wl-accent`, `--wl-accent-2`, `--wl-bg-soft`, `--wl-line`, `--wl-warn`, `--wl-focus`); restyle through them. Header/menu/footer are GeneratePress markup; the menu items come from `Wattlyst_Pages::menu_fallback()` (manifest `nav`, labels in `specs/site-pages.csv` `nav_label`) until the owner assigns a WordPress menu.
- Layout rules now met and to keep (audit WL-51, WL-52): on a 390 px phone the calculator starts at about 360 to 440 px (header, breadcrumb on one line, smaller H1 and answer in the `max-width:768px` block); the ten hub links fit one row from 769 px (tablets: full-width row under the logo; 769 to 1199 px tighter padding). The homepage results still sit far down under the appliance list: a design question for this phase. `tools/browser-check.js` fails sideways scroll at phone width.
- Messages box: one `.wl-error` element per tool. An error is red with `role="alert"`; a notice on a valid result gets the extra class `.wl-notice` (amber) and `role="status"`, set by `say()` in `assets/js/wattlyst-tool.js` and by `Wattlyst_Render::tool()` for the server-rendered default. The lookup "no match" line is a notice too. Keep both looks distinct.
- Focus: fields and list cells use the 3 px `--wl-focus` outline; buttons, links, summaries and table scroll boxes use a dark ring outside a yellow band (`:focus-visible` rule after `.wl-btn:hover`). Touch targets 44 px or more.
- Tables: every reference table is built by `Wattlyst_Render::ref_table()`: H2 with a unique id (`wl-t<n>-<slug>`), table `aria-labelledby` that H2, scroll box `.wl-table-wrap` is `role="region" tabindex="0"`. The lookup filter hides whole `section[data-wl-group]` blocks.
- Results: a result card whose value is empty is hidden (`.wl-result[hidden]`), never "n/a" (N6 without a tariff). The WhatsApp text skips hidden cards.
- Live update (WL-35): every committed change recalculates (typed fields on change/blur, selects, list cells, add/remove row); only a pick moves focus to an error. Keep that if the form is restyled.
- JavaScript: `assets/js/wattlyst-tool.js` (runner), `wattlyst-loads.js` (appliance list), new `wattlyst-extra.js` (N11 diagram `drawGrid`, N6 live forecast `forecastFor`; imported only when the page config has `live` or `diagram`; preloaded by `Wattlyst_Head::preload()`), `wattlyst-page.js` (lookup + embed copy). Budget test in `tests/site.test.js` now measures every tool page with the modules it loads; the list pages on `load.js` have under 1 KB left, so the redesign should add CSS, not browser JavaScript.
- Brand files (logo, favicon, Apple touch, OG, Twitter) are in `assets/brand/` (SVG sources + PNG) and named in `data/site.json`; `tests/site.test.js` checks they exist.

**What is where (audit Phase 6: WL-29, 31, 35, 51, 52, 53, 54, 59, 60, 61, plus one bug found while checking)**
- WL-29 messages: `engine/core.js` `num()`: an input's own code ending `_invalid`/`_out_of_range` covers every failure; any other own code (range or required) only covers blank/out-of-range, so text gives `<field>_invalid` and a huge number `<field>_too_large`. Rule in `specs/formulas.md` "Input error codes", three new spec cases (battery_runtime). `engine/messages.js`: row messages count from 1 and name the column rule (hours, quantity, starting watts), `appliance_<n>_invalid` (sanctioned load) included; `errorMessage(code, labels, choices)` says "Choose X from the list" for select fields (the browser passes the names of fields with options).
- WL-31: N6 shows the amber notice `forecast_unavailable` when the Open-Meteo fetch fails and the typical day is shown; blank tariff hides the value card.
- C8 fuel calculator (found by the all-pages browser run): the browser had no fuel curve (`fuel_data_missing` after Calculate on the live site). `tools/build.js` now ships `manifest.data.generator_fuel` (curve and price per fuel only, `browserFuel()`); `tests/calc-text.test.js` builds the browser data from the manifest exactly as `tool_data()` does and fails on a missing key; `tools/browser-check.js` fails when the default inputs give an error.
- Plugin version 0.7.5.

**What is where (audit Phase 5: WL-11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 23, 47, 48, 49, 50)**
- New test file `tests/calc-text.test.js`: (1) numbers in words that repeat a figure the page prints (`wordsToNumber`; bare "hundred" and "a/one thousand" as the kW factor are skipped; fixed facts go in the page's `literal_numbers`); (2) "how" templates: no `{{d.x}}` for a default the user can edit, no `|int` on an input, no digits glued to a placeholder; (3) every "how" text rendered with edited inputs (each numeric field × two factors) in the browser's data context: never blank, and every printed "a × b = c" / "a ÷ b = c" pair adds up (`wrongArithmetic`); (4) solar prices never fall as size rises (data and engine sweep); (5) price points dated, re-checked, within the age limit, one publisher per size; (6) one FPA source.
- "How" text (WL-12): the browser renders it with `{ in, out, d, data }` (`assets/js/wattlyst-tool.js`; `data` was missing, so W1's text went blank after Calculate). Engines now echo inputs the text needs: `charge_controller` (panel_w, battery_v / isc, n_parallel), `solar_size` (monthly_units), `panel_for_12v` (margin), `solar_price_estimate` (system_w).
- Display rounding (WL-16): `engine/format.js` specs `up`, `up1`, `up2` (minimum sizes rounded up) and `hm` now floors minutes (runtimes). Rule in `specs/formulas.md` "Display rounding". Pages using `up*`: B4, D3, D4, D5, D8, D12, D13, H1, N13, N14.
- Page text tables (WL-23): `tools/build.js` runs table rows once into `scope.table`, so text can use `{{table.N.in.x}}` / `{{table.N.out.x}}` (C7 uses it for the 7 kVA row). Tariff figures in text come from `{{data.tariff...}}`.
- FPA (WL-13): the monthly FPA lives only in `data/bill-index.json` months; `tools/build.js` `loadInputs()` sets `data.fpa_latest` = newest NEPRA-verified month; F14 pre-fills and names it. `data/tariff-pk-2026.json` has no FPA copy.
- Income tax (WL-14c, WL-49): `data/tariff-pk-2026.json` `addons_secondary.income_tax_235` (threshold, rate, secondary source, `modelled: false`); F1 to F14 show a key fact, an FAQ (where under 8) and the source. Not in the engine. WL-14 a/b (101-200 slab reading, fixed charge per kW) are listed as open tariff questions in `specs/formulas.md` section F.
- N10 (WL-22): error `inverter_ac_no_payback` when the payback exceeds `ac_life_years` (data/defaults.json, engineer_confirm). N1 (WL-21): spec now matches the engine; FPA/QTA line, six-month history and detection stay page guidance. D3 `off_grid` read with `bool()` (WL-18). C7 has a 7 kVA table row and 7 kVA wording (WL-20). H1 answer and results name the battery bank voltage (WL-48). WebPage schema has `author` on content pages (WL-50).
- Solar prices (WL-11, WL-15, WL-47): `data/solar-prices.json` every source re-fetched 2026-10-14 (`checked`) with `price_date` (+ `price_date_basis` when the page is vague); method in `_meta.method`: points older than `data/maintenance.json` `price_point_max_age_days` are kept in `excluded_points` only; one publisher counts once; larger size never cheaper than the smaller (`raised_to_smaller_size`); Zell.pk system prices excluded as outliers (panel table used). `engine/prices.js` `priceRange` interpolates the total price between sizes (formulas.md N3). `tools/maintenance.js` ages points by `price_date` and skips excluded ones. Solar Price Tracker counts panel publishers from `n_sources`.
- Plugin version 0.7.4.

**What is where (audit Phase 4: WL-36, 37, 38, 40, 41, 42, 44, 62 code part, 63, 64, 65, 66, 67, 69, 70, 71)**
- New class `includes/class-wattlyst-site.php` (`Wattlyst_Site`, loaded by `Wattlyst_Tools`): WordPress-level plumbing for a site without a blog. `gate()` on `template_redirect` priority 1 (before `redirect_canonical`): feeds, author archives (incl. `?author=N`) and archives with no posts are 404; `/page/N/` on a page is 404; uppercase paths 301 to lowercase. `robots()` noindexes date archives. `head_cleanup()` removes feed links, RSD, WLW, generator, shortlink. `headers()` drops X-Pingback and adds `security_headers()` (nosniff, Referrer-Policy, Permissions-Policy, HSTS on https, frame-ancestors/X-Frame-Options SAMEORIGIN). The `/embed/` document sends the same set without the framing rules (`Wattlyst_Endpoints::embed()` calls `send_security_headers( true )`). `rest_endpoints()` hides `/wp/v2/users*` from visitors who are not logged in; `oembed_data()` drops the author. `hide_core_version()` swaps the WordPress version in core `?ver=` for a hash. `remove_version_files()` deletes `readme.html` and `license.txt` in the WordPress root after each sync and core update.
- Sync and cache (WL-36, WL-70): `tools/build.js` puts `assets.content` (hash of every generated file and the inlined CSS) in the manifest, so a data-only deploy changes the manifest hash. `Wattlyst_Pages::maybe_sync()`: a visitor request only schedules the one-off cron event `wattlyst_sync`; admin screens, cron and WP-CLI sync at once. After a sync `purge_cache()` fires LiteSpeed's `litespeed_purge_all`. Pages served from the LiteSpeed cache never reach PHP, so after a deploy the sync starts with the first uncached request (opening wp-admin is the quick way). `tools/wp-test-site.sh` runs the first sync through WP-CLI.
- Managed pages (WL-69): a managed page trashed or drafted in WordPress comes back on the next sync (documented on `ensure()`); to take a page down set its content JSON status to draft.
- `uninstall.php` (WL-71): runs only on Plugins > Delete; removes options, both cron hooks and all quote requests; managed pages go to draft (meta removed), front page setting reset if it pointed at one. A reinstall takes the drafts over again.
- Schema (WL-42): pillar hubs get `dateModified` = newest reviewed date of their live pages (`r.modified` in `build()`, used by `schemaFor`); WebApplication Offer is in PKR.
- Quote form (WL-64, WL-65): `data/site.json` `leads.client_ip_header` (null = REMOTE_ADDR) names the CDN header the hourly limit keys on (`Wattlyst_Leads::client_ip()`); validated in `tools/lib/monetize.js`. The leads note in `site.json` says to keep the page cache time below `token_max_age_days`.
- `.htaccess` now also blocks the plugin `data/` folder (WL-66); nothing in the browser fetches it.
- Tests: `tests/wordpress.test.js` (new). Plugin version 0.7.3.
- Checked on local WP: see the PR description for the curl results.

**Not fixable in the plugin (owner, Hostinger level)**
- WL-40: `http://www.wattlyst.com` takes two hops (to https://www, then to the bare domain). Needs one redirect rule at Hostinger (hPanel or support): any http or www request 301 straight to `https://wattlyst.com` + path.
- WL-36 browser part: HTML is sent with a 7-day browser cache by the server/CDN. Ask Hostinger or set in LiteSpeed Cache > Browser to cache HTML for at most a few hours (the plugin purges the server cache, not visitors' browsers). Keep any cache time below the quote form token age (WL-65).
- WL-63: the plugin sends the headers on WordPress responses; static files (images, JS) get them only from a Hostinger/CDN rule. After deploy, check with `curl -sI https://wattlyst.com/` that the headers survive the CDN.
- WL-62: 2FA and Hostinger login protection for wp-admin (admin username already renamed by the owner).

**What is where (audit Phase 3: WL-04, 05, 06, 17, 25, 26, 27, 28, 30, 32, 33, 34)**
- Browser script split (to stay inside the JS budget): `assets/js/wattlyst-tool.js` is the calculator runner only; `assets/js/wattlyst-loads.js` holds the appliance-list field (`loadsField`, row cap `MAX_ROWS`) and is imported only when the page config has a `loads` field; `assets/js/wattlyst-page.js` holds the error-code lookup filter and the embed page copy buttons, imported only where those elements exist. All three are stripped and stamped into `dist/` by `tools/build.js` `distFiles()`. The head preloads `wattlyst-loads.js` on list pages (`Wattlyst_Head::preload()` now takes the whole tool config). `tests/site.test.js` budget test also measures every list page with the list module.
- N11 diagram (WL-04): wire segments are `.wl-wire` (PHP `battery_grid`, JS `drawGrid`, CSS); `.wl-lead` belongs to the quote form only. Never reuse a class name across the two.
- Phone overflow (WL-05): `.wl-table-wrap` is `position:relative`; `tools/browser-check.js` now fails any page that scrolls sideways at phone width.
- Share links (WL-06, WL-32, WL-34): `?load=` is read from the raw query (each value decoded once, a broken pair skipped); a failed start shows `calculator_failed` from `engine/messages.js` instead of dying silently. Inside an embed the share links point at the canonical tool page. The add-row button and shared links stop at the same row cap.
- Errors (WL-25, WL-26, WL-28, WL-30): `fieldEl(name, code)` in `wattlyst-tool.js` opens a closed "Advanced settings" before focusing, and for list errors reads the row and column from the error code (`load_<row>_<column>_...`) to focus that cell. Field labels keep their case in messages (only a leading capital of a normal word is lowered). On an error the share bar and the N11 diagram hide with the results.
- Typed numbers (WL-17): `engine/core.js` `num()` accepts thousands commas and the lakh grouping; the rule and its limits are in `specs/formulas.md` "Inputs", spec cases in `specs/calculator-test-cases.json` (watts_to_amps).
- No JavaScript (WL-27): tool forms carry `onsubmit="return false"` and a `<noscript>` note (`Wattlyst_Render::tool()`), so Calculate never reloads the defaults. Lookup no-match text reworded with `role="status"` (WL-33). The embed document links the favicon (`Wattlyst_Endpoints::embed()`).
- Plugin version 0.7.2.

**What is where (audit Phase 2: WL-02, 55, 56, 57, 58, 68, 74; still current)**
- Browser module versions (WL-55, WL-56): `tools/build.js` `distFiles()` strips each engine file and `assets/js/wattlyst-tool.js`, hashes all of them into one asset version, and `stampImports` (`tools/lib/strip.js`) adds `?ver=<that hash>` to every relative import. The hash and each engine module's nested imports go to `generated/manifest.json` `assets` (`ver`, `deps`). PHP prints every script tag and modulepreload through `Wattlyst_Tools::script_url()`; the head preloads the whole chain (`module_deps()`), so each module is requested once under one URL. The dynamic calculator import in `wattlyst-tool.js` reuses the `ver` of its own script URL. Never hand-build a `dist/` URL in PHP; `tests/deploy.test.js` checks it.
- Emoji (WL-57): `Wattlyst_Head::no_emoji()` removes the WordPress emoji script and styles (front end, embeds, feeds, email).
- Homepage weight (WL-58, WL-02): the appliance picker catalog in the page config is now `[[category, [ids]]]` (`Wattlyst_Render::catalog_groups`); names come from the appliance data already in the config. The browser builds the list in `loadsField()`. Homepage Lighthouse on local WP went from the high 80s to 98 (three runs).
- CI (WL-68, WL-74): `.github/workflows/ci.yml` actions pinned to commit SHAs with the version as a comment, token read-only. New step `tools/browser-check.js` opens every live page (plus one embed) in headless Chrome at phone width and fails on JS errors, any script fetched twice, the emoji script, a same-site 4xx/5xx, or a blank/NaN result after Calculate (also picks an appliance and adds a row on list pages). It clicks through the DOM, so it does not test layout. Lighthouse gate unchanged (median of 3, all four categories 95+).
- Tests: `tests/deploy.test.js` (new); `tests/engine.test.js` now runs the spec cases on stripped and stamped copies.
- Plugin version 0.7.1 (`wattlyst-tools.php`). The asset hash, not the plugin version, is what busts the browser cache now.

**Owner decisions recorded 2026-10-14 (from the project chat)**
- Hostinger's own /llms.txt deleted by the owner; site title set to Wattlyst (owner asked for a tagline suggestion); GA4, admin username and branch protection are not to be worked on; the owner will arrange the PEC verification work.


**What is where (Phase 6 additions, still current)**
- Ads: `includes/class-wattlyst-ads.php` prints the three manual units (`content-1` after Key facts, `content-2` before Common mistakes, `content-3` after Related calculators) from `Wattlyst_Render::ad()`, and the AdSense loader in the head (`Wattlyst_Head::head`). Switch: `data/site.json` `ads` (enabled, pub id, three slot numbers). Off on home, data, embed, trust pages and on any `?lead=` state. Rules: `specs/seo-rules.md` 8.
- Solar quote form: text `content/lead-form.json`; settings `data/site.json` `leads` (enabled, pages, retention, rate limit); form markup `Wattlyst_Render::lead()` (plain HTML, no JavaScript, so the JS budget is untouched); handler, private "Solar leads" post type, email and retention cleanup in `includes/class-wattlyst-leads.php`. Privacy policy and editorial policy show their quote-form paragraphs only while leads are enabled (`<!--if:leads.enabled-->` in `content/trust/`).
- Affiliates: `data/affiliates.json` (links with pages, url, checked; disclosure text). Printed by `Wattlyst_Render::where_to_buy()` with rel="sponsored". Editorial policy switches its affiliate paragraph on `flags.affiliates` (set in `tools/build.js` `renderTrust`).
- Build side: `tools/lib/monetize.js` validates all three and hands them to the manifest (`site.ads`, `site.leads`) and page JSON (`lead`, `affiliates`).
- Upkeep report: `node tools/maintenance.js` (add `--gsc=<Search Console pages export.csv>` for the quarterly list, `--json` for machines). Read-only; thresholds in `data/maintenance.json`.
- Tests: `tests/monetize.test.js`.

**Monthly routine (build-plan Phase 6)**
1. `node tools/maintenance.js` and work its list.
2. Bill Index: new month at the top of `data/bill-index.json` (NEPRA FPA decision, QTA); FPA entry in `data/tariff-pk-2026.json` addons; re-check the buyback (`net_billing`).
3. Prices: `data/solar-prices.json` + `data/component-prices.json` (old month moved into `data/solar-price-history.json`), fuel prices in `data/generator-fuel.json`. Every change gets `source` + `checked`.
4. Bump `reviewed` in `content/pages/<ID>.json` only for pages someone actually re-checked; the data pages show the new month automatically.
5. `node tools/build.js`, `npm test`, local WP check, PR, merge when green; copy changed `specs/` + `data/` to the project folder.
6. Journalist summary per `specs/offpage-plan.md`; owner checks Search Console + Bing (errors, Core Web Vitals).
- Quarterly (January, April, July, October): owner exports Search Console Pages as CSV; run the report with `--gsc=`; refresh pages at position 8-20 and improve or merge any thin page it lists.

**Do not touch without the matching spec change**
- Same rules as before: `engine/` + `specs/formulas.md` + `specs/calculator-test-cases.json` move together; data values change only with `source` + `checked`; never edit `generated/` or `dist/` by hand.
- Ad positions are fixed by `specs/seo-rules.md` 8 and checked by `tests/monetize.test.js`; never put a unit between inputs and Calculate, under the result, or on a thank-you state.
- Do not switch `leads.enabled` on unless the owner confirms someone handles the requests: the form text promises installers will get them.
- JS budget is still nearly full (see Phase 5 note in git history / `tests/site.test.js`); Phase 6 added no browser JavaScript.

**Open to-dos**
- WL-73 stale branches: owner decision 2026-10-14: keep every branch on GitHub (`phase-1-engine`, `claude/project-thread-*`); they are the owner's working branches. Never delete them.
- JS budget test in `tests/site.test.js` measures the tool script, shared modules and the calculator module, not that module's nested imports (`manifest assets.deps`); the planner (home) and `load.js` pages load more than the test counts. Measuring the whole chain would fail today; worth a decision in the performance phase.
- `tools/browser-check.js` waits for network idle, so locally (no outside internet) skip N6, whose Open-Meteo fetch never settles; CI has internet.
- Audit fix phases still open (as agreed with the owner): 6 UX and accessibility (WL-29, 31, 35, 51-54, 59-61), then the design phase. WL-28 was done in Phase 3. GA4, admin username and branch protection: owner said not needed.
- Engineer Reviewer minor notes (audit Phase 1, not fixed): `cable_rating` (unused) still returns 30 °C two-conductor values; the air-temperature and circuit limits are typed in `engine/messages.js` as well as in data; the over-63 A error text says "single-phase" also on three-phase; E4 table column prints the exact kW while its text says rounded up to a whole kW. PEC notes from the same review: small inverter welders may suit a C curve (D needs a loop impedance check); zero headroom where cable rating ≈ MCB; DC battery feed breaker has no margin; grouping treats every circuit as fully loaded; factors above 1 below the table temperature.
- PEC engineer (owner arranging): the audit questions at the end of `specs/formulas.md` (default air temperature for cable ratings, PV cable table, three-phase and 1 mm² rows, `pf_by_load_type`, welder curve, D5 night battery basis, generator altitude derating, PV cold Voc check, panel list, net billing at 5 kW), plus every `engineer_confirm` list in `data/`.
- Engineer Reviewer notes carried from Phase 5 (data side): fuel curve and fuel prices secondary; October FPA from a news report, KE application unconfirmed; ToU peak hours from the 2023 IESCO schedule; solar price points between 35 and 120 days old are still used (no fresher dated source found on 2026-10-14; the upkeep report lists them each month); `data/component-prices.json` not yet moved to the price_date/one-publisher rule; N6 sky label compares against the yearly average; D11 buyback news-sourced; dispenser and fridge hours; N13 freezer hours meaning; aluminium ampacity not in data; `dc_ac_ratio_max`, `rho_aluminium`, soiling cap need PEC sign-off; reviewer edge cases worth adding to spec cases.
- Carried from Phase 4: W4 has no PV string fuse / Voc check; some calculators do not echo inputs; N5 gas price default typed in page; N7 money defaults illustrative; winter-quarter QTA; net-metering regulation link for the sanctioned-load cap; GEPCO/FESCO/SEPCO/QESCO/TESCO bill links; Inverex and Knox codes.
- Owner-only: see "Owner to do".

## Phase log

| Date | Item | Status | Link |
|---|---|---|---|
| 2026-10-13 | Phase 0: repo + Hostinger Git auto-deploy skeleton (plugin v0.1.0) | done | |
| 2026-10-13 | Phase 1: engine (46 calculators, families A B C D E F W + G tools N1 N3 N4 N5 N7 N8 N9 N10 N11 N12 N14), 127 spec cases, guardrail fuzz, keyword-map SEO lint, CI | tests green, awaiting human PEC engineer review of formulas.md | PR phase-1-engine |
| 2026-10-13 | specs/seo-rules.md (SEO, AEO, GEO/LLM, technical, title/meta, Google + AdSense policies); 25 keyword-map titles/metas fixed to rules | done | PR phase-1-engine |
| 2026-10-13 | Phase 2: page build step (tools/build.js -> generated/), tool/pillar/appliance/guide/trust templates, server-rendered default result, ?load= state with clean canonical, JSON-LD (WebApplication, BreadcrumbList, Article+Person, Organization+WebSite, FAQPage), robots.txt (AI crawlers), core sitemap, /llms.txt, IndexNow, ads.txt (when pub id set), ad slots (off), 7 trust pages, data/appliances.json (87), brand images, header menu by task, plugin v0.3.0 | done: tests green, Lighthouse mobile 100/100/100/100 (tool template + trust pages, local WP + GeneratePress), Engineer Reviewer PASS after fixes | PR phase-2 |
| 2026-10-13 | Phase 3: Wave 1, 24 pages live (table below) + 7 pillar hubs; new engine tools (generator for AC/pump, home load, add-an-AC check, AC units, solar for AC / from loads / for 12 V battery, UPS backup, wire/breaker/cable sizing with data/cable-ampacity.json), 245 spec cases, browser field types (appliance, loads, checkbox), plugin v0.4.0 | done: 436 tests green, zero orphan pages (link test), Engineer Reviewer PASS after fixes, Lighthouse mobile >= 95 on every live page (most 99-100), calculators checked in a headless browser on local WP | PR phase-3 |
| 2026-10-14 | Phase 4: Wave 2, 39 pages live (table below) incl. N1 N2 N3 N4 N5 N7, D14 solar price, Home Power Planner on the homepage (load -> inverter -> battery -> solar -> net billing -> generator), Save as PDF / WhatsApp / copy link, Roman Urdu result toggle, stripped dist/ JS, data/solar-prices.json + data/inverter-codes.json, plugin v0.5.0 | done: tests green, Engineer Reviewer pass, Lighthouse mobile 98-100 on sampled templates, every calculator checked in a headless browser on local WP | PR phase-4 |
| 2026-10-15 | Re-audit fix Phase A, availability (WL-75 cache warm-up after every purge, one page at a time); plugin v0.8.1 | done: tests green, warm-up checked on local WP | PR (this phase) |
| 2026-10-14 | Design Phase 7, premium redesign: new CSS design system (hero with byline, calculator card, headline result, cards for how/facts/related/hubs, dark tables, home task cards with icons, sticky header, dark footer with all hubs), refreshed logo, favicon, Apple/Android icons, OG and Twitter images; no formula, number, data or JavaScript changed; plugin v0.8.0 | done: 649 tests green, 108 live pages checked in a browser on local WP, Lighthouse mobile 98-100 / 100 / 100 / 100 | PR (this phase) |
| 2026-10-14 | Audit fix Phase 6, UX and accessibility (WL-29 specific error messages, WL-31 N6 forecast notice + no n/a, WL-35 one live-update rule, WL-51 calculator higher on phones, WL-52 menu on one row, WL-53 brand green menu/footer, WL-54 amber notices, WL-59 focus ring, WL-60 named tables + focusable scroll boxes, WL-61 notice role; C8 browser fuel data fix); plugin v0.7.5 | done: tests green, 108 pages checked in a browser on local WP | PR (this phase) |
| 2026-10-14 | Audit fix Phase 5, calculations and data (WL-11 price never falls with size, WL-12 how text true after edits + arithmetic test, WL-13 one FPA source, WL-14 tariff questions recorded + income tax note, WL-15/47 price sources re-checked and dated, WL-16 minimum sizes round up / runtimes down, WL-18 off_grid bool, WL-20 C7 7 kVA, WL-21 N1 spec, WL-22 no-payback cap, WL-23 number words, WL-48 battery voltage, WL-49 income tax, WL-50 author schema); plugin v0.7.4 | done: tests green, Engineer Reviewer pass, checked on local WP | PR (this phase) |
| 2026-10-14 | Audit fix Phase 4, WordPress/SEO/security plumbing (WL-36 cache purge after every build, WL-37 author/empty archives 404, WL-38 feeds off, WL-41 lowercase + /page/N/ 404, WL-42 hub dateModified + PKR, WL-44 generator/core ver/readme, WL-62 users REST hidden, WL-63 security headers, WL-64 CDN client IP header setting, WL-65 note, WL-66 data/ blocked, WL-67 RSD/pingback, WL-69 documented, WL-70 sync off the visitor request, WL-71 uninstall.php); WL-40 is a Hostinger rule (owner to do); plugin v0.7.3 | done: tests green, checked on local WP with curl | PR #12 |
| 2026-10-14 | Audit fix Phase 3, visible UI bugs (WL-04 N11 wires, WL-05 phone overflow, WL-06 % in share links, WL-17 "1,500" accepted, WL-25 closed Advanced settings, WL-26 list row focus, WL-27 no-JS Calculate, WL-28 label case, WL-30 stale share/diagram, WL-32 embed share URL + favicon, WL-33 lookup text, WL-34 row cap); list and lookup code split out of the tool script; plugin v0.7.2 | done: tests green, every live page checked in headless Chrome on local WP incl. the new sideways-scroll check; only input parsing changed in the engine (spec cases added) | PR #11 |
| 2026-10-14 | Audit fix Phase 2, deploy safety and homepage speed (WL-02 homepage Lighthouse, WL-55 modules fetched once, WL-56 versioned imports, WL-57 emoji script removed, WL-58 catalog shipped once, WL-68 CI actions pinned, WL-74 browser smoke test + deploy tests; WL-73 branches kept by owner decision); plugin v0.7.1 | done: tests green, CI green, homepage Lighthouse 98 on local WP, every live page checked in headless Chrome; no formula or number changed | PR #9 |
| 2026-10-14 | Audit fix Phase 1, wiring safety (WL-01 DC voltage, WL-07 temperature and grouping derating, WL-08 three-phase ratings, WL-09 one Pakistani cable size rule, WL-10 AC power factor so W1 and E4 agree, WL-19 welder D curve, WL-24 PEC questions); W1 W2 W3 W5 E4 text updated | done: tests green, Engineer Reviewer pass, wiring pages checked on local WP | PR #8 |
| 2026-10-14 | Phase 6: monetize and maintain: three manual AdSense units per tool page (off until approval), solar quote request form with private Solar leads inbox, email and retention cleanup (off until the owner switches it on), affiliate "Where to buy" box with rel=sponsored and disclosure (empty until a programme is joined), privacy and editorial policy sections, upkeep report tools/maintenance.js, monthly scheduled task, plugin v0.7.0 | done: tests green, Engineer Reviewer pass (no formula or calculator change), Lighthouse mobile 98-100 with the form on, form and ads checked on local WP | PR phase-6 |
| 2026-10-14 | Phase 5: Wave 3, 24 pages live (table below); Pakistan Electricity Bill Index and Solar Price Tracker data pages (chart, CSV, Dataset schema, journalist summary) under the new /data/ hub; embeddable calculators (iframe + script, credit link, /embed-calculators/); live solar forecast (N6), generator fuel (C8), panel price (D9), mosque/shop solar (N13), battery wiring diagram (N11); off-page plan; plugin v0.6.0 | done: tests green, Engineer Reviewer must-fixes all fixed (notes in handoff), Lighthouse mobile 96-100 on new templates, checked in a headless browser on local WP | PR #6 |

## Owner to do
- Audit Phase 4: one Hostinger redirect so http and www go straight to https://wattlyst.com (WL-40); HTML browser cache time of a few hours in LiteSpeed/Hostinger (WL-36); after deploy, open wp-admin once so the new build syncs and the cache is purged; before switching on the quote form, ask Hostinger which header carries the visitor IP and put it in data/site.json leads.client_ip_header (WL-64); 2FA for wp-admin.
- Phase 6: after AdSense approval put the pub id and three ad unit numbers in data/site.json ads and set enabled (or ask Claude); turn on Google's Privacy & messaging consent message in AdSense and name it in consent.cmp. Decide whether to switch on the solar quote form (leads.enabled) once someone answers requests; join affiliate programmes and send the links. Each quarter export Search Console > Performance > Pages as CSV for the refresh list.
- Phase 5: request indexing for the 24 wave-3 URLs, /data/, the two data pages and /embed-calculators/; create brand profiles (YouTube, Facebook, X, LinkedIn) and add them to data/site.json organization_same_as; start outreach per specs/offpage-plan.md; buy an Open-Meteo API plan for commercial use (or ask to drop the live forecast); refresh the Bill Index, fuel and solar prices monthly.
- Phase 4: request indexing for the 39 wave-2 URLs; apply for AdSense; refresh `data/solar-prices.json` and the FPA entry monthly (source + checked date).
- Phase 3: request indexing in Google Search Console and Bing for the 24 wave-1 URLs (sitemap already lists them). Fill `data/site.json` reviewer once a PEC engineer signs off on `specs/formulas.md` (open questions are listed at its end) and the `engineer_confirm` lists in `data/cable-ampacity.json` and `data/appliances.json`.
- Net-billing buyback rate (`data/tariff-pk-2026.json` net_billing): no NEPRA notification found on 2026-10-13, only news reports; the D10 page says so. Replace with the NEPRA page and set `buyback_verified` when it exists (re-check monthly).
- WordPress: Settings > Reading keep "Discourage search engines" OFF on live; Customizer > Site Identity: optional (plugin already shows logo + favicon).
- LiteSpeed Cache + Cloudflare (speed stack in build-plan Phase 2); Google Search Console + Bing Webmaster Tools: submit https://wattlyst.com/wp-sitemap.xml (or the Rank Math sitemap).
- Brand profiles (YouTube, Facebook, X, LinkedIn page) -> data/site.json organization_same_as.
- After AdSense approval: ads.adsense_pub_id + a Google-certified CMP name in data/site.json.

## Not in engine yet (need data first)
- Gas generators (no fuel data), aluminium cable ampacity, K-Electric ToU hours.

## Pages (from specs/keyword-map.csv)

| ID | URL | Status | PR | Date |
|---|---|---|---|---|
| H1 | / (home, Home Power Planner) | live | phase-4 | 2026-10-14 |
| H2 | /appliances/ | live | phase-3 | 2026-10-13 |
| H9 | /guides/inverter-vs-ups/ | live | phase-3 | 2026-10-13 |
| B1 | /battery/battery-backup-time-calculator/ | live | phase-3 | 2026-10-13 |
| B2 | /battery/12v-battery-runtime-calculator/ | live | phase-3 | 2026-10-13 |
| B3 | /battery/200ah-battery-backup-time-calculator/ | live | phase-3 | 2026-10-13 |
| B5 | /battery/ups-backup-time-calculator/ | live | phase-3 | 2026-10-13 |
| C5 | /generator/generator-for-well-pump/ | live | phase-3 | 2026-10-13 |
| C6 | /generator/generator-for-1-5-ton-ac/ | live | phase-3 | 2026-10-13 |
| D4 | /solar/inverter-size-calculator/ | live | phase-3 | 2026-10-13 |
| D5 | /solar/solar-panels-to-run-ac/ | live | phase-3 | 2026-10-13 |
| D6 | /solar/solar-panel-for-12v-battery/ | live | phase-3 | 2026-10-13 |
| D8 | /solar/solar-system-for-5-marla-house/ | live | phase-3 | 2026-10-13 |
| D10 | /solar/net-billing-calculator/ | live | phase-3 | 2026-10-13 |
| E1 | /load/home-electrical-load-calculator/ | live | phase-3 | 2026-10-13 |
| E3 | /load/single-phase-load-calculator/ | live | phase-3 | 2026-10-13 |
| E4 | /load/load-before-adding-ac/ | live | phase-3 | 2026-10-13 |
| E5 | /load/ac-units-calculator/ | live | phase-3 | 2026-10-13 |
| F1 | /bill/electricity-bill-calculator-pakistan/ | live | phase-3 | 2026-10-13 |
| F2 | /bill/lesco-bill-calculator/ | live | phase-3 | 2026-10-13 |
| F12 | /bill/k-electric-bill-calculator/ | live | phase-3 | 2026-10-13 |
| W1 | /wiring/wire-size-for-1-5-ton-ac/ | live | phase-3 | 2026-10-13 |
| W2 | /wiring/wire-size-calculator/ | live | phase-3 | 2026-10-13 |
| W3 | /wiring/breaker-size-calculator/ | live | phase-3 | 2026-10-13 |
| P-B P-C P-D P-E P-F P-W P-G | pillar hubs | live (auto, with first child) | phase-3 | 2026-10-13 |
| A3 | /converters/12v-watts-to-amps-calculator/ | live | phase-4 | 2026-10-14 |
| A4 | /converters/230v-watts-to-amps-calculator/ | live | phase-4 | 2026-10-14 |
| A8 | /converters/kva-to-kw-calculator/ | live | phase-4 | 2026-10-14 |
| A9 | /converters/va-to-watts-calculator/ | live | phase-4 | 2026-10-14 |
| A10 | /converters/ah-to-wh-calculator/ | live | phase-4 | 2026-10-14 |
| B4 | /battery/battery-bank-size-calculator/ | live | phase-4 | 2026-10-14 |
| C7 | /generator/what-can-a-kva-generator-run/ | live | phase-4 | 2026-10-14 |
| D1 | /solar/solar-battery-size-calculator/ | live | phase-4 | 2026-10-14 |
| D2 | /solar/solar-panel-wattage-calculator/ | live | phase-4 | 2026-10-14 |
| D3 | /solar/off-grid-solar-calculator/ | live | phase-4 | 2026-10-14 |
| D7 | /solar/solar-system-size-calculator/ | live | phase-4 | 2026-10-14 |
| D12 | /solar/solar-system-for-10-marla-house/ | live | phase-4 | 2026-10-14 |
| D13 | /solar/solar-system-for-1-kanal-house/ | live | phase-4 | 2026-10-14 |
| D14 | /solar/solar-system-price-pakistan/ | live | phase-4 | 2026-10-14 |
| D15 | /solar/tubewell-solar-calculator/ | live | phase-4 | 2026-10-14 |
| D16 | /solar/charge-controller-size-calculator/ | live | phase-4 | 2026-10-14 |
| E2 | /load/appliance-load-calculator/ | live | phase-4 | 2026-10-14 |
| E6 | /load/unit-calculator/ | live | phase-4 | 2026-10-14 |
| F3 | /bill/iesco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F4 | /bill/mepco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F5 | /bill/gepco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F6 | /bill/fesco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F7 | /bill/pesco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F8 | /bill/hesco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F9 | /bill/sepco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F10 | /bill/qesco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F11 | /bill/tesco-bill-calculator/ | live | phase-4 | 2026-10-14 |
| F14 | /guides/fpa-in-electricity-bill/ | live | phase-4 | 2026-10-14 |
| W4 | /wiring/solar-cable-size-calculator/ | live | phase-4 | 2026-10-14 |
| H3 | /appliances/ceiling-fan/ | live | phase-4 | 2026-10-14 |
| H5 | /appliances/water-motor-1hp/ | live | phase-4 | 2026-10-14 |
| H7 | /appliances/iron/ | live | phase-4 | 2026-10-14 |
| H8 | /guides/lithium-vs-tubular-battery/ | live | phase-4 | 2026-10-14 |
| N1 | /bill/bill-audit-overbilling-checker/ | live | phase-4 | 2026-10-14 |
| N2 | /troubleshoot/inverter-error-codes/ | live | phase-4 | 2026-10-14 |
| N3 | /solar/solar-quote-checker/ | live | phase-4 | 2026-10-14 |
| N4 | /bill/sanctioned-load-calculator/ | live | phase-4 | 2026-10-14 |
| N5 | /load/winter-heating-cost-calculator/ | live | phase-4 | 2026-10-14 |
| N7 | /load/ups-vs-solar-vs-generator-cost/ | live | phase-4 | 2026-10-14 |
| P-A P-T | pillar hubs (converters, troubleshoot) | live (auto, with first child) | phase-4 | 2026-10-14 |
| A1 | /converters/watts-to-amps-calculator/ | live | #6 | 2026-10-14 |
| A2 | /converters/amps-to-watts-calculator/ | live | #6 | 2026-10-14 |
| A5 | /converters/3-phase-current-calculator/ | live | #6 | 2026-10-14 |
| A6 | /converters/amps-to-kw-calculator/ | live | #6 | 2026-10-14 |
| A7 | /converters/volts-to-watts-calculator/ | live | #6 | 2026-10-14 |
| C1 | /generator/generator-size-calculator/ | live | #6 | 2026-10-14 |
| C2 | /generator/generator-wattage-calculator/ | live | #6 | 2026-10-14 |
| C3 | /generator/generator-starting-watts-calculator/ | live | #6 | 2026-10-14 |
| C4 | /generator/running-vs-starting-watts/ | live | #6 | 2026-10-14 |
| C8 | /generator/generator-fuel-consumption-calculator/ | live | #6 | 2026-10-14 |
| D9 | /solar/solar-panel-price-pakistan/ | live | #6 | 2026-10-14 |
| D11 | /guides/net-billing-pakistan/ | live | #6 | 2026-10-14 |
| F13 | /guides/peak-hours-pakistan/ | live | #6 | 2026-10-14 |
| W5 | /wiring/voltage-drop-calculator/ | live | #6 | 2026-10-14 |
| H4 | /appliances/refrigerator/ | live | #6 | 2026-10-14 |
| H6 | /appliances/electric-geyser/ | live | #6 | 2026-10-14 |
| N6 | /solar/solar-forecast-tomorrow/ | live | #6 | 2026-10-14 |
| N8 | /load/ebike-charging-cost-calculator/ | live | #6 | 2026-10-14 |
| N9 | /load/ac-temperature-saving-calculator/ | live | #6 | 2026-10-14 |
| N10 | /load/inverter-ac-payback-calculator/ | live | #6 | 2026-10-14 |
| N11 | /troubleshoot/battery-series-parallel-calculator/ | live | #6 | 2026-10-14 |
| N12 | /solar/solar-panel-cleaning-loss-calculator/ | live | #6 | 2026-10-14 |
| N13 | /solar/solar-for-mosque-and-shop/ | live | #6 | 2026-10-14 |
| N14 | /solar/solar-autonomy-calculator/ | live | #6 | 2026-10-14 |
| P-X | /data/ | live | #6 | 2026-10-14 |
| bill-index | /data/pakistan-electricity-bill-index/ | live | #6 | 2026-10-14 |
| solar-price-tracker | /data/pakistan-solar-price-tracker/ | live | #6 | 2026-10-14 |
| embed | /embed-calculators/ | live | #6 | 2026-10-14 |
