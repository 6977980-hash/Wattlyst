# Wattlyst Tools (wattlyst.com)

This repo root IS the WordPress plugin `wattlyst-tools`. Hostinger Git deploys `main` into
`public_html/wp-content/plugins/wattlyst-tools` and auto-deploys on every push (GitHub webhook).
Anything pushed to `main` goes live, so keep `main` working. Work on branches, merge when green.

Reading rule (owner's instruction): read the full build plan and all phases once, at the start of the project. After that, each session reads only `PROGRESS.md` and the section of the CURRENT phase in `specs/build-plan.md` (plus the specs that phase names). Do not re-read the whole plan or all specs every session; it wastes time.
Run `npm test` (Node 20+, no install needed) before every push; CI runs it on every PR.

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

## Layout
- `wattlyst-tools.php` plugin bootstrap; `includes/` PHP classes (shortcodes/blocks, schema)
- `engine/` pure ES-module calculators: `calc(inputs, data) -> {ok, ...}`; registry in `engine/index.js`; `assets/js/` one small UI file per tool
- `tests/` node:test suites (spec cases, guardrail fuzz, messages, keyword-map SEO lint)
- `data/` editable constants (JSON); `specs/` plan, formulas, test cases, keyword map
- `.htaccess` blocks web access to `.git`, `specs/`, `tests/`, markdown/csv. Keep it.
- Theme is GeneratePress (installed from wordpress.org, not in this repo).
