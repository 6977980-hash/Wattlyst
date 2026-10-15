# Progress

## Handoff for next phase (after the homepage compact layout) — written by the decision engine thread, 2026-10-15

Owner asked for a compact homepage, arrangement only ("han" to the audit in `/mnt/project-files/electricity-tool-hub/audit/homepage-compact-2026-10-15.md`). Plugin v0.8.14. No formula, data, engine or page text changed.

**What is where**
- Folds, all text still in the HTML: `Wattlyst_Render::how( true )` (home "how" as one `<li>` per sentence, first three shown, checkbox toggle `.wl-tg`/`.wl-tg-l`, no script), `key_facts( 3 )` (rest under `details.wl-more`), `sections( true )` (first paragraph open, rest under "Read more"). Only the home branch of `html()` passes these flags.
- Live redraw: `assets/js/wattlyst-extra.js` `drawTable` marks `tr.wl-rec` (row naming "(recommended)"), `td.wl-good`/`td.wl-bad` (net "saved"/"cost"), `data-l` column labels, and re-splits the live "how" text into steps (`[data-wl-steps]`); `wattlyst-tool.js` now calls `drawTable` after the "how" text is set. `rtable()` in PHP prints the same marks.
- CSS: marks, `.wl-tg` toggle and the phone card view of the split-mode setups table are in `assets/css/wattlyst.css` (after `.wl-rtable`); home-only compaction (fields in three columns, loads header on phones, phone task cards as hub tiles, info grid, `#wl-h1` rules) in `assets/css/wattlyst-home.css`.

**Do not touch / watch**
- `assets/css/wattlyst-home.css` is near its 20 KB test budget, and the homepage JS budget has under 100 bytes left: put new shared styles in `wattlyst.css`, new script in `wattlyst-extra.js`.
- Touch targets stay 44 px (design test).

**Open to-dos**
- Phone task cards now show only the hub (tools are on the hub page); revisit if the owner wants tool links back on phones.
- Everything open from the decision engine handoff below still stands.

## Earlier handoff (after the Home Power Decision Engine and its combo setup) — written by the decision engine thread, 2026-10-15

Owner approved idea 7 of their pasted suggestions ("han", 15 Oct 2026): the homepage planner now also picks a setup. Plugin v0.8.12, PR #27. Owner then asked for a fourth setup, on-grid solar + UPS or generator ("bna do"): plugin v0.8.13. Formula and numbers live only in `specs/formulas.md` ("Home Power Decision Engine" bullet in "Owner-approved tools") and the `home_decision` cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- Engine: `engine/decision.js` `home_decision` (H1's calc now; runs `home_plan` unchanged, then prices on-grid solar, hybrid, UPS/generator and the combo of on-grid solar with that UPS/generator). Helpers it uses live with their data: `priceRange` and `inverterAt` in `engine/prices.js`, `backupAtEnd` and `standbyFor` (N7 run + UPS-or-generator choice, shared by the standby and combo setups) in `engine/backup.js`, `bill_total` in `engine/bill.js`. Registered in `engine/index.js`, `ENGINE_MODULES` and `MODULE_DATA.decision` in `tools/build.js`.
- Data: `data/defaults.json` `decision_years`, `hybrid_bank_v` (engineer_confirm); `data/component-prices.json` 4 kW hybrid row `export_capable: false` (off-grid units, skipped); browser copy of `component_prices` and `solar_prices` now carries `n_sources` (and `export_capable`).
- Page: `content/pages/H1.json` (fields `budget_rs`, `years`; first six outputs; `result_table` key `setups`; answer, key fact, step-seven paragraph, FAQ "Which is better..."; `how`/`how_ur` end with the engine sentence `decision_text`, one line per setup plus the decision).
- Render: in the split (home) form the result table sits after `.wl-out`, under the inputs (`.wl-tool-split>.wl-rtable` in `assets/css/wattlyst-home.css`); `Wattlyst_Render::data_used()` prints "Data and prices used" with dates from `data_checked` (`dataChecked` branch `decision` in `tools/build.js`).
- Tests: `tests/calc-text.test.js` "every tool page gives the same default result with the browser copy of the data" (it caught the `n_sources` bug: every live D14/N3 result showed the low-confidence notice).

**Do not touch / watch**
- JS budget: H1 now has under 200 bytes headroom in the 30 KB test (tool script + base + `decision.js` + loads list). The test still ignores nested imports; the real homepage chain grew by about 20 KB uncompressed (decision, backup, prices, extra). Put new decision code in `prices.js`/`backup.js` helpers or shrink first.
- The UPS grid recharge (standby and combo) counts only the units on top of the backup load, which is already in the home's monthly units (`standbyFor`, Engineer Reviewer). Keep N7's own `backup_compare` total as it is (no planner there).
- `decision_text` is English even in Roman Urdu mode (engine-built so edge states read right).
- When refreshing `component-prices.json`, mark any hybrid row whose models cannot export with `export_capable: false`.

**Open to-dos**
- [ENGINEER] hybrid inverter premium and export-capable rows, `hybrid_bank_v` 48 V, battery lives.
- Not counted (page says so): installation of UPS/generator, leftover battery value, price changes over the years.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after SERP ideas 1, 2 and 4) — written by the growth thread, 2026-10-15

Owner approved all four SERP ideas from the growth plan ("4ron idea cover krny hain"). Idea 3 (DISCO option) needed nothing: the eleven DISCO bill calculators F2 to F12 have been live since Phase 3. Plugin v0.8.11. No formula changed.

**What is where**
- Idea 1, units ladder: steps in `data/bill-index.json` `ladder`; table, CSV rows and `ds.ladder.*` scope (incl. the lifeline line) in `tools/lib/datasets.js` `billIndex`; text in `content/pages/bill-index.json` (key fact 3, FAQ 3). Test: `tests/calc-text.test.js` "units ladder".
- Idea 4, engine numbers in titles: a `{{placeholder}}` in a `title`/`meta_description` cell of `specs/keyword-map.csv` or `specs/site-pages.csv` is rendered by `tools/build.js` with the page's own scope (`ctx.scope` set at the end of `buildContent`). Used on E5, D9, bill-index, solar-price-tracker. Rule: `specs/seo-rules.md` section 2. The SEO lint tests (`tests/keyword-map.test.js`, `tests/site.test.js`) check the rendered title; `title_len` of a templated row is informative only.
- Idea 2, Inverex Nitrox codes: brand `inverex-nitrox` in `data/inverter-codes.json` (F01 to F64, Inverex NITROX-12KW manual on ManualsLib), N2 text in `content/pages/N2.json`.

**Do not touch / watch**
- Inverex Veyron/Aerox stay out until a manual carrying Inverex's name is found (the ManualsLib "APT Veyron" manuals do not name Inverex).
- A templated title must stay 30 to 60 characters for any realistic data value; the lint fails the build if a refresh pushes it out.

**Open to-dos**
- Owner items from the growth handoff below (indexing, Bing import, brand profiles, outreach) still stand.

## Earlier handoff (after the growth phase: indexing + off-page plan) — written by the growth thread, 2026-10-15

Owner said "next phase new thread"; no build phase was left, so this was the off-page/growth phase from `specs/offpage-plan.md`. Plugin v0.8.10. No formula, number, data or page text changed.

**What is where**
- Owner action plan with drafts (indexing steps, brand profiles, journalist/installer/university emails, forum answer drafts, SERP content-gap ideas, tracking sheet): Claude Doc "Wattlyst growth plan: October 2026", https://claude.ai/code/artifact/cd425966-5265-4b0c-b9e3-9a3d32958ef3 . `specs/offpage-plan.md` section 6 points to it.
- IndexNow batch: `Wattlyst_Pages::maybe_sync` fires `wattlyst_synced` after sync + purge; `Wattlyst_Endpoints::indexnow_changed` sends every live page whose manifest `lastmod` differs from option `wattlyst_indexnow_sent` in one request and saves the dates only on HTTP 200/202. `indexnow_on_publish` now covers only the owner's own (unmanaged) posts; `Wattlyst_Pages::$syncing` keeps it quiet during a sync. Production host only. Test: `tests/wordpress.test.js` "IndexNow".

**Do not touch / watch**
- The batch depends on `lastmod` (reviewed || modified in the content JSON). A page whose text changes without a new `reviewed`/`modified` date is not re-announced; bump the date when a page really changes.
- Never post, email or reach out for the owner; drafts go in the growth doc.

**Open to-dos**
- Owner: Search Console request-indexing for the 10 listed URLs, Bing Webmaster import from GSC, create LinkedIn/Facebook/X/YouTube profiles and send the URLs (then add them to `data/site.json` `organization_same_as`, build, merge).
- Owner decision on the 4 SERP content-gap ideas in the growth doc (units table 50 to 1,000 on the Bill Index, Inverex/Nitrox codes, DISCO option on F1, engine numbers in titles). None is built.
- Everything open from the earlier handoffs below still stands (PEC reviewer, hPanel items, monthly data refresh, GST on export credit).

## Earlier handoff (after the planner whole-bill saving, net billing group B) — written by the net billing review thread, 2026-10-15

Owner said "baqi fixes pe kaam kro": group B from the net billing review is built in plugin v0.8.9. The Home Power Planner now shows the saving on the whole bill (headline result) and, below it, the energy-charge part.

**What is where**
- Rule: `specs/formulas.md` H1 planner paragraph ("Whole bill"). Engine: `engine/planner.js` `home_plan` calls `bill_total` from `engine/bill.js` twice (all units before, imported units after) and sets the export credit against the bill after GST; outputs `full_before_rs`, `full_import_rs`, `export_credit_rs`, `full_after_rs`, `full_carry_forward_rs`, `full_saving_rs`, `fixed_before_rs`, `fixed_after_rs`, `gst_pct`.
- Page: `content/pages/H1.json` outputs (`full_saving_rs` first, `saving_rs` labelled "Of which energy charge"), answer, step text, FAQ, `how`/`how_ur`. Spec cases: the default home_plan case carries the whole-bill values; a new case covers a credit larger than the import bill.

**Do not touch / watch**
- GST on the export credit is the cautious reading (not reduced by exports), marked [VERIFY] in formulas.md; change it only with a real net-billing bill as the source.
- QTA and FPA are zero in the planner (no period input); the bill calculators keep them.

**Open to-dos**
- Confirm the GST treatment from a prosumer's net-billing bill.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after the net billing buyback fix) — written by the net billing review thread, 2026-10-15

Owner asked to check an outside review of the net billing / solar saving figures and approved fix groups A (buyback rate from NEPRA), C (planner inverter wording) and D (NEPRA basis line). Group B (planner saving on the whole bill: fixed charge, surcharges, GST) is not built; it waits for the owner and for the open GST-on-export-credit question. Review verdict and sources: `/mnt/project-files/electricity-tool-hub/audit/net-billing-review-2026-10-15.md`. Plugin v0.8.8.

**What is where**
- Buyback value, basis, primary NEPRA links, the cutoff date for old agreements and the calendar year it applies to: `data/tariff-pk-2026.json` `net_billing` (only place; pages read it through `{{data.tariff.net_billing.*}}` and `@data.tariff.net_billing.buyback_rs_per_unit_default`). Rule text: `specs/formulas.md` section F net billing line and the H1 planner paragraph.
- Engines reading the default: `engine/bill.js` `net_billing`, `engine/planner.js` (via net_billing), `engine/seasonal.js` (N17). Pages with buyback wording: D10, D11 (sources now NEPRA documents), H1 (FAQ, intro line, hint), N8, N12, N17.
- H1 "how" text (English and Roman Urdu): solar sentence now comes before the inverter sentence and names the installed array kW.
- Google Search Console verification (owner asked in the same session): code in `data/site.json` `verification.google`, shipped in manifest `site.verification`, printed by `Wattlyst_Head::verification()` on the front page only. Removing it unverifies the property.

**Do not touch / watch**
- The buyback is set per calendar year by NEPRA's power purchase price decision: re-check every January (and on any NEPRA revision notice); change only `data/tariff-pk-2026.json` and the dependent spec case values.
- The spec case "Import 400, export 300 units, buyback 11" uses an explicit 11 on purpose (editable field), keep it.

**Open to-dos**
- ~~Group B (whole-bill saving in the planner)~~ built in v0.8.9, see the handoff above.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after N17, N18 and the N7 upgrade: SERP ideas 2 to 4) — written by the cross-check thread, 2026-10-15

Owner said "bna do" (15 Oct 2026) to the three remaining SERP ideas. Built in plugin v0.8.7: idea 2 as N17 (`/solar/solar-size-from-electricity-bill/`), idea 4 as N18 (`/wiring/home-wiring-load-schedule/`), idea 3 as an upgrade of the existing N7 page (same URL `/load/ups-vs-solar-vs-generator-cost/`). Formulas and numbers are never repeated here: `specs/formulas.md` "Owner-approved tools" holds N17, N18 and N7; cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- Engines, each its own module so no other page ships it (registered in `engine/index.js`, `ENGINE_MODULES` and `MODULE_DATA` in `tools/build.js`): `engine/seasonal.js` `solar_seasonal` (N17, monthly city PV output `pvout_month` in `data/cities-pk.json`; the month split uses the H1 daylight share), `engine/circuits.js` `circuit_schedule` (N18, runs section W `wire_size` per row; row errors are `load_<row>_<code>`), `engine/backup.js` `backup_compare` (N7; the old `tco` engine and its cases stay in `engine/load.js`).
- Data: `data/backup-prices.json` (new: UPS and petrol generator price ranges, oil upkeep, tubular unit, lithium pack, battery lives, each with sources). N7 also reads `data/component-prices.json` (handed to the browser as `manifest.data.component_prices`), `data/solar-prices.json`, `data/generator-fuel.json`. `data/defaults.json` `pf_by_load_type` gained `resistive` (changes W1/W3/E4/N18 for heaters; case "Storage geyser"). `data/cable-ampacity.json` `min_area_mm2` source corrected (BS 7671 for the lighting minimum; new PEC question (11) in formulas.md).
- Result table (generic, new): content key `result_table` {key, caption, columns}; `tools/build.js` `resultTable()` → `tool.rtable` (rows rendered at build, `cap` = live caption template); PHP `Wattlyst_Render::rtable()`; browser `drawTable()` in `assets/js/wattlyst-extra.js` (caption re-rendered each calculation). The tool script loads extra.js when `cfg.rtable` is set and shares the `diagram` element lookup.
- Appliance list `length` flag (N18): the "Hours a day" column becomes "Cable length (m)" in `loads_field` (PHP), config and `assets/js/wattlyst-loads.js`; share links now encode fixed positions per row.
- Messages: row prefix lookup in `errorMessage` (`load_<n>_<plain code>` reuses the plain message); `monthly_units_all_zero`, `length_invalid`.
- Pages: `content/pages/N17.json`, `N18.json`, `N7.json` (rewritten for `backup_compare`). Keyword rows N17, N18 in `specs/keyword-map.csv` (CRLF). Links: D7, D8, D11 → N17; W2, W3, W5 → N18.

**Do not touch / watch**
- JS budget test (`tests/site.test.js`) leaves E1 with under 100 bytes of headroom; any byte added to `wattlyst-tool.js`, `format.js`, `messages.js` or `core.js` may fail it. The test does not count nested engine imports, so real totals on N16, E1 and N18 are already above the 30 KB line: a better budget test (whole import chain) is an open to-do.
- N7 prices are middle of retailer ranges (equipment only); refresh `data/backup-prices.json` monthly with `component-prices.json`. Battery lives and oil interval are [ENGINEER].

**Open to-dos**
- Engineer Reviewer nice-to-haves left: N18 design-watts column for inverter ACs, microwave curve, N17 `kw` and N7 `panel_w` bounds; N7 oil sump per generator size, 24 V hybrid vs 51.2 V pack match, minimum panels per MPPT string, inverter standby draw; refresh the petrol price from OGRA. UPS charger amps in `data/backup-prices.json` are retailer-listing values (engineer to confirm).
- Owner hPanel items from the re-audit are still open.

## Earlier handoff (after N16, the AC bill calculator) — written by the cross-check thread, 2026-10-15

Owner approved SERP idea 1 on 15 Oct 2026 ("Haan, banao"). Built as page N16 at `/bill/ac-bill-calculator/` (plugin v0.8.6). Formulas and numbers are never repeated here.

**What is where**
- Engine: `engine/acbill.js` `ac_bill_impact` (own module so the appliance-list pages on `load.js` do not ship `bill.js`; registered in `engine/index.js`, `ENGINE_MODULES` and `MODULE_DATA.acbill = ['tariff']` in `tools/build.js`). It reuses `ac_units` (E5) and `bill_total` (F) and adds the protected-loss penalty. Formula: `specs/formulas.md` "Owner-approved tools (added 2026-10-15)"; 7 spec cases at the end of `specs/calculator-test-cases.json`.
- Notice: `ac_protected_lost` in `engine/messages.js` (`noticeCode` returns it when `protected_lost`), amber on the default result.
- Page: `content/pages/N16.json` (silo F, bill hub). Keyword row N16 in `specs/keyword-map.csv` (id N15 was skipped on purpose: the owner removed an earlier N15). "ac bill calculator" and "ac bill calculator pakistan" moved from E5 to N16; E5's H2 no longer says "AC bill calculator" and its Next step is N16. N16 is also linked from F1 and N10.
- SERP ideas 2 to 4 were approved and built later the same day (see the handoff above).

**Do not touch**: keep N16 off `load.js` (JS budget on the list pages). The design cross-check notes below still hold.

## Earlier handoff (after the design cross-check) — written by the cross-check thread, 2026-10-15

Owner (15 Oct 2026): cross-check the new design against all earlier work and fix anything it broke; look at the SERP for an idea nobody does (ideas need the owner's yes before any build). Fixed in plugin v0.8.5, CSS only. No formula, number, data or JavaScript changed. Formulas and numbers are never repeated here.

**What was checked** (local WP + GeneratePress, every live page at 390 and 1280 px, measured before (v0.8.3) and after (v0.8.4)): tests, build check, CI browser check and Lighthouse (green on PR #19), label/hint/input overlap, inputs aligned per row, sideways scroll, Calculate and result positions, home card link hit-test (tool links and "Show N more" win over the stretched hub link), anchor jumps under the sticky header, sticky plan column, heading/landmark/FAQ schema on home.

**Regressions found and fixed (v0.8.5)**
- Subgrid label alignment (`assets/css/wattlyst.css`, `@supports (grid-template-rows:subgrid)` block): a checkbox field (`.wl-check`) took one row only, so its height stretched the shared label row and pushed every input down (all bill calculators, FPA guide, home planner on desktop). `.wl-check` now spans the same three rows.
- Sticky header offset: the header is 101 px on the live site, but `scroll-padding-top` and the home plan column used 96 px, so "Start planning", "Browse all calculators" and every anchor jump hid the heading top. Both now read the token `--wl-stick` on `:root` (header + gap + admin bar). If the header height changes, change only that token.
- Phone appliance cards (max-width 600px block): the caption fix in v0.8.4 made captions visible (correct) but each card grew a row. The remove button now sits at the right of the picker row (`td:last-child` absolute, picker `padding-right`), and lists without a starting-watts column use three equal columns (`:has([data-k=start])`). Cards are shorter than v0.8.4; longer than v0.8.3 only by the now visible captions.
- Tests: `tests/design.test.js` "design cross-check fixes".

**Not a regression, left as is**
- Home planner on phones starts about 130 px lower than v0.8.3 (hub chip row + "Plan your home power" heading, both owner-requested); the first field is still above the fold on a 360x640 phone.
- Home content JSON (`content/pages/H1.json`) has formula, examples, mistakes, safety and sources that the home template has never rendered (since Phase 4). Owner decision whether the homepage should show Sources.

**SERP ideas (proposed to the owner)**: (1, built as N16 after the owner's yes) "What will this AC add to my bill": marginal slab cost, slab jump, protected-status loss over the six-month rule, inverter vs non-inverter payback, chaining existing engines; (2) season-aware solar sizing from the 12-month unit history on the bill (needs monthly city yield data); (3) cost per backup hour, generator vs UPS vs hybrid; (4) printable circuit sheet for the electrician (needs Engineer Reviewer). Evidence summary: Toolsfluent is the only real Pakistan calculator competitor; generic calculator SERPs are full of parasite pages; "5 marla solar" and "LESCO bill calculator" have no real informational result.

**Do not touch**: everything in the homepage handoff below still holds. Keep `--wl-stick` as the one sticky offset.

## Earlier handoff (after the homepage redesign) — written by the homepage thread, 2026-10-15

Owner (15 Oct 2026, with a screenshot): the homepage still looked plain after design Phase 7: full-width long cards and text blocks, no side blocks, categories not visible, planner fields misaligned, "What do you want to do?" not eye-catching. Fixed in plugin v0.8.4. No formula, number, data or JavaScript changed. Formulas and numbers are never repeated here.

**What is where**
- Home-only stylesheet `assets/css/wattlyst-home.css`, inlined after `wattlyst.css` by `Wattlyst_Head::styles( $home )` only when the page type is `home` (other pages stay light). All task card styles moved there from `wattlyst.css`. `tools/build.js` hashes it into `manifest.assets.content`, so a CSS-only deploy still purges the page cache. Same rules as the main file: no raw `<` (encoded SVG data URIs), no external assets, 44 px targets.
- `Wattlyst_Render::home_hero()`: dark brand band with H1, answer, "Start planning" / "Browse all calculators" buttons, short pills (the tool count is the number of unique tool links in `page['cards']`), and every live hub as an icon chip (`.wl-chip.wl-card-<hub slug>`, `tools_label()` for "N tools"). Phones: one sideways-scrolling chip row, buttons and pills hidden, so the planner still starts near the top.
- Planner: `<section class="wl-planner">` with an H2 and three CSS-numbered steps, then `tool( true )`: the form gets `.wl-tool-split` and two wrappers, `.wl-in` (fields, advanced, button) and `.wl-out` ("Your plan" title, message box, results, share bar). From 1200 px the plan sits in a sticky right column; below that it stacks. The how text stays a sibling of the form (the script finds it through `form.parentElement`).
- Task cards (`cards()`): grid of colour cards, each with an icon tile, "N tools" badge, the first tools, the "Show N more" fold and an "Open <hub>" line; the hub H3 link is stretched over the whole card, tool links and the fold sit above it (`z-index`). Category colour tokens `--wl-c` / `--wl-t` and icons `--wl-i` are on `.wl-card-<slug>` in the home stylesheet (text contrast checked >= 5:1).
- Below: the three content sections as `.wl-home-info` cards in one row; `.wl-home-more` puts the FAQ (`faq( true )`: `<details class="wl-qa">`, first open; same questions as the FAQPage schema) and the author box left, Key facts and Last reviewed right.
- All calculators (main CSS, `@supports (grid-template-rows:subgrid)` block at the end): each field spans three subgrid rows, so labels of different heights no longer push inputs up or down. Phone appliance list: captions use `position:static!important` because GeneratePress makes `.screen-reader-text` `position:absolute!important` (they overlapped the inputs on live).
- Tests: `tests/design.test.js` "home redesign". Checked on local WP: 107 live pages at 390 px with no sideways scroll or JS error, home and two tool pages at 1024 and 1366 px, planner recalculates at all three widths; screenshots of home at 390, 1024, 1280, 1366.

**Do not touch**
- Keep `.wl-in` / `.wl-out` inside the form and the how section next to the form. Keep the chip and card class `wl-card-<hub slug>`: a new hub needs its colour + icon line in `wattlyst-home.css`, otherwise it falls back to the default green bolt.

**Open to-dos**
- None from this phase. Owner hPanel items from the re-audit (below) are still open.

## Earlier handoff (after re-audit fix Phases A, B and C: cache warm-up, design follow-ups, SEO/speed hygiene) — written by the re-audit thread, 2026-10-15

Re-audit report: `/mnt/project-files/electricity-tool-hub/audit/wattlyst-audit-2026-10-15.md` (old WL-01 to 74 re-checked, new WL-75 to 88). Owner approved the fixes on 15 Oct 2026. Phase A covered WL-75, Phase B the design follow-ups WL-77 to 81, Phase C the SEO/speed hygiene WL-82 to 85 and WL-87, each in its own PR. WL-86 (long error-code tables) was left as is on purpose: folding them would hide rows from the lookup filter. WL-76 and WL-88 are owner items. Formulas and numbers are never repeated here.

**What is where (Phase A, WL-75)**
- `Wattlyst_Pages::maybe_sync()` purges the page cache and then calls `queue_warm()`: the list of live URLs (home and hubs first) goes into the option `wattlyst_warm_queue`, and the cron event `Wattlyst_Pages::WARM` (`wattlyst_warm`) runs `warm()`, which fetches up to `WARM_BATCH` pages one after another with `wp_remote_get` and schedules the next batch 10 s later. One page at a time keeps the database to one extra connection while the cache refills.
- Deactivation and `uninstall.php` clear the event and the option. Test: `tests/wordpress.test.js` (WL-75).
- Local check: `wp option delete wattlyst_sync_hash` then any WP-CLI command syncs and queues the warm-up; `do_action('wattlyst_warm')` runs a batch. The PHP built-in server is single-threaded, so run batches from WP-CLI locally, not from a web request.

**What is where (Phase B, WL-77 to WL-81)**
- `Wattlyst_Head::head()` inlines `assets/css/wattlyst.css` on every front-end page, also WordPress's own 404 and search pages (they share the header and the `footer()` markup). The 404 text comes from `Wattlyst_Pages::not_found_title()` / `not_found_text()` (GeneratePress filters `generate_404_title`, `generate_404_text`): Home Power Planner link plus every live nav hub as `.wl-404-links`; `no_search_on_404()` drops the WordPress search form there; 404 has no sidebar.
- Home task cards (`Wattlyst_Render::cards()`): first `HOME_CARD_LINKS` tools shown, the rest inside `<details class="wl-more">` ("Show N more"; a single extra link is never folded). All links stay in the HTML. On phones (max-width 600px) the card description is hidden.
- Appliance list on phones (max-width 600px block at the end of the CSS): each `tr.wl-load-row` is a grid card; the cell labels (`.screen-reader-text` inside the cells) become visible captions; the select's label stays hidden.
- Print: headline label, formula block and table header print black; chart bars keep their colour (`print-color-adjust`). Results: the headline card spans the full row on desktop too. Checkbox hint sits under its label. Reference table cells keep "Rs" and the number together (`Rs&nbsp;` in `ref_table()`); the home page has no one-item breadcrumb.
- Tests: `tests/design.test.js` (WL-77 to WL-81). Checked on local WP: 109 pages at 360 px with no sideways scroll, JS error or failed result; screenshots of 404, home, E1 list and print.

**What is where (Phase C, WL-82 to WL-85, WL-87)**
- Feeds (WL-82): `Wattlyst_Site::not_found()` also removes `redirect_canonical`, so /feed/ and /comments/feed/ answer 404 directly with no redirect first.
- Robots (WL-83): `Wattlyst_Head` robots filter runs at priority 99 and only adds `index, follow` when nothing set `noindex` (replytocom, oEmbed and similar keep a single noindex).
- Sitemap lastmod (WL-84): `tools/build.js` writes `lastmod` (Last reviewed date, else modified) into each manifest page row; `Wattlyst_Endpoints::sitemap_lastmod()` (filter `wp_sitemaps_posts_entry`) puts it in wp-sitemap, keyed by the post meta `Wattlyst_Pages::META_ID`.
- Inline CSS weight (WL-85): `Wattlyst_Head::drop_block_styles()` dequeues the block library, classic theme and global styles on Wattlyst pages (the pages use no blocks).
- Brand images (WL-87): `Wattlyst_Tools::asset()` adds `?v=<file time>` to `assets/brand/` URLs so a long browser cache is safe.
- Tests: `tests/wordpress.test.js` (WL-82 to WL-87). Checked on local WP with curl.

**Owner (hPanel, WL-75 and WL-76)**: check the database connection limit and resource-limit log; turn on the LiteSpeed Cache crawler if available; check CDN bot protection does not challenge visitors or PageSpeed Insights. Still open from earlier audits: WL-36 HTML browser cache time, WL-40 single-hop http/www redirect, WL-88 editorial wording vs the "Reviewed" byline, WL-15 monthly price refresh.

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
| 2026-10-15 | N16 AC bill calculator (owner approved the SERP idea): what one AC adds to the whole bill, slab jump, protected-status loss and the penalty on the next bills; engine/acbill.js, 7 spec cases; E5 hands the "ac bill calculator" keywords to N16; plugin v0.8.6 | done: tests green, Engineer Reviewer pass after fixes (tariff checked date on the page, AC hours ≤ 24 and days ≤ 31 for E5 too, rate wording), Lighthouse mobile 98/100/100/100 on local WP | #21 |
| 2026-10-15 | Home Power Decision Engine on H1 (owner: "han"): on-grid vs hybrid vs UPS/generator, budget, net over years, data dates; D14/N3 live price-notice fix; plugin v0.8.12 | done: tests green, Engineer Reviewer fixes applied, local WP checked | PR #27 |
| 2026-10-15 | Decision Engine fourth setup (owner: "bna do"): on-grid solar + UPS or generator, UPS recharge on the net-billed bill; plugin v0.8.13 | done: tests green, Engineer Reviewer, local WP checked | PR #28 |
| 2026-10-15 | Homepage compact layout (owner: "han"): folds for how/key facts/sections, setups table marks and phone cards, tighter planner; plugin v0.8.14 | done: tests green, local WP checked | PR #29 |
| 2026-10-15 | SERP ideas (owner: "4ron idea cover krny hain"): Bill Index units table 50 to 1,000 with lifeline line, engine numbers in four titles, Inverex Nitrox error codes; idea 3 already live as F2-F12; plugin v0.8.11 | done: tests green, Engineer Reviewer fixes applied (caption kW, lifeline line, F16/F28/F32 safety), local WP checked | PR (this thread) |
| 2026-10-15 | Growth phase (owner: "next phase new thread"): IndexNow now announces changed pages in one batch after each sync (all live pages on the first run), owner growth plan with outreach and forum drafts in a Claude Doc; plugin v0.8.10 | done: tests green, local WP checked (stubbed IndexNow), no formula or page change | #25 |
| 2026-10-15 | Net billing group B (owner: "baqi fixes pe kaam kro"): Home Power Planner saving on the whole bill (fixed charge, FC surcharge, GST; export credit set against the bill after GST), energy-charge saving shown under it; plugin v0.8.9 | done: tests green, Engineer Reviewer, local WP checked | PR (this thread) |
| 2026-10-15 | Net billing review (owner: "ok fix kro"): buyback default now NEPRA's national average energy purchase price with primary sources (was a news figure), wording on D10 D11 H1 N8 N12 N17, old-agreement rule from NEPRA amendment, H1 inverter line names the array; Search Console verification meta tag on the home page; plugin v0.8.8 | done: tests green, Engineer Reviewer, local WP checked | PR (this thread) |
| 2026-10-15 | SERP ideas 2 to 4 (owner: "bna do"): N17 solar size from the twelve-month bill (monthly PV output per city, net-billing month split), N18 home wiring load schedule (circuit sheet, wire + MCB per circuit), N7 upgraded to cost per backup hour (UPS vs petrol generator vs hybrid solar, dated price data); generic result table; resistive PF 1.0; plugin v0.8.7 | done: tests green, Engineer Reviewer fixes applied, checked on local WP | #22 |
| 2026-10-15 | Design cross-check (owner request): subgrid checkbox row, sticky header offset token, shorter phone appliance cards; SERP ideas proposed, none built; plugin v0.8.5 | done: tests green, every live page measured before/after on local WP | PR (this phase) |
| 2026-10-15 | Homepage redesign (owner request): dark hero with every hub as a chip, planner inputs left and sticky plan right, colour task cards with tool counts, info cards, FAQ beside Key facts; field labels aligned on every calculator (subgrid), phone appliance captions fixed; plugin v0.8.4 | done: tests green, 107 pages checked on local WP | PR (this phase) |
| 2026-10-15 | Re-audit fix Phase C, SEO and speed hygiene (WL-82 feeds 404 without redirect, WL-83 one robots value, WL-84 sitemap lastmod from the review date, WL-85 block CSS dropped, WL-87 versioned brand image URLs); plugin v0.8.3 | done: tests green, checked on local WP | PR (this phase) |
| 2026-10-15 | Re-audit fix Phase B, design follow-ups (WL-77 branded 404 + styles on WordPress pages, WL-78 shorter home task cards, WL-79 appliance rows as cards on phones, WL-80 print colours, WL-81 polish); plugin v0.8.2 | done: tests green, 109 pages checked on local WP | PR (this phase) |
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
- ~~Net-billing buyback rate: no NEPRA notification found on 2026-10-13.~~ Closed 15 Oct 2026: NEPRA sources in `data/tariff-pk-2026.json` net_billing.
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
| N7 | /load/ups-vs-solar-vs-generator-cost/ | live | #22 (cost per backup hour) | 2026-10-15 |
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
| N16 | /bill/ac-bill-calculator/ | live | #21 | 2026-10-15 |
| N17 | /solar/solar-size-from-electricity-bill/ | live | #22 | 2026-10-15 |
| N18 | /wiring/home-wiring-load-schedule/ | live | #22 | 2026-10-15 |
| P-X | /data/ | live | #6 | 2026-10-14 |
| bill-index | /data/pakistan-electricity-bill-index/ | live | #6 | 2026-10-14 |
| solar-price-tracker | /data/pakistan-solar-price-tracker/ | live | #6 | 2026-10-14 |
| embed | /embed-calculators/ | live | #6 | 2026-10-14 |
