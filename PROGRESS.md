# Progress

## Handoff for next phase (Phase 5: Wave 3 + authority) — written by the Phase 4 thread, 2026-10-14

Read this section, then only "Phase 5" in `specs/build-plan.md`. Formulas and numbers are never repeated here; they live once in `specs/formulas.md`, `data/` and `engine/`.

**What is where (Phase 4 additions)**
- Live pages: 63 tool/appliance/guide/lookup pages + the homepage planner + 9 pillar hubs + 7 trust pages (table below). Wave 3 pages are the keyword-map rows with `wave=3`; the content brief used for wave 2 is the model: one `content/pages/<ID>.json` per page, reference pages B1, E1, E4, C6, D5, F2, H9, D8, plus C7 (yesno flags), N3/D14 (price data) and N2 (lookup).
- Home Power Planner: `engine/planner.js` (`home_plan`, composes the existing calculators; owns no formula of its own beyond the monthly solar split, documented in `specs/formulas.md` "Phase 4 tools"), page `content/pages/H1.json` (template `home`: tool + how first, then task cards).
- New engine functions: `sizing.js` `generator_capacity` (C7); `solar.js` `solar_for_pump` (D15), `quote_checker` (N3, now reads price ranges from data), `solar_price_estimate` (D14), helper `priceRange`; `bill.js` `bill_total` FPA exemption for protected consumers; `conversions.js` `units` optional cost. All have cases in `specs/calculator-test-cases.json`.
- New data: `data/solar-prices.json` (dated price points by system type, excluded outliers kept with a reason), `data/inverter-codes.json` (brands, codes, manual sources), `data/tariff-pk-2026.json` `addons_secondary.fpa_per_unit.latest` (latest notified FPA, used as the F14 default only), `data/defaults.json` `planner_day_share`. `tools/build.js` hands data files to calculators through `MODULE_DATA` / `CALC_DATA`; `manifest.data` carries what the browser needs.
- Roman Urdu: `content/labels-ur.json` glossary (English output label -> Roman Urdu); a page may set `label_ur` per output and `how_ur`. Every new output label needs a glossary line.
- Share bar (every tool): Save as PDF (print CSS in `assets/css/wattlyst.css`), WhatsApp, Copy link, Roman Urdu toggle; HTML in `includes/class-wattlyst-render.php`, behaviour in `assets/js/wattlyst-tool.js`.
- Lookup template (N2): `template: "lookup"` + `codes_table`; render in `Wattlyst_Render::lookup()`, filter script in the same browser JS.
- Shipped JS: `tools/build.js` writes stripped copies to `dist/` (`tools/lib/strip.js`); WordPress loads only `dist/`. `tests/engine.test.js` runs every spec case against the stripped engine too; the JS budget test measures `dist/`.
- Output specs added: `rs2` (rupees with paise) and `yesno` (boolean outputs must use it).

**Do not touch without the matching spec change**
- Same as before: `engine/` + `specs/formulas.md` + `specs/calculator-test-cases.json` move together; `data/*.json` values change only with `source` + `checked`; never edit `generated/` or `dist/` by hand.
- `data/solar-prices.json` and the FPA entry are dated: the D14/N3/F14 pages print the checked date, and the content checklist wants it within 35 days.

**Open to-dos for Phase 5**
- Wave 3 (keyword-map `wave=3`) incl. N6 (needs a forecast API), N8-N14; embed widget, Bill Index and Solar Price Tracker data pages (they can read `data/tariff-pk-2026.json` and `data/solar-prices.json`).
- Engine gaps found while writing wave 2: W4 uses voltage drop only (no PV string fuse / Voc / temperature check); `charge_controller`, `solar_size`, `tco`, `bill_audit` do not echo their inputs; N5 gas price default is typed in the page and should move to `data/`; N7 money defaults are illustrative; tariff has no winter-quarter QTA.
- Data to verify: GEPCO/FESCO/SEPCO/QESCO/TESCO online-bill links, HESCO/SEPCO district lists; Inverex and Knox error codes (manuals not found); net-billing buyback still unverified.
- Pillar hubs still use the generic keyword-map text (P-A and H2 have their own).
- Owner-only: Search Console / Bing indexing for the 39 new URLs; PEC engineer sign-off (`data/site.json` reviewer stays empty); AdSense application (now 79 live pages); monthly refresh of solar prices, FPA and buyback.

## Phase log

| Date | Item | Status | Link |
|---|---|---|---|
| 2026-10-13 | Phase 0: repo + Hostinger Git auto-deploy skeleton (plugin v0.1.0) | done | |
| 2026-10-13 | Phase 1: engine (46 calculators, families A B C D E F W + G tools N1 N3 N4 N5 N7 N8 N9 N10 N11 N12 N14), 127 spec cases, guardrail fuzz, keyword-map SEO lint, CI | tests green, awaiting human PEC engineer review of formulas.md | PR phase-1-engine |
| 2026-10-13 | specs/seo-rules.md (SEO, AEO, GEO/LLM, technical, title/meta, Google + AdSense policies); 25 keyword-map titles/metas fixed to rules | done | PR phase-1-engine |
| 2026-10-13 | Phase 2: page build step (tools/build.js -> generated/), tool/pillar/appliance/guide/trust templates, server-rendered default result, ?load= state with clean canonical, JSON-LD (WebApplication, BreadcrumbList, Article+Person, Organization+WebSite, FAQPage), robots.txt (AI crawlers), core sitemap, /llms.txt, IndexNow, ads.txt (when pub id set), ad slots (off), 7 trust pages, data/appliances.json (87), brand images, header menu by task, plugin v0.3.0 | done: tests green, Lighthouse mobile 100/100/100/100 (tool template + trust pages, local WP + GeneratePress), Engineer Reviewer PASS after fixes | PR phase-2 |
| 2026-10-13 | Phase 3: Wave 1, 24 pages live (table below) + 7 pillar hubs; new engine tools (generator for AC/pump, home load, add-an-AC check, AC units, solar for AC / from loads / for 12 V battery, UPS backup, wire/breaker/cable sizing with data/cable-ampacity.json), 245 spec cases, browser field types (appliance, loads, checkbox), plugin v0.4.0 | done: 436 tests green, zero orphan pages (link test), Engineer Reviewer PASS after fixes, Lighthouse mobile >= 95 on every live page (most 99-100), calculators checked in a headless browser on local WP | PR phase-3 |
| 2026-10-14 | Phase 4: Wave 2, 39 pages live (table below) incl. N1 N2 N3 N4 N5 N7, D14 solar price, Home Power Planner on the homepage (load -> inverter -> battery -> solar -> net billing -> generator), Save as PDF / WhatsApp / copy link, Roman Urdu result toggle, stripped dist/ JS, data/solar-prices.json + data/inverter-codes.json, plugin v0.5.0 | done: tests green, Engineer Reviewer pass, Lighthouse mobile 98-100 on sampled templates, every calculator checked in a headless browser on local WP | PR phase-4 |

## Owner to do
- Phase 4: request indexing for the 39 wave-2 URLs; apply for AdSense; refresh `data/solar-prices.json` and the FPA entry monthly (source + checked date).
- Phase 3: request indexing in Google Search Console and Bing for the 24 wave-1 URLs (sitemap already lists them). Fill `data/site.json` reviewer once a PEC engineer signs off on `specs/formulas.md` (open questions are listed at its end) and the `engineer_confirm` lists in `data/cable-ampacity.json` and `data/appliances.json`.
- Net-billing buyback rate (`data/tariff-pk-2026.json` net_billing): no NEPRA notification found on 2026-10-13, only news reports; the D10 page says so. Replace with the NEPRA page and set `buyback_verified` when it exists (re-check monthly).
- WordPress: Settings > Reading keep "Discourage search engines" OFF on live; Customizer > Site Identity: optional (plugin already shows logo + favicon).
- LiteSpeed Cache + Cloudflare (speed stack in build-plan Phase 2); Google Search Console + Bing Webmaster Tools: submit https://wattlyst.com/wp-sitemap.xml (or the Rank Math sitemap).
- Brand profiles (YouTube, Facebook, X, LinkedIn page) -> data/site.json organization_same_as.
- After AdSense approval: ads.adsense_pub_id + a Google-certified CMP name in data/site.json.

## Not in engine yet (need data first)
- N6 solar forecast: live forecast API (Phase 5)
- N13 mosque/shop: load profile templates
- Generator fuel table (data/generator-fuel.json)

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
