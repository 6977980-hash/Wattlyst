# Progress

## Handoff for next phase (after audit fix Phase 2: deploy safety and homepage speed) — written by the audit Phase 2 thread, 2026-10-14

All six build phases are done; the site is being fixed against the audit in `/mnt/project-files/electricity-tool-hub/audit/wattlyst-audit-2026-10-14.md` (findings WL-01 to WL-74, fix plan in its section F). Audit Phases 1 (wiring safety) and 2 (deploy safety and homepage speed) are done. The next audit thread reads this section, then only its own findings in the audit file; the monthly routine below still applies. Formulas and numbers are never repeated here; they live once in `specs/formulas.md`, `data/` and `engine/`.

**What is where (audit Phase 2: WL-02, 55, 56, 57, 58, 68, 73, 74)**
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
- WL-73 stale branches: seven old branches on GitHub (`phase-1-engine`, six `claude/project-thread-*` from PRs 1 to 8) hold nothing that is not on `main` (each branch's tree matches a `main` commit), but deleting them was blocked by this session's permissions; the owner can delete them on GitHub (Branches page) or allow it.
- JS budget test in `tests/site.test.js` measures the tool script, shared modules and the calculator module, not that module's nested imports (`manifest assets.deps`); the planner (home) and `load.js` pages load more than the test counts. Measuring the whole chain would fail today; worth a decision in the performance phase.
- Layout is still untested in CI: WL-05 overflow is real (the add-row button on E1 at 390 px is not clickable by a real pointer); `tools/browser-check.js` is the place to add a `scrollWidth` check once the UI phase fixes it.
- Audit phases still open (audit section F): Phase 2 technical SEO (WL-03 check plugin llms.txt is served now the Hostinger file is gone, WL-36, 37, 38, 40, 41, 42, 44, 63, 67); Phase 3 functionality and UX (WL-04, 05, 06, 11, 12, 13, 17, 25, 26, 29-33, 51, 52); Phase 4 performance and accessibility (WL-28, 59-61; WL-02, 55-58 done in audit Phase 2); Phase 5 content (WL-14, 15, 20, 23, 45-49). WL-62 admin username and branch protection: owner said not needed.
- Engineer Reviewer minor notes (audit Phase 1, not fixed): `cable_rating` (unused) still returns 30 °C two-conductor values; the air-temperature and circuit limits are typed in `engine/messages.js` as well as in data; the over-63 A error text says "single-phase" also on three-phase; E4 table column prints the exact kW while its text says rounded up to a whole kW. PEC notes from the same review: small inverter welders may suit a C curve (D needs a loop impedance check); zero headroom where cable rating ≈ MCB; DC battery feed breaker has no margin; grouping treats every circuit as fully loaded; factors above 1 below the table temperature.
- PEC engineer (owner arranging): the audit questions at the end of `specs/formulas.md` (default air temperature for cable ratings, PV cable table, three-phase and 1 mm² rows, `pf_by_load_type`, welder curve, D5 night battery basis, generator altitude derating, PV cold Voc check, panel list, net billing at 5 kW), plus every `engineer_confirm` list in `data/`.
- Engineer Reviewer notes carried from Phase 5 (data side): fuel curve and fuel prices secondary; October FPA from a news report, KE application unconfirmed; ToU peak hours from the 2023 IESCO schedule; 10 kW hybrid source count counts one publisher twice (one counting rule for solar-prices and component-prices); several solar price points older than the 35-day limit (the upkeep report lists them); N6 sky label compares against the yearly average; D11 buyback news-sourced; dispenser and fridge hours; N13 freezer hours meaning; aluminium ampacity not in data; `dc_ac_ratio_max`, `rho_aluminium`, soiling cap need PEC sign-off; reviewer edge cases worth adding to spec cases.
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
| 2026-10-14 | Audit fix Phase 2, deploy safety and homepage speed (WL-02 homepage Lighthouse, WL-55 modules fetched once, WL-56 versioned imports, WL-57 emoji script removed, WL-58 catalog shipped once, WL-68 CI actions pinned, WL-74 browser smoke test + deploy tests; WL-73 branch deletion left to the owner); plugin v0.7.1 | done: tests green, CI green, homepage Lighthouse 98 on local WP, every live page checked in headless Chrome; no formula or number changed | PR #9 |
| 2026-10-14 | Audit fix Phase 1, wiring safety (WL-01 DC voltage, WL-07 temperature and grouping derating, WL-08 three-phase ratings, WL-09 one Pakistani cable size rule, WL-10 AC power factor so W1 and E4 agree, WL-19 welder D curve, WL-24 PEC questions); W1 W2 W3 W5 E4 text updated | done: tests green, Engineer Reviewer pass, wiring pages checked on local WP | PR #8 |
| 2026-10-14 | Phase 6: monetize and maintain: three manual AdSense units per tool page (off until approval), solar quote request form with private Solar leads inbox, email and retention cleanup (off until the owner switches it on), affiliate "Where to buy" box with rel=sponsored and disclosure (empty until a programme is joined), privacy and editorial policy sections, upkeep report tools/maintenance.js, monthly scheduled task, plugin v0.7.0 | done: tests green, Engineer Reviewer pass (no formula or calculator change), Lighthouse mobile 98-100 with the form on, form and ads checked on local WP | PR phase-6 |
| 2026-10-14 | Phase 5: Wave 3, 24 pages live (table below); Pakistan Electricity Bill Index and Solar Price Tracker data pages (chart, CSV, Dataset schema, journalist summary) under the new /data/ hub; embeddable calculators (iframe + script, credit link, /embed-calculators/); live solar forecast (N6), generator fuel (C8), panel price (D9), mosque/shop solar (N13), battery wiring diagram (N11); off-page plan; plugin v0.6.0 | done: tests green, Engineer Reviewer must-fixes all fixed (notes in handoff), Lighthouse mobile 96-100 on new templates, checked in a headless browser on local WP | PR #6 |

## Owner to do
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
