# Progress

## Handoff for next phase (Phase 6: Monetize and maintain) — written by the Phase 5 thread, 2026-10-14

Read this section, then only "Phase 6" in `specs/build-plan.md` (plus `specs/offpage-plan.md` for the monthly release). Formulas and numbers are never repeated here; they live once in `specs/formulas.md`, `data/` and `engine/`.

**What is where (Phase 5 additions)**
- Live pages: all 24 wave-3 rows of `specs/keyword-map.csv` (`wave=3`), the data pillar `/data/` (P-X) with two data pages, and the embed page (table below). Rows for data, embed, trust and pillar pages are in `specs/site-pages.csv`.
- Data pages: content `content/pages/bill-index.json` and `content/pages/solar-price-tracker.json` (template `data`, key `dataset`). They are built by `tools/lib/datasets.js` (`billIndex`, `solarTracker`), which runs the engine and hands the page `{{ds.*}}` placeholders, tables, a chart and a CSV (`generated/data/*.csv`, served at `/data/<name>.csv` by `includes/class-wattlyst-endpoints.php`). Their inputs: `data/bill-index.json` (months with FPA and QTA period, units levels, DISCO list), `data/solar-prices.json`, `data/component-prices.json`, `data/solar-price-history.json` (append last month here when you refresh). Licence for the data is set in those files (CC BY 4.0, my default, chosen so others can reuse it with a link).
- Embeds: page `content/pages/embed.json` (template `embed`, list built by `embedList` in `tools/lib/datasets.js`), bare calculator document at `/embed/<id>/` (`Wattlyst_Render::embed_html`, endpoint in `class-wattlyst-endpoints.php`; noindex, canonical to the tool page, no ads), script embed `assets/js/wattlyst-embed.js` (iframe + visible credit link, height via postMessage from `wattlyst-tool.js`).
- New engine modules: `engine/fuel.js` (C8), `engine/prices.js` (price functions moved out of solar.js, plus D9), `engine/forecast.js` (N6), `engine/solartools.js` (charge controller, N12, N14 moved out of solar.js). They were split only to keep each page under the JS budget.
- N6 live forecast: the browser (`forecastFor` in `assets/js/wattlyst-tool.js`) fetches Open-Meteo for the city coordinates in `data/cities-pk.json` and passes the hourly values to the engine; on any failure the page keeps the typical day.
- N11 battery wiring diagram: `diagram()` / `battery_grid()` in `includes/class-wattlyst-render.php` and `drawGrid` in the browser script must produce the same markup.
- Appliance list field: optional "Starting watts" column (field flag `start`, on for C1-C4 and C7); share links now carry it.
- New data files: `data/generator-fuel.json`, `data/load-profiles.json`, `data/bill-index.json`, `data/component-prices.json`, `data/solar-price-history.json`; new keys in `data/defaults.json` (forecast, DC/AC ratio, aluminium resistivity, soiling cap) and `data/tariff-pk-2026.json` (`tou.peak_hours`).
- Off-page and brand plan: `specs/offpage-plan.md`.

**Do not touch without the matching spec change**
- Same rules as before: `engine/` + `specs/formulas.md` + `specs/calculator-test-cases.json` move together; data values change only with `source` + `checked`; never edit `generated/` or `dist/` by hand.
- JS budget is nearly full: base browser files + `wiring.js`, `messages.js`, `sizing.js` and `load.js` are within a few hundred bytes of the limit (`tests/site.test.js`). Any new message or browser feature needs room first; the cleanest next step is per-module messages or splitting `wattlyst-tool.js`.
- Data pages read the first two months in `data/bill-index.json`; a new month goes first.

**Open to-dos for Phase 6**
- Monthly refresh (build-plan Phase 6): new month at the top of `data/bill-index.json` (FPA notification, QTA), fuel prices in `data/generator-fuel.json`, `data/solar-prices.json` + `data/component-prices.json` (move the old month into `data/solar-price-history.json`), then build, test, merge, and send the journalist summary per `specs/offpage-plan.md`.
- Open-Meteo's free API is for non-commercial use; with AdSense the site is commercial, so the owner needs their paid API plan (or the N6 page keeps only the typical day). Its attribution link is on the N6 sources.
- Engineer Reviewer notes still open (Phase 5 pass; all must-fixes were fixed): fuel curve and prices are secondary or engineer-to-confirm (diesel curve fitted on one chart size, petrol on inverter sets); bill index October FPA from a news report, KE application unconfirmed; ToU peak hours from the 2023 IESCO schedule; 10 kW hybrid source count counts one publisher twice (pick one counting rule for solar-prices and component-prices); several panel price sources older than 35 days although the file is checked; N6 sky label compares against the yearly average (winter clear days read lower); D11 buyback still news-sourced; dispenser and fridge hours in `data/appliances.json`; N13 freezer hours meaning; aluminium ampacity not in data (W5 says so); new defaults `dc_ac_ratio_max`, `rho_aluminium`, soiling cap need PEC sign-off. Edge cases the reviewer ran are worth adding to the spec cases.
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
| 2026-10-14 | Phase 5: Wave 3, 24 pages live (table below); Pakistan Electricity Bill Index and Solar Price Tracker data pages (chart, CSV, Dataset schema, journalist summary) under the new /data/ hub; embeddable calculators (iframe + script, credit link, /embed-calculators/); live solar forecast (N6), generator fuel (C8), panel price (D9), mosque/shop solar (N13), battery wiring diagram (N11); off-page plan; plugin v0.6.0 | done: tests green, Engineer Reviewer must-fixes all fixed (notes in handoff), Lighthouse mobile 96-100 on new templates, checked in a headless browser on local WP | PR #6 |

## Owner to do
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
