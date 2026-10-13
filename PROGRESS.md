# Progress

## Handoff for next phase (Phase 4: Wave 2 + planner) — written by the Phase 3 thread, 2026-10-13

Read this section, then only "Phase 4" in `specs/build-plan.md`. Formulas and numbers are never repeated here; they live once in `specs/formulas.md`, `data/` and `engine/`.

**What is where (Phase 3 additions)**
- Live pages: 24 wave-1 pages (`content/pages/<ID>.json`, status `publish`) plus the 7 trust pages and the 7 pillar hubs P-B P-C P-D P-E P-F P-W P-G (pillars go live automatically with their first live child; a pillar's text is `content/pages/<P-ID>.json` if one exists (H2 `/appliances/` is the example), else its keyword-map row). Wave 2 pages are the keyword-map rows with `wave=2`; create each as a new `content/pages/<ID>.json` with status `publish` only when all four gates pass.
- Page content format: see `content/pages/B1.json` (simple fields), `content/pages/E1.json` (appliance `loads` field, `@data...` defaults), `content/pages/E4.json` (`appliance` select), `content/pages/C6.json` (`fixed_inputs`), `content/pages/D5.json` (`options_from` cities). Placeholders: `{{in.x|spec}}`, `{{out.x|spec}}`, `{{d.key}}`, `{{a.<appliance-id>.running_w}}`, `{{ex.N.out.x}}` (number from example N). `literal_numbers` lists the only typed digits allowed (product names, years).
- Engine functions added or changed in Phase 3 (all in `engine/`, registry `engine/index.js`): `sizing.js` (`generatorFor`, `generator_for_ac`, `generator_for_pump`, `loadRows`, `inverter_size` now accepts appliance rows and returns the items), `load.js` (`ac_units`, `home_load`, `add_ac_check`), `solar.js` (`panel_for_12v`, `solar_for_ac`, `solar_from_loads`), `battery.js` (`ups_backup`), `bill.js` (`net_billing` net-metering comparison outputs), `wiring.js` (`wire_size`, `breaker_size`, `cable_rating`, `pkSizeFor`), `core.js` (`appliance()` lookup). Every one has cases in `specs/calculator-test-cases.json` and a section in `specs/formulas.md` ("Phase 3 tools").
- New data file: `data/cable-ampacity.json` (IEC methods B1/C, Pakistani n/d sizes, MCB curves, minimum areas, breaker-margin load types). `data/appliances.json` now carries `avg_w` for inverter ACs; `data/defaults.json` has `standard_generator_kva` and `battery_v_default`. Both files' `_meta.engineer_confirm` lists what a PEC engineer still has to confirm.
- Browser: `assets/js/wattlyst-tool.js` handles every field type (number, select, appliance, loads with add/remove rows, checkbox), `?load=` state restore, and reads `manifest.data` (defaults, tariff, cities, cables) so the browser engine equals the build engine. `loads` selects are populated lazily on focus (Lighthouse DOM size).
- Local check: `tools/wp-test-site.sh` (SQLite WordPress + GeneratePress on 127.0.0.1:8080). Lighthouse: `node_modules/.bin/lighthouse` with `CHROME_PATH` pointing at the Playwright Chromium.
- Messages: every engine error has an exact string in `engine/messages.js` and a test in `tests/messages.test.js`.

**Do not touch without the matching spec change**
- `engine/`, `specs/formulas.md`, `specs/calculator-test-cases.json` move together (rule 2). `data/*.json` values change only with `source` + `checked` date.
- `specs/keyword-map.csv` URLs, titles, metas are canonical; `specs/site-pages.csv` lists trust and pillar pages.
- `generated/` is build output; never edit by hand (`node tools/build.js`, and `npm test` checks it is fresh).
- The link plan: every page needs 3+ related links and a `next`; `tests/content.test.js` fails on orphan pages and missing chain links. Wave 2 pages must link into the wave-1 chain and be linked from at least two existing pages (add them to `related` of existing pages in the same PR).

**Open to-dos for Phase 4**
- Wave 2 (39 pages, keyword-map `wave=2`) incl. new tools N1 N3 N4 N5 N7; the Home Power Planner (homepage already shows task cards from `content/pages/H1.json`; the chain + PDF export + WhatsApp share is new work); Roman Urdu result toggle.
- Cosmetic: output spec `2` prints "Rs 33.1" where "Rs 33.10" reads better (`engine/format.js`); fix with a test.
- Pillar hubs still use the generic keyword-map text; a short hand-written intro per hub (a `content/pages/<P-ID>.json`) would help.
- Owner-only: Google Search Console indexing requests for the 24 URLs, PEC engineer sign-off (`data/site.json` reviewer stays empty until then), AdSense application after ~30 pages.

## Phase log

| Date | Item | Status | Link |
|---|---|---|---|
| 2026-10-13 | Phase 0: repo + Hostinger Git auto-deploy skeleton (plugin v0.1.0) | done | |
| 2026-10-13 | Phase 1: engine (46 calculators, families A B C D E F W + G tools N1 N3 N4 N5 N7 N8 N9 N10 N11 N12 N14), 127 spec cases, guardrail fuzz, keyword-map SEO lint, CI | tests green, awaiting human PEC engineer review of formulas.md | PR phase-1-engine |
| 2026-10-13 | specs/seo-rules.md (SEO, AEO, GEO/LLM, technical, title/meta, Google + AdSense policies); 25 keyword-map titles/metas fixed to rules | done | PR phase-1-engine |
| 2026-10-13 | Phase 2: page build step (tools/build.js -> generated/), tool/pillar/appliance/guide/trust templates, server-rendered default result, ?load= state with clean canonical, JSON-LD (WebApplication, BreadcrumbList, Article+Person, Organization+WebSite, FAQPage), robots.txt (AI crawlers), core sitemap, /llms.txt, IndexNow, ads.txt (when pub id set), ad slots (off), 7 trust pages, data/appliances.json (87), brand images, header menu by task, plugin v0.3.0 | done: tests green, Lighthouse mobile 100/100/100/100 (tool template + trust pages, local WP + GeneratePress), Engineer Reviewer PASS after fixes | PR phase-2 |
| 2026-10-13 | Phase 3: Wave 1, 24 pages live (table below) + 7 pillar hubs; new engine tools (generator for AC/pump, home load, add-an-AC check, AC units, solar for AC / from loads / for 12 V battery, UPS backup, wire/breaker/cable sizing with data/cable-ampacity.json), 198+ spec cases, browser field types (appliance, loads, checkbox), plugin v0.4.0 | done: 390 tests green, zero orphan pages (link test), Engineer Reviewer PASS after fixes, Lighthouse mobile >= 95 on every live page (most 99-100), calculators checked in a headless browser on local WP | PR phase-3 |

## Owner to do
- Phase 3: request indexing in Google Search Console and Bing for the 24 wave-1 URLs (sitemap already lists them). Fill `data/site.json` reviewer once a PEC engineer signs off on `specs/formulas.md` and the `engineer_confirm` lists in `data/cable-ampacity.json` and `data/appliances.json`.
- WordPress: Settings > Reading keep "Discourage search engines" OFF on live; Customizer > Site Identity: optional (plugin already shows logo + favicon).
- LiteSpeed Cache + Cloudflare (speed stack in build-plan Phase 2); Google Search Console + Bing Webmaster Tools: submit https://wattlyst.com/wp-sitemap.xml (or the Rank Math sitemap).
- Brand profiles (YouTube, Facebook, X, LinkedIn page) -> data/site.json organization_same_as.
- After AdSense approval: ads.adsense_pub_id + a Google-certified CMP name in data/site.json.

## Not in engine yet (need data first)
- N2 inverter error codes: data/inverter-codes.json from manufacturer manuals
- N6 solar forecast: live forecast API (Phase 5)
- N13 mosque/shop: load profile templates
- Generator fuel table (data/generator-fuel.json), solar price ranges (data/solar-prices.json, dated)

## Pages (from specs/keyword-map.csv)

| ID | URL | Status | PR | Date |
|---|---|---|---|---|
| H1 | / (home) | live | phase-3 | 2026-10-13 |
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
