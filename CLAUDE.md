# Wattlyst Tools (wattlyst.com)

This repo root IS the WordPress plugin `wattlyst-tools`. Hostinger Git deploys `main` into
`public_html/wp-content/plugins/wattlyst-tools` and auto-deploys on every push (GitHub webhook).
Anything pushed to `main` goes live, so keep `main` working. Work on branches, merge when green.

Reading rule (owner's instruction): read the full build plan and all phases once, at the start of the project. After that, each session reads only `PROGRESS.md` (start with its "Handoff for next phase" section) and the section of the CURRENT phase in `specs/build-plan.md` (plus the specs that phase names). Do not re-read the whole plan or all specs every session; it wastes time.
Handoff rule (owner, 13 Oct 2026): every phase thread ends by rewriting the "Handoff for next phase" section of `PROGRESS.md`: which files and functions matter, where things live, what not to touch, open to-dos. The note says only WHAT IS WHERE, never a formula or a number (those live once, in `specs/formulas.md`, `data/` and `engine/`), so two places can never disagree. Keep the code map below current when files move.
Run `node tools/build.js` then `npm test` (Node 20+, no install needed) before every push; CI runs the tests, `build.js --check` and a Lighthouse job on every PR.
No staging site (owner decision): before merging to `main`, check changes on a local WordPress copy (`tools/wp-test-site.sh`); CI must be green.

## Non-negotiable rules
1. Math lives only in `engine/` as pure functions (no DOM, no WordPress). UI code calls the engine; it never re-implements a formula.
2. Every engine function has unit tests generated from `specs/calculator-test-cases.json`. Change a formula = change `specs/formulas.md` + tests in the same PR. Never delete or loosen a test to get green.
3. Constants that can change (tariff, buyback, prices, sun hours, appliance watts, cable ampacity) live in `data/*.json` with `source` and `checked` date. No magic numbers in JS.
4. A page is done only when: tests green, Engineer Reviewer PASS (`specs/engineer-reviewer.md`), content checklist PASS (build-plan.md), Lighthouse mobile >= 95 in all four.
5. Every page's primary keyword, URL, title and meta come from `specs/keyword-map.csv`. Don't invent URLs; one intent = one URL.
6. Update PROGRESS.md (page id, status, PR link, date) at the end of each session.
7. Results never show NaN, Infinity, negative or blank; invalid input shows a clear message (`engine/messages.js`).
8. Every page follows `specs/seo-rules.md`: SEO, AEO, GEO/LLM, technical SEO, title/meta rules, Google spam policies, AdSense policies. Numbers in page text, worked examples, tables, FAQ, meta and schema are produced by the engine, never typed by hand, so the site cannot contradict itself.
9. `specs/` and `data/` here are canonical. After changing them, copy the same files to the project folder (`/mnt/project-files/electricity-tool-hub/`) so both stay identical.
10. Design (owner): clean, professional, task-first. Every page follows "Design rules" in `specs/build-plan.md`: calculator above the fold, nav by task, Next step after every result, no clutter.

## Code map (what lives where; keep current)
- `wattlyst-tools.php` plugin bootstrap, version constant. `includes/class-wattlyst-tools.php` loads `generated/manifest.json` and page JSON (`row()`, `page()`, `site()`).
- `includes/class-wattlyst-pages.php` creates/updates WordPress pages for every live manifest row (`maybe_sync`, `ensure`, `ensure_home` for the front page), header menu fallback, footer, shortcode `[wattlyst_page id=]`, loads the tool script.
- `includes/class-wattlyst-render.php` HTML for one page: tool/appliance/guide/pillar/trust/home templates, fields (`field`, `loads_field` for the appliance list), results, tables (`table`, `tables`), task `cards`, author box, sources.
- `includes/class-wattlyst-head.php` title, meta, canonical, Open Graph, JSON-LD, inline CSS, module preload, icons, logo. `includes/class-wattlyst-endpoints.php` robots.txt, /llms.txt, /ads.txt, IndexNow, sitemap tweaks. `includes/class-wattlyst-ads.php` ad slot partials.
- `engine/` pure calculators: `core.js` (input readers `num/pos/frac/pick`, `appliance()` lookup, `calculator()` wrapper, `dflt()`), `conversions.js` (A), `battery.js` (B + ups_backup), `sizing.js` (C: loads sum, inverter/generator, generator_for_ac/pump, sanctioned load), `solar.js` (D: solar_size, solar_for_ac, solar_from_loads, panel_for_12v, controllers, N3 N12 N14), `bill.js` (F: bill_energy/total/tou, net_billing, protected_check, bill_audit), `load.js` (E: ac_units, home_load/loadRows, add_ac_check, N5 N7 N9 N10), `wiring.js` (W: voltage_drop, design_current, wire_size, breaker_size, cable_rating), `format.js` (number formats + `{{placeholder}}` renderer shared by build and browser), `messages.js` (error code -> text), `index.js` registry.
- `assets/js/wattlyst-tool.js` the only browser script: reads the form, calls the engine, prints results, appliance list rows, `?load=` share state. `assets/css/wattlyst.css` inlined styles. `assets/brand/` images.
- `tools/build.js` builds `generated/` (per-page JSON, manifest, llms.txt): field option expansion (`fieldOptions`), `@` defaults (`resolveDefault`), appliance tables (`applianceTables`), schema (`schemaFor`), trust page blocks (`renderTrust`). `tools/wp-test-site.sh` local WordPress; `tools/lighthouse-check.js` CI gate.
- `content/pages/<ID>.json` page content (see any wave-1 page as the reference; `E1.json` for the appliance list field). `content/trust/*.html` trust pages.
- `data/` defaults.json (engineering defaults + standard sizes), tariff-pk-2026.json, cities-pk.json, appliances.json, cable-ampacity.json (IEC ampacity, PK n/d sizes, MCB curves), site.json (identity, reviewer, ads).
- `specs/` build-plan.md, formulas.md (single source for every formula), calculator-test-cases.json, engineer-reviewer.md, seo-rules.md, keyword-map.csv (every page's URL/title/meta/keywords), site-pages.csv (trust + pillar rows, nav order).
- `tests/` engine.test.js (spec cases), guardrails.test.js (fuzz), messages.test.js, keyword-map.test.js, site.test.js (build freshness, typed digits, schema, trust pages, images, JS size), content.test.js (content checklist, link graph, home cards).

## Layout
- `wattlyst-tools.php` plugin bootstrap; `includes/` PHP classes. PHP never computes: it prints `generated/`.
- `tools/build.js` builds `generated/` (manifest, one JSON per page with rendered text + JSON-LD, llms.txt) from `specs/keyword-map.csv`, `specs/site-pages.csv` (trust + pillar pages), `content/` and `data/`, running the engine for every number. Never edit `generated/` by hand.
- `content/pages/<ID>.json` page content (status draft|publish; only publish goes live). Text uses `{{in.x}}`, `{{out.x|spec}}`, `{{d.default}}` placeholders; a typed digit fails `npm test` unless listed in `literal_numbers`. `content/trust/*.html` trust pages.
- Live pages are created in WordPress automatically by the plugin (never overwrites an owner's page); pillars go live with their first live child.
- `assets/brand/` logo, favicon, Apple touch, OG and Twitter images (SVG sources + PNG).
- `engine/` pure ES-module calculators: `calc(inputs, data) -> {ok, ...}`; registry in `engine/index.js`; `assets/js/` one small UI file per tool
- `tests/` node:test suites (spec cases, guardrail fuzz, messages, keyword-map SEO lint)
- `data/` editable constants (JSON); `specs/` plan, formulas, test cases, keyword map
- `.htaccess` blocks web access to `.git`, `specs/`, `tests/`, markdown/csv. Keep it.
- Theme is GeneratePress (installed from wordpress.org, not in this repo).
