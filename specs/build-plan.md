# Wattlyst build plan for Claude Code

Read this file, CLAUDE.md and PROGRESS.md at the start of EVERY session. Work one phase at a time,
one page per PR. Never start the next phase until the current gate is green.

## Non-negotiable rules (copy into the repo's CLAUDE.md)
1. Math lives only in `engine/` as pure functions (no DOM, no WordPress). UI code calls the engine; it never re-implements a formula.
2. Every engine function has unit tests generated from `specs/calculator-test-cases.json`. Change a formula = change formulas.md + tests in the same PR. Never delete or loosen a test to get green.
3. Constants that can change (tariff, buyback, prices, sun hours, appliance watts, cable ampacity) live in `data/*.json` with `source`, `checked` date. No magic numbers in JS.
4. A page is done only when: tests green, Engineer Reviewer PASS (specs/engineer-reviewer.md), content checklist PASS (below), Lighthouse mobile >= 95 Performance/SEO/Accessibility/Best Practices.
5. Every page's primary keyword, URL, title and meta come from `keyword-map.csv`. Don't invent URLs; one intent = one URL.
6. Update PROGRESS.md (page id, status, PR link, date) at the end of each session.
7. Results never show NaN, Infinity, negative or blank; invalid input shows a clear message.

## Repo layout
```
wattlyst/
  CLAUDE.md  PROGRESS.md
  specs/      formulas.md, calculator-test-cases.json, engineer-reviewer.md, build-plan.md, keyword-map.csv
  data/       tariff-pk-2026.json, cities-pk.json, appliances.json, cable-ampacity.json
  engine/     conversions.js battery.js sizing.js solar.js bill.js wiring.js  (ES modules, pure)
  tests/      engine.test.js (vitest, loops over calculator-test-cases.json)
  plugin/wattlyst-tools/   PHP: registers one Gutenberg block/shortcode per tool, enqueues only that tool's JS, renders default result server-side, outputs schema
  plugin/wattlyst-tools/ui/  one small vanilla JS file per tool (imports engine)
  theme-child/  GeneratePress child: templates, CSS tokens, ad slot partials
  .github/workflows/ci.yml  npm test + eslint + Lighthouse CI on built pages
```

## Phase 0: Validate and set up (no code)
- No Ahrefs: check Wave 1 keywords manually on google.com.pk (incognito); optional volume ranges from Google Keyword Planner; free DR/DA checks (Ahrefs Website Authority Checker, Moz). serp-analysis.csv holds the tiering.
- Buy domain, managed WordPress hosting with LiteSpeed or Nginx cache + Cloudflare, SSL.
- Install: GeneratePress (child theme), Rank Math, a certified CMP, Site Kit (GSC + GA4). No page builder.
Gate: domain live on HTTPS, GSC verified, keyword-map.csv final.

## Phase 1: Engine and guardrails
- Create repo + CLAUDE.md (rules above) + PROGRESS.md (one row per keyword-map page).
- Implement engine/ for families A, B, C, D, E, F, W exactly per formulas.md.
- tests/engine.test.js reads every case in calculator-test-cases.json and checks within tolerance; add edge cases.
- CI runs tests on every PR.
Gate: all test cases pass; Engineer Reviewer PASS on the whole engine; human PEC engineer reviews formulas.md once.

## Phase 2: Templates, trust and data
- Block/shortcode framework, server-side default result, URL-param state (?load=..), canonical clean URL.
- Tool page template (order in the strategy doc), pillar template, appliance template, guide template.
- Schema: WebApplication, BreadcrumbList, Article + Person (reviewer), Organization.
- Trust pages: About, Methodology, Editorial policy, Contact, Privacy, Terms, Disclaimer.
- data/appliances.json: 60+ appliances (running W, starting W, PK brand examples, source).
- Ad slot partials with reserved height (not used until AdSense approval).
Gate: template page scores >= 95 on Lighthouse mobile in all 4; no CLS from slots; trust pages live.

## Phase 3: Wave 1 (24 pages, keyword-map wave=1, SERP tier A/B)
For each page: build tool -> content (template order) -> worked examples recomputed by engine -> internal links (pillar, chain "Next step", 3+ related) -> Engineer Reviewer -> checklist -> publish -> request indexing.
Gate: 24 pages live, indexed in GSC, zero orphan pages (link-check script), all reviewers PASS.

## Phase 4: Wave 2 (33 pages) + planner
- Wave 2 pages (33). Home Power Planner (chain across load -> inverter -> battery -> solar -> net billing -> generator) with PDF export and WhatsApp share. Roman Urdu result toggle.
- Apply to AdSense once ~30 quality pages + 4-6 weeks live.
Gate: GSC impressions growing week on week; PDF/share works on mobile.

## Phase 5: Wave 3 (16 pages) + authority
- Wave 3 pages (16, SERP tier C/D: head converter terms, solar price, net billing news, generator size).
- Embeddable calculator widget with credit link; Pakistan data studies (see strategy doc); outreach to PK solar communities and installers.
Gate: first referring domains from real sites; 10+ pages in top 20.

## Phase 6: Monetize and maintain
- Manual ad placements (3 per tool page), lead form for solar quotes, affiliate with rel="sponsored".
- Monthly routine: refresh tariff/FPA/QTA/buyback/prices in data/ with source + date, re-run tests, bump "last reviewed".
- Quarterly: update pages ranking 8-20, prune or merge thin pages.

## Content checklist (per page)
- [ ] H1 = primary keyword; title/meta from keyword-map.csv
- [ ] One-line direct answer above the fold; tool usable on 360px screen
- [ ] "How this result was calculated" uses the user's numbers
- [ ] Formula section matches formulas.md; 3-5 worked examples recomputed by engine
- [ ] Reference table generated by engine (not typed by hand)
- [ ] Common mistakes + safety note where relevant
- [ ] 4-8 internal links incl. pillar + chain Next step; 3+ pages link to it
- [ ] FAQ 5-8 real questions; author + reviewer box; last reviewed date; sources
- [ ] Data pages: source link + checked date <= 35 days
