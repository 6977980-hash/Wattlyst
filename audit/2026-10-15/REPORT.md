# Wattlyst full audit: maths, decision engine, functionality, SEO, speed (read-only)

Date: 15 October 2026, 18:40 to 20:30 UTC. Scope: repository `6977980-hash/wattlyst` at `main` = `1b6520f` (plugin v0.8.15, PR #30), the live site https://wattlyst.com, a local WordPress copy built with `tools/wp-test-site.sh`, and public search results.

**Nothing in production was changed.** No file on `main` was edited, nothing was merged or deployed, no WordPress setting was touched, no form was submitted. Only GET/HEAD requests went to the live site, strictly one at a time with 1.5 to 3 s gaps (about 200 requests in total, no 5xx seen). The audit's own regression tests are on branch `claude/project-thread-1qfruz` in `audit/2026-10-15/` (not merged; see section K).

Earlier reports: `wattlyst-audit-2026-10-14.md` (WL-01..74), `wattlyst-audit-2026-10-15.md` (WL-75..88), `net-billing-review-2026-10-15.md`, `homepage-compact-2026-10-15.md`. New findings here are **WL-89 to WL-155**. Owner-decided items are not re-raised: WL-73 (branches) rejected, WL-46 (GA4) ignored, WL-86 skipped on purpose, WL-36 / WL-40 / WL-75 / WL-76 hPanel items, WL-14 tariff questions, WL-24 PEC items, WL-88 byline wording.

**Status labels**
- **Confirmed:** reproduced by a script or browser run in this audit, or proven from live responses.
- **Likely:** strong evidence (numbers or engineering judgement), not fully reproduced, or needs an engineer to confirm.
- **Recommendation:** an improvement, not a defect.

**What was run**

| Check | Tool | Result |
|---|---|---|
| Repo tests | `npm test` (Node 22) | 728 of 728 pass |
| Build freshness | `node tools/build.js --check` | generated/ up to date |
| Upkeep report | `node tools/maintenance.js` | 25 of 38 solar price points and 1 of 1 backup price point older than 35 days (WL-15, still partly open) |
| Independent maths, converters/battery/generator/wiring | own reference code, 61,971 random cases, 107,714 fuzz runs, 101,316 monotonicity checks, 408 page-text checks | 0 formula errors; 16 defects in omissions and page text |
| Independent maths, solar/prices | own reference code, 3,699 fuzz inputs, 61-row scenario report | 0 formula errors; 9 defects in sizing policy, data and text |
| Independent maths, bills/load | own bill model (does not import `bill.js`), 459 bill cases, 225 page checks, 1,798 fuzz runs | 0 formula errors; 7 defects in rounding, consistency and text |
| Decision engine | own re-implementation of `home_decision` (imports no engine code), 34 scenarios, 224 to 337-point grids | Engine = spec = re-implementation on all 34; rule-level defects below |
| Live crawl | all 110 sitemap URLs + endpoints + WP probes, serial | 110 of 110 return 200; no SEO blocker |
| Browser QA | Playwright + Chromium 141 on the local copy (86 pages) and 6 live page loads | 2 High UI bugs on the homepage; no NaN/Infinity/blank anywhere |
| Viewports | 16 pages × 360, 390, 414, 768, 1366, 1920 px | No page-level sideways scroll; table and layout issues listed |
| Accessibility | axe-core 4.14 on 36 page/width/state runs + manual keyboard checks | 1 axe violation; focus and contrast items |
| Lab speed | Lighthouse 12.8.2 mobile + desktop, local (median of 3) and live (1 run) | Home mobile 94 local / 95 live; tools 98 to 100 |
| Security | code review of PHP output, JS DOM writes, lead handler, headers, `.htaccess`; secret scan of git history; live probes of repo folders | No exposed secrets, no XSS path found |
| Search results | WebSearch (US-based, not Google Pakistan), 24 searches, 4 competitor fetches | Advantages and gaps listed in section J |

**Not measured or not available:** real-user Core Web Vitals (CrUX; the site is two days old and no field data was available to this audit), Google Search Console (no access; nothing here claims anything about indexing), Safari/Firefox/real phones/screen readers, the quote form POST, PageSpeed Insights from Google's servers, server capacity (no load test was run, by rule), hPanel logs and settings, primary NEPRA re-check of tariff figures (WL-14 still open).

---

## A. Executive summary

**Overall:** the site is in good technical shape and the calculators are arithmetically sound. Every formula in `engine/` matched independently written reference code; across roughly 170,000 generated cases no result was NaN, Infinity, blank or wrongly negative, and every invalid input gave a specific message. Crawlability is clean: 110 of 110 pages return 200, titles, metas, canonicals, H1s, FAQ schema and sitemap all match the specs, and nothing is orphaned or noindexed by accident. Security review found no exposed secrets and no unsafe rendering of user input.

The real risks are not in the arithmetic but in **what the decision engine decides and what some pages say**:

**Top five risks**
1. **The homepage decision engine prices and recommends solar the home cannot bill (WL-91, High).** When the planner's array is bigger than the sanctioned load allows, the engine prices the full array (for example 9.36 kW, Rs 1,035,000) but counts savings only for the 3.51 kW that net billing accepts, and still recommends "Hybrid solar 9.36 kW". Rs 552,125 of panels earn nothing in that case, while the page's own notice says to plan fewer panels.
2. **The same home gets two different solar sizes depending on the page (WL-92, High).** The homepage, D8, D12, D13 and N13 size grid-tied systems with a midday "everything runs at once" power rule; D7, D2 and N17 size by energy. For one 191-unit home: homepage 5.85 kW, D7 1.755 kW. On D8's default home: 9 panels instead of 7 (about Rs 167k more), and N13's mosque 86% oversized.
3. **Homepage share links lose the user's plan (WL-89, High, live).** WordPress's canonical redirect re-encodes `?load=` on the front page, so every "Copy link" or WhatsApp share of a homepage plan opens the default plan instead.
4. **On desktop, any homepage input error swaps the two columns and swallows the click (WL-90, High).** The inputs jump into the narrow right column, the appliance list needs sideways scroll, and the Calculate click does not fire.
5. **Decision engine modelling gaps that can flip or overstate the recommendation (WL-93 to WL-97, Medium):** solar is assumed to keep exporting during power cuts (even at 24 h of cuts a day), close calls are announced as firm picks, the generator pays twice for backup units, the backup generator ignores motor starting surge (2.5 kVA where C1 says 5 kVA), and a "1 kVA UPS" carries loads that B5 says a 1 kVA UPS cannot.

**Is the decision engine internally consistent?** Yes with its own spec: the engine, the spec cases and an independent re-implementation agree on all 34 scenarios, the result table and the "how" text always match the numbers, and changing one input moves the result in the expected direction. **No** across tools: it disagrees with D7/N17 on solar size (WL-92), with C1 on generator size (WL-96), with B5 on UPS capacity (WL-97), and with N7 on the cheapest backup in 84 of 336 test points without explaining why (WL-102).

**Were the calculations independently verified?** Yes, for every engine in `engine/` (sections C and D). The independent checks share the data files' rules, so a wrong value in `data/` (a tariff, a price, a fuel curve) would not be caught; those remain owner/engineer items (WL-14, WL-24, WL-148).

**Main functionality and rendering risks:** WL-89 and WL-90 on the homepage; result tables on N7 and N18 need wide sideways scroll on phones (WL-135); the home appliance list headings are white on white on phones (WL-133). All content is server-rendered; nothing important needs JavaScript to be crawled.

**Main SEO weaknesses:** page text cannot hold links, so there are no contextual links between tools (WL-140); the two data pages and several DISCO pages are weakly linked (WL-141); the ten hubs are thin and have no visible date (WL-142); bill meta descriptions promise "all taxes" and FPA that the default estimate leaves out (WL-145); the site shows two different 300-unit bills and two different "latest" FPA figures while claiming no two pages can disagree (WL-115, WL-116).

**Main speed and UX concerns:** homepage mobile Lighthouse sits right at the 95 gate (94 local median, 95 live; WL-136), with 65.7 KB of JavaScript across 13 files and 1,176 ms of style and layout work. Tool pages score 98 to 100. No memory leak, interaction latency under 50 ms even with 40 appliance rows.

**Ready for growth?** Technically yes: routing, indexability, schema, security and speed are sound. Before more traffic and links arrive, fix the P0/P1 items in section H, chiefly the decision-engine sizing rule (WL-91, WL-92) and the two homepage bugs (WL-89, WL-90), because the homepage is the flagship and the place people will share.

---

## B. Findings and severity matrix

No finding is Critical. Severity scale: **High** = wrong or contradictory recommendation on a main page, or a broken main feature; **Medium** = wrong or misleading number/text on one tool, missing modelling with a real effect, or a significant SEO/UX gap; **Low** = small effect, edge case or polish.

Short form here; full evidence per finding in section C. "P" is the roadmap priority from section H.

| ID | Sev | P | Category | URL | Source | Title | Status |
|---|---|---|---|---|---|---|---|
| WL-89 | High | P1 | Functional | `/` | WP `redirect_canonical`; `assets/js/wattlyst-tool.js` `init()` | Homepage share links lose the plan | Confirmed live |
| WL-90 | High | P1 | UX/Functional | `/` (≥1200 px) | `assets/css/wattlyst-home.css` | Error swaps columns, swallows Calculate click | Confirmed |
| WL-91 | High | P0 | Decision Engine | `/` | `engine/decision.js:35-49`, `engine/planner.js:51-53` | Array above sanctioned load priced and recommended in full | Confirmed |
| WL-92 | High | P0 | Decision Engine / Consistency | `/`, D8, D12, D13, N13 vs D7, D2, N17 | `engine/solar.js:113-114` `solarSystem` | Grid-tied systems sized by the midday power rule | Confirmed |
| WL-93 | Medium | P1 | Decision Engine | `/` | `engine/decision.js:46-49, 84-86` | Solar keeps saving during power cuts | Confirmed (24 h case) |
| WL-94 | Medium | P1 | Decision Engine | `/` | `engine/decision.js:101` | Close calls stated as firm picks | Confirmed |
| WL-95 | Medium | P1 | Decision Engine | `/`, N7 | `engine/backup.js:136-140` `standbyFor` | Generator charged twice for backup units | Confirmed |
| WL-96 | Medium | P1 | Consistency | `/`, N7 vs C1 | `engine/backup.js:36,43,67` | Backup generator ignores starting surge | Confirmed |
| WL-97 | Medium | P1 | Consistency/Data | `/`, N7 vs B5 | `data/backup-prices.json`, `engine/battery.js:67-69` | "UPS 1 kVA" rated 900 W vs B5's 600 W | Confirmed |
| WL-98 | Medium | P1 | Decision Engine/Data | N7 | `engine/backup.js:80` | 24 V off-grid inverter priced with a 51.2 V pack | Likely (engineer) |
| WL-99 | Medium | P1 | Content/Trust | `/` | `content/pages/H1.json` | Four spec "not counted" items missing from the page | Confirmed |
| WL-100 | Medium | P1 | Data | `/`, N7 | `data/component-prices.json:13`, `engine/prices.js:32-38` | Hybrid inverter premium shows Rs 0 | Confirmed |
| WL-101 | Low | P2 | Content/AEO | `/` | H1 `battery_v` default vs `hybrid_bank_v` | Answer names a 24 V battery, recommends a 51.2 V pack | Confirmed |
| WL-102 | Low | P2 | Consistency | `/`, N7 | `backup.js`, `decision.js` | N7 and homepage disagree on cheapest backup without saying why | Confirmed |
| WL-103 | Low | P2 | Validation | `/` | `engine/planner.js:25-26` | Backup larger than the whole home accepted | Confirmed |
| WL-104 | Low | P2 | Content | N7 | `content/pages/N7.json` | Two fixed-text claims hold only on today's data | Confirmed |
| WL-105 | Low | P3 | Decision Engine | `/` | `engine/decision.js:102` | Budget test uses middle price only; unreachable branch | Confirmed |
| WL-106 | Low | P2 | Consistency | D7, D2 vs N17; H1 | `solar.js`, `seasonal.js` | 30/360-day vs 365-day year gives different panel counts | Confirmed |
| WL-107 | Low | P3 | Rule 3 | site-wide | `engine/messages.js`, `data/defaults.json` | Values duplicated in message text and two data files | Confirmed |
| WL-108 | Low | P2 | Test coverage | — | `tests/calc-text.test.js:229-244` | Browser data-copy test checks default inputs only | Confirmed |
| WL-109 | Medium | P1 | Calculation | F3–F12 | `engine/bill.js:99-105`, `engine/format.js:28` | Printed bill lines don't add up to printed total (Rs 1–2) | Confirmed |
| WL-110 | Medium | P1 | Consistency | E4 vs N4 | `engine/load.js:83`, `engine/sizing.js:149-163` | Opposite sanctioned-load advice for the same home | Confirmed |
| WL-111 | Medium | P1 | Calculation (spec gap) | N1 | `engine/bill.js:170-179` | Overbilling checker understates when protected status is at risk | Confirmed |
| WL-112 | Medium | P1 | Calculation | E1 | `engine/load.js:53-56`, `content/pages/E1.json:76` | E1 prices its result at the wrong slab rate | Confirmed |
| WL-113 | Low | P3 | Validation | (no live page) | `engine/bill.js:117` | `protected_check` breaks on "1,500" | Confirmed |
| WL-114 | Low | P2 | Content | F1, N1, F-pages | content JSON | Three small bill wording errors | Confirmed |
| WL-115 | Medium | P2 | Content/Data | F14, Bill Index, F12 | `tools/build.js:40-41`, `data/bill-index.json` | Two "current" FPA figures; ex-WAPDA FPA applied to K-Electric | Confirmed / Likely |
| WL-116 | Medium | P2 | GEO/Content | F1, F2, F12, Bill Index, `/` | content JSON | Two "300 units" bills, basis not stated | Confirmed |
| WL-117 | Low | P2 | Content | F-pages | content JSON | The 700→701 unit cliff (+Rs 4,479) is not explained | Confirmed |
| WL-118 | Low | P2 | Validation | F-pages, N16 | `engine/bill.js` | FPA input unbounded; N16 default AC on 1 kW connection | Confirmed |
| WL-119 | Medium | P1 | Content | C5 | `content/pages/C5.json` | Well-pump page promises headroom the generator lacks | Confirmed |
| WL-120 | Medium | P1 | Calculation (model gap) | B1–B5 | `engine/battery.js:19-31, 86` | Battery/UPS runtimes ignore inverter idle draw | Confirmed |
| WL-121 | Medium | P1 | Calculation (safety-adjacent) | W2 (DC) | `engine/wiring.js:87-124` | DC battery feed ignores inverter efficiency | Confirmed |
| WL-122 | Low | P2 | Rounding | B4, C1, C3, D6, D15, D16 | content `spec` values | Minimum sizes still rounded to nearest (WL-16 leftovers) | Confirmed |
| WL-123 | Low | P2 | Content | A4, A9, A10, B5, C5, C6, W4, N18 | content JSON | Page text that the engine contradicts | Confirmed |
| WL-124 | Low | P2 | Validation/UX | C1–C4, N18, W4, E6 | `engine/core.js:43`, `engine/messages.js`, `engine/wiring.js:24` | Row and field error messages point at the wrong place | Confirmed |
| WL-125 | Low | P2 | Consistency | W2 vs W3 | `engine/wiring.js` | Same lighting load: 2.5 mm² on W2, 1 mm² on W3 | Confirmed |
| WL-126 | Low | P3 | Calculation (edge) | B4; unused `cable_rating` | `engine/core.js:64`, `engine/wiring.js:200` | Two engine edge cases | Confirmed |
| WL-127 | Medium | P1 | Content | D8 | `content/pages/D8.json:173,179,513-514` | "Is 5 kW enough? Yes" contradicts the engine | Confirmed |
| WL-128 | Medium | P1 | Calculation (spec gap) | D3 | `engine/solar.js:112` | Off-grid sized on yearly average; winter shortfall | Confirmed (engineer to decide) |
| WL-129 | Low | P2 | Validation | D3, D5, D6, D15 | `engine/solar.js:57,92,144,168` | More than 24 hours a day accepted | Confirmed |
| WL-130 | Low | P2 | Calculation | N6 | `engine/forecast.js:16,26` | Sky label changes with the PR you type | Confirmed |
| WL-131 | Low | P2 | UX | D6 | D6 outputs | No panel shown above 585 W, no notice | Confirmed |
| WL-132 | Low | P3 | Data | D14, N3, `/` | `engine/prices.js` | Prices outside listed sizes extrapolated silently | Confirmed |
| WL-133 | Medium | P1 | A11y/UX | `/` (phones) | `wattlyst-home.css` phone block | Appliance list headings white on white | Confirmed |
| WL-134 | Medium | P2 | A11y | site-wide | `assets/css/wattlyst.css` | Amber-only focus ring, about 1.64:1 | Likely |
| WL-135 | Medium | P1 | UX | N7, N18, N17 | `wattlyst.css` `.wl-rtable` | Result tables need wide sideways scroll on phones | Confirmed |
| WL-136 | Medium | P2 | Performance | `/` | homepage chain | Homepage mobile Lighthouse at the 95 gate | Confirmed (lab) |
| WL-137 | Low | P3 | A11y/UX | various | various | Small UI items (8) | Confirmed |
| WL-138 | Low | P3 | Performance | site-wide | host cache headers | Versioned assets cached only 7 days | Confirmed |
| WL-139 | Low | P2 | UX | tool pages | templates | Calculate button below the fold on phones | Confirmed |
| WL-140 | Medium | P2 | Internal links | all tools/guides | `class-wattlyst-render.php` `sections()`, `faq()`, `examples()` | Page text cannot contain links | Confirmed |
| WL-141 | Medium | P2 | Internal links | data pages, F3–F11 | content `related` | Data pages and DISCO pages weakly linked | Confirmed |
| WL-142 | Medium | P2 | SEO/Content | 10 hubs | `generated/pages/P-*.json` | Thin hubs with no visible date | Confirmed |
| WL-143 | Low | P3 | Structured data | `/` | `tools/build.js` `schemaFor` | BreadcrumbList without a visible breadcrumb | Confirmed |
| WL-144 | Low | P3 | Nav/A11y | site-wide | `class-wattlyst-pages.php` `menu_fallback()`, `embeds()` | Nav and anchor hygiene (5 items) | Confirmed |
| WL-145 | Medium | P2 | SEO | F1–F11, D10, D14, F13 | `specs/keyword-map.csv` | Meta descriptions promise what the page doesn't do | Confirmed |
| WL-146 | Medium | P2 | Content/Data | E5 | keyword-map title, `data/appliances.json` | "1 unit per hour" stated without the range | Confirmed |
| WL-147 | Medium | P2 | Content | D9 | `content/pages/D9.json` | Headings promise brand and city prices the page lacks | Confirmed |
| WL-148 | Medium | P1 | Data | C8, N7, `/` | `data/generator-fuel.json` | Petrol fuel curve likely too low; diesel chart uncredited | Likely (engineer) |
| WL-149 | Low | P2 | Content | F1 | `content/pages/F1.json` | FAQ still names the TV fee | Likely |
| WL-150 | Low | P3 | Content | D9, D14, B1 | format specs | False precision on market prices | Confirmed |
| WL-151 | Low | P3 | Trust | N7, D9, D14, B1, E1 | `tools/build.js` `backupSources`, content | Weak or untidy source lists | Confirmed |
| WL-152 | Low | P3 | Content/GEO | D8, D12, D13, D14, N3 | content JSON | "Net metering" vs "net billing" wording | Confirmed |
| WL-153 | Low | P3 | AEO | 9 pages; E1 | content JSON | Answers over 60 words; E1 has no H2 sections | Confirmed |
| WL-154 | Low | P2 | Privacy | `/privacy-policy/` | `data/site.json` `analytics.enabled` | Privacy policy says GA4 is used; no GA tag is live | Confirmed |
| WL-155 | Low | P3 | Test coverage | — | `tests/guardrails.test.js`, `tools/maintenance.js` | Guardrail test never checks "negative"; upkeep report formatting | Confirmed |

---

## C. Finding details

### C1. Decision engine (homepage `/` and N7)

How the engine decides (as built and as specified): it prices four setups at the middle of their price range: on-grid solar, hybrid solar with a battery, UPS-or-generator, and on-grid solar plus UPS-or-generator. Net cost over the chosen years = price + battery replacements + 12 × years × (running cost − monthly saving), in today's rupees. Backup hours above 0 remove plain on-grid. The budget is tested against the middle price; if nothing fits, the cheapest is shown and flagged over budget. The lowest net wins; a tie (within 1e-9 rupees) goes to the lower price. Payback and the low/high price ends are not used in the pick.

#### WL-91 High (P0): an array above the sanctioned load is priced and recommended in full
- **URL:** `/`. **Source:** `engine/decision.js:35-49` `home_decision` prices `p.installed_kw`; `engine/planner.js:51-53` counts only `net_billing_kw` for the saving.
- **Input:** homepage defaults with 8 fans, 20 LED bulbs, 3 × 1.5 ton inverter AC at 8 h, 2 fridges, 2 TVs; sanctioned load 4 kW.
- **Expected:** price and benefit rest on the same array. Panels that net billing will not accept should not be bought in the recommended option, or the page should offer "raise your sanctioned load" as its own option.
- **Actual:** planner sizes 9.36 kW (16 panels); net billing counts 3.51 kW (6 panels). On-grid is priced at 9.36 kW = Rs 1,035,000 against Rs 482,875 for 3.51 kW: Rs 552,125 of panels with zero counted benefit. Recommendation text: "Hybrid solar 9.36 kW + 1 lithium pack … Rs 1,911,268 saved". With a 2 kW sanctioned load the waste is Rs 801,000 and the recommended hybrid shows "Rs 101,229 cost". The page's own `solar_above_sanctioned` notice tells the user to plan fewer panels.
- **Fix:** when `p.solar_above_sanctioned`, price and name the setups at `p.net_billing_kw` (or add a "raise sanctioned load" setup with its cost). Change `specs/formulas.md` (Home Power Decision Engine bullet) and the spec cases in the same PR.
- **Verification:** regression test `DEFECT DE-01` in `audit/2026-10-15/decision/decision.test.mjs` must pass; default homepage result unchanged.

#### WL-92 High (P0): grid-tied systems are sized by the midday power rule, so tools disagree for the same home
- **URLs:** `/`, `/solar/solar-system-for-5-marla-house/` (D8), `/solar/solar-system-for-10-marla-house/` (D12), `/solar/solar-system-for-1-kanal-house/` (D13), `/solar/solar-for-mosque-and-shop/` (N13) versus `/solar/solar-system-size-calculator/` (D7), `/solar/solar-panel-wattage-calculator/` (D2), `/solar/solar-size-from-electricity-bill/` (N17).
- **Source:** `engine/solar.js:113-114` `solarSystem()`: `kw = max(E / yield, P_run / 1000 / PR)` on every page that sizes from an appliance list.
- **Independent check:** D8 default list = 15.635 kWh/day. Energy sizing: 15.635 ÷ 4.0 (Lahore yield) = 3.909 kW → 7 × 585 W panels (4.095 kW). D7 and N17 for the same 469 units also give 7. D8 gives 9 panels (5.265 kW) because the running load 4,085 W ÷ 0.78 = 5.237 kW wins; that array makes 135% of what the home uses. Same rule: D12 17 vs 15 panels (+13%), D13 27 vs 23 (+17%), N13 small mosque 13 vs 7 (+86%, solar 187% of use). Homepage: 3 × inverter AC at 2 h + 5 LEDs = 191 units → homepage 5.85 kW, D7 1.755 kW; the homepage then shows Rs 64,829 saved over 10 years where a 1.17 kW array would save about Rs 423,631 by the engine's own month model.
- **Why it matters:** with net billing, the grid covers the midday peak; sizing the array to carry every appliance at once is an off-grid rule. It inflates the headline price (about Rs 167k extra on D8's default) and makes two Wattlyst pages give different answers for the same home.
- **Fix (needs the engineer's call, `specs/formulas.md` D and H1):** size grid-tied setups by energy (D7 rule), capped at the sanctioned load; keep the power term only for off-grid (D3) and solar-only loads (D5, D15), or apply a diversity factor. Update D8/N13 FAQ wording and spec cases.
- **Verification:** `DEFECT MD-01` (`audit/2026-10-15/mathD/defects.test.mjs`) and `DEFECT DE-02` pass: `solar_from_loads(D8).panels === solar_size({daily_kwh, city}).panels`, H1 = D7 for the same units.

#### WL-93 Medium (P1): solar output never drops during power cuts
- **Source:** `engine/decision.js:46-49, 84-86` always use `p.full_saving_rs`.
- **Evidence:** at 24 h of cuts a day the UPS grid refill window is 0 h, so the engine itself knows there is no grid, yet the on-grid and combo setups still export 223 units a month and save Rs 13,331 a month ("On-grid solar 3.51 kW + Petrol generator 2.5 kVA … saves Rs 13,331"). A grid-tied inverter shuts down when the grid is off. With a simple uniform-cut model (saving × (24 − h)/24), the tubular-battery default flips from combo to hybrid (combo saving falls from Rs 11,127 to Rs 9,273 a month, Rs 222k over 10 years, more than the Rs 143,797 gap).
- **Fix:** derate on-grid/combo solar output and export by the grid-available share (or cap backup hours for net-billed setups) and say so on the page. **Verify:** `DEFECT DE-03` passes (combo saving 0 at 24 h).

#### WL-94 Medium (P1): close calls are announced as firm recommendations
- **Source:** `engine/decision.js:101`.
- **Evidence:** backup 255 W, 4 h, 5 years: combo and hybrid are Rs 1,959 apart over five years and the text says "Recommended, the lowest net…" with no hedge. At the defaults the hybrid wins by Rs 236,163, but the price ranges overlap (hybrid Rs 578,750–912,000 vs combo Rs 478,989–801,499).
- **Fix:** compute each setup's net at the low and high price ends; add `close_call` and `runner_up` outputs and one sentence ("These two are close; get quotes for both"). Spec rule + cases. **Verify:** `DEFECT DE-04`.

#### WL-95 Medium (P1): the generator pays twice for the backup units
- **Source:** `engine/backup.js:136-140` `standbyFor` (also the combo, `decision.js:84`).
- **Evidence:** the UPS is charged only its losses above the backup load (which is already in the monthly bill). The generator is charged petrol and oil for the backup units while the same units stay on the bill. At 12 h cuts: 180 units a month come off the grid, worth Rs 9,524 a month (Rs 1.14 M over 10 years); generator running cost shown Rs 69,288 a month, should be Rs 59,764. The UPS-vs-generator choice did not change in 224 grid points; the overall pick moved in 6 (1-year horizons).
- **Fix:** put both standby options on the same baseline (credit the grid units the generator replaces). **Verify:** `DEFECT DE-05`.

#### WL-96 Medium (P1): the backup generator ignores starting surge (contradicts C1)
- **Source:** `engine/backup.js:36, 43, 67` size on `load × margin`; C1 (`engine/sizing.js:72-74`) uses `max(run × margin, peak) / PF`.
- **Evidence:** 1 HP motor + 2 fans = 1,160 W running, 2,960 W start. C1 (`/generator/generator-size-calculator/`) picks 5 kVA; N7 (`/load/ups-vs-solar-vs-generator-cost/`) and the homepage standby pick 2.5 kVA (2,000 W, below the start).
- **Fix:** optional surge input on N7; on the homepage pass the list's `peak_w` or warn when the backup includes a motor. **Verify:** `DEFECT DE-06`.

#### WL-97 Medium (P1): "UPS 1 kVA" on N7/homepage runs loads that B5 rejects
- **Source:** `data/backup-prices.json` lists the 1 kVA UPS with `rated_w: 900` (from 1,200 VA listings); B5 (`engine/battery.js:67-69`) uses VA × 0.6 = 600 W.
- **Evidence:** at 650, 700 and 720 W, N7 picks "UPS 1 kVA" while `/battery/ups-backup-time-calculator/` (B5) returns `load_exceeds_ups_rating` for 1 kVA.
- **Fix:** label the option by its real VA (1.2 kVA) or align the power factor. **Verify:** `DEFECT DE-07`.

#### WL-98 Medium, Likely (P1, engineer): N7 hybrid pairs a 24 V inverter with a 51.2 V pack
- **Source:** `engine/backup.js:80` uses every `hybrid_inverter` row, including the 4 kW row marked `export_capable: false` whose own note says these are 24 V units; the lithium pack is 51.2 V. A 48 V 6 kW inverter would add about Rs 143k to N7's solar total at defaults.
- **Fix:** add `bank_v` to inverter and pack rows and match them. **Verify:** engineer sign-off + a test that no priced hybrid pairs mismatched voltages.

#### WL-99 Medium (P1): the homepage leaves out four "not counted" items the spec says it states
- **Evidence:** `specs/formulas.md` lists as "Not counted (the page says so)": battery losses on solar self-use, inverter replacement, daytime solar the hybrid battery stores, and daytime power cuts in the on-grid and combo setups. `generated/pages/H1.json` states only installation, leftover battery value and today's rupees.
- **Fix:** one "What this comparison leaves out" sentence on H1; a content test that every spec "not counted" item appears on the page.

#### WL-100 Medium (P1): the hybrid inverter premium shows Rs 0
- **Source:** `engine/prices.js:32-38` `inverterAt()`, `engine/decision.js:64-67`, `data/component-prices.json:13`.
- **Evidence:** at the homepage default (2.7 kW): hybrid 247,250 ÷ 6 × 2.7 = Rs 111,263; on-grid 235,000 ÷ 5 × 2.7 = Rs 126,900; premium = max(0, −15,637) = 0. The page prints "Rs 0 extra for a 2.7 kW grid-tie hybrid inverter". The on-grid 5 kW and 10 kW middle prices are both Rs 235,000; the 5 kW high of Rs 350,000 is a three-phase unit from a search snippet the data file itself marks "not verified". WL-11's monotonic price test does not cover `component-prices.json`.
- **Fix:** re-source that row (or use the median), add 3 kW on-grid and 3–5 kW export-capable hybrid rows, extend the monotonic test to component prices, show "premium not known" instead of Rs 0.

#### WL-101 Low (P2): homepage answer names a 24 V battery, then recommends a 51.2 V pack
- "a 103 Ah battery at 24 V for 4 hours … best fit is Hybrid solar 3.51 kW + 1 lithium pack of 5.12 kWh (51.2 V)". The battery-voltage field changes the Ah figure but not the price, net or pick. **Fix:** state backup need in kWh, or size at the decision's bank voltage when hybrid wins.

#### WL-102 Low (P2): N7 and homepage disagree on the cheapest backup in 84 of 336 test points
- Grid: 150–3,000 W × 1–12 h × 1, 3, 5, 10 years. Example: 300 W × 4 h × 5 years: N7 says UPS, homepage says hybrid. The objectives differ legitimately (N7 ignores bill savings, uses a small solar kit, prices UPS recharge at the slab rate without GST), but neither page says so. **Fix:** one sentence on each page and a link between them.

#### WL-103 Low (P2): backup larger than the whole home is accepted
- 5,000 W backup on a 2,085 W home and 20 kWh/day of backup against 13.2 kWh/day total use are accepted (`engine/planner.js:25-26`), which breaks the assumption that backup energy is inside the monthly units. **Fix:** a notice or error when backup exceeds the running load or daily use. **Verify:** `DEFECT DE-12`.

#### WL-104 Low (P2): two N7 claims are fixed text that holds only on today's data
- Key fact "generator dearest within the first year" fails at petrol ≤ Rs 363.3/L (9% below current data). FAQ "bigger loads and long cuts: solar cheapest" fails at 1,000 W × 6 h over 1–2 years. **Fix:** make the claims conditional on engine outputs, or keep the guard test (`OK guard` in `decision.test.mjs`) in the suite.

#### WL-105 Low (P3): budget uses the middle price only; an unreachable branch
- With a Rs 500k budget, the combo (low end Rs 478,989, saves money) is excluded and a UPS (Rs 830k net cost) is recommended. The `key: 'none'` branch (`decision.js:102`) cannot be reached; `backup_w` is required even at 0 backup hours.

#### WL-106 Low (P2): different "year" lengths give different panel counts
- H1, N7, E5 use 360-day years; N17, N10, N12 use 365. D7 divides monthly units by 30 while the yield is a 365-day average and is rounded to 0.1. Karachi, 330 units every month: D7 5 panels, N17 4 panels. Across flat bills 50–3,000 units the counts differ in 14 to 150 of 296 cases per city. **Fix:** one days-per-month constant in `data/defaults.json` used everywhere.

#### WL-107 Low (P3): duplicated constants
- AC figures in both `data/defaults.json` (`ac_*_1_5_ton`, used by N10 and D8 text) and `data/appliances.json` (equal today). `engine/messages.js` hard-codes "5 kW", "200 units", "6 months", "10 and 60 °C", "0.05", which live in `data/`; codes built from data (`protected_max_${max}_units`) fall back to the generic message if the data changes. **Fix:** render message numbers from data; one source per constant.

#### WL-108 Low (P2): the browser data-copy test checks default inputs only
- `tests/calc-text.test.js:229-244`. The audit compared the browser copy with the build data over 337 input sets: 0 differences today, but a field read only on a non-default path could be stripped without any test failing. **Fix:** move `OK browser copy …` from `audit/2026-10-15/decision/decision.test.mjs` into the suite.

### C2. Bills and load (F1–F12, N1, N16, E1–E6)

The bill engine is correct: `bill_total` matched an independent model to 1e-6 on all 459 cases (0 to 5,000 units × protected/unprotected/lifeline × 1, 2, 4.9 kW × three FPA values), e.g. 300 units at 1 kW = 9,930 + 350 + 969 + 155.82 = 11,404.82 × 1.18 = Rs 13,457.69. All 225 page numbers, the 32 Bill Index cells and N16 (= F1 run twice) match. The bill never decreases as units rise; slab cliffs are upward only.

#### WL-109 Medium (P1): printed bill lines don't add up to the printed total
- **URLs:** F3–F12. **Source:** `engine/bill.js:99-105` returns unrounded lines; `engine/format.js:28` rounds each separately.
- **Evidence:** F5 and F10 how text: "Subtotal Rs 9,562 + GST Rs 1,721 = Rs 11,284" (sum 11,283); F12 example 1 lines sum to 17,079, page prints 17,078; F9 example 2 is Rs 2 off. 15 printed places; 1,188 of 3,003 bills (0–1,000 units, 1–3 kW) are affected.
- **Fix:** round each line in the engine, subtotal = sum of rounded lines, GST = round(subtotal × %), total = subtotal + GST. formulas.md F + spec cases in the same PR (rule 2). **Verify:** `DEFECT MF-01` in `audit/2026-10-15/mathF/defects.test.mjs`.

#### WL-110 Medium (P1): E4 and N4 give opposite sanctioned-load advice
- `/load/load-before-adding-ac/` (E4, `content/pages/E4.json:144,272`) says two 1.5 ton ACs at 4.4 kW need "5 kW … practical minimum" (which means a ToU meter and no protected slabs). `/bill/sanctioned-load-calculator/` (N4) gives 3 kW for 4.4 kW connected (0.6 diversity) and its own text says 4 kW for the same home. **Cause:** E4 uses running load with no diversity (`engine/load.js:83`), N4 uses `engine/sizing.js:149-163`. **Fix:** one rule (owner/PEC), both pages call it. **Verify:** `DEFECT MF-02`.

#### WL-111 Medium (P1, spec gap): N1 understates the overcharge exactly when protected status is at risk
- `/bill/bill-audit-overbilling-checker/` example 2: 210 units over 34 days; page says extra Rs 930. The engine always prices the "fair" bill at unprotected rates (`engine/bill.js:170-179`). Against the protected bill the home should have had (slab limits pro-rated × 34/30, about Rs 2,752), the extra is about Rs 4,549. This is the classic long-reading-period overbilling case. **Fix:** formulas.md N1 + tests: compute the fair bill on the pro-rated slabs and the protected status the home had. **Verify:** `DEFECT MF-03`.

#### WL-112 Medium (P1): E1 prices its own result at the wrong slab
- `/load/home-electrical-load-calculator/`: default list = 454 units, priced at Rs 36.46 (the 301–400 rate, `content/pages/E1.json:76`) = Rs 16,555. Those units fall in the 401–500 band: energy alone about Rs 17,685; F1's whole bill for 454 units at 1 kW is Rs 23,465. Unlike E5 and H6, E1 gives no slab note or link. **Fix:** price with `bill_energy`/`bill_total` (or label the figure "at Rs X a unit" and link F1). **Verify:** `DEFECT MF-04`.

#### WL-113 Low (P3): `protected_check` breaks on "1,500"
- `engine/bill.js:117` runs `Math.max` on raw strings after validation; history "1,500" returns `internal_non_finite`. No live page uses it today. **Verify:** `DEFECT MF-05`.

#### WL-114 Low (P2): three small bill wording errors
- F1 key fact (`content/pages/F1.json:111`): "pays Rs 350 a month before using a single unit"; at 0 units the fixed charge is Rs 275, Rs 350 applies above 200 units.
- N1 example 3 (`content/pages/N1.json:146`) calls 401–500 "the top slab" (the top slab is above 700).
- The "Per unit rate" column shows Rs 13.01 on protected rows, which are billed slab by slab (real average Rs 11.37 at 150, Rs 11.78 at 200).

#### WL-115 Medium (P2): two "current" FPA figures; ex-WAPDA FPA applied to K-Electric
- `/guides/fpa-in-electricity-bill/` (F14) meta promises "this month's rate" and pre-fills Rs 2.5182 (July 2026, the newest *verified* month, `tools/build.js:40-41` `fpa_latest`); the Bill Index says October bills carry Rs 1.11 (from a news report, flagged unverified only in its Method section). WL-13's single source still holds; only the wording conflicts.
- Likely: the Bill Index applies the ex-WAPDA FPA to K-Electric (including September, whose source is ex-WAPDA only), while F12 and F14 say K-Electric's FCA is decided separately.
- **Fix:** F14 shows the newest month marked "reported, NEPRA decision not yet published" or says "latest verified rate"; Bill Index marks the month "(reported)"; K-Electric row uses KE's own FCA or is marked "not included".

#### WL-116 Medium (P2): two different "300 units" bills, basis not stated
- F1, F2, F12 answers: Rs 13,458 for 300 units (1 kW, FPA blank). Bill Index title: "300 Units = Rs 14,264" (2 kW, FPA Rs 1.11). Both are correct for their inputs; the homepage section "Why the numbers can be trusted" says "no two pages can disagree", and F1/F2 answers don't say the figure is before FPA (F12 does). **Fix:** name the kW and FPA basis in the same sentence on every 300-unit figure (or pre-fill FPA from the newest Bill Index month), and soften the homepage sentence to "every number comes from one engine".

#### WL-117 Low (P2): the 700→701 cliff is not explained
- One extra unit at 700 adds Rs 4,479 (unprotected rates apply to all units above 700); only the 300-unit cliff is explained. **Fix:** an engine-made key fact on F1 and the DISCO pages.

#### WL-118 Low (P2): FPA input unbounded; N16 default AC on a 1 kW connection
- FPA −100 gives a total of Rs 0 with lines that cannot reconcile. N16's default is a 1 kW connection with a 1,450 W AC and no warning. **Fix:** bound FPA (data-driven range) and add a sanctioned-load notice on N16.

### C3. Converters, battery, generator, wiring (A, B, C, W, N4, N11, N18)

Formulas are correct: 61,971 random cases against first-principles reference code (P = V·I·pf, √3 for three-phase, Wh = V·Ah, usable = DoD × efficiency, voltage drop 2·L·I·ρ/A and √3·L·I·ρ/A, IEC 60364-5-52 ampacity and derating tables, PK size table) gave 0 mismatches; 408 page-text numbers match; 101,316 monotonicity checks (more load never gives a smaller wire, breaker or generator; longer cable never a thinner wire; more Ah never less runtime) gave 0 violations. WL-01, 07, 08, 09, 10, 17, 19 have not regressed.

#### WL-119 Medium (P1): C5 well-pump page promises headroom the generator does not have
- `/generator/generator-for-well-pump/`: the text says the 1 hp pump's 3.5 kVA set "also carries a few lights and fans", a key fact says lights and fans "rarely change the size", an FAQ says switching off lights "does not change" it (`content/pages/C5.json` key_facts[3], faq[0], faq[4]). Pump start = 2,796.4 W; 3.5 kVA × 0.8 = 2,800 W, leaving 3.6 W. The engine (`engine/sizing.js:132`) correctly jumps to 5 kVA with 4 W of other load. **Fix:** correct the text or render it from an engine example with `other_w`. **Verify:** `DEFECT MA-01`.

#### WL-120 Medium (P1): battery and UPS runtimes ignore inverter idle draw
- B1–B5 (`engine/battery.js:19-31, 86`); B4 sizes banks the same way. The site's own `data/appliances.json` gives `ups-idle` = 30 W. B5 at 150 Ah, 12 V, 10 W: engine 76.5 h, with idle draw 21.55 h (3.55× overstated). B3 at 200 Ah, 80 W: 12.75 h vs 9.67 h. B2 at 100 Ah, 50 W: 10.2 h vs 6.75 h. Small loads are exactly what people run on a UPS overnight. **Fix:** add `idle_w` (default from data) to formulas.md B, tests and the battery calculators. **Verify:** `DEFECT MA-02`.

#### WL-121 Medium (P1, safety-adjacent): DC battery-to-inverter feed ignores inverter efficiency
- `/wiring/wire-size-calculator/` (W2) example 4: 3,000 W on 48 V → 62.5 A, 63 A breaker, 25 mm². Real battery current = 3,000 ÷ (0.9 × 48) = 69.4 A, above that breaker (nuisance trips under full load); the site's own design rule then needs a cable rated 86.8 A, but 25 mm² is rated 79.8 A. Entering the true 3,333 W returns `load_above_standard_breakers` because the list stops at 63 A. **Fix:** for DC feeds, divide by inverter efficiency and use the minimum battery voltage; add DC fuse sizes above 63 A (PEC to confirm). **Verify:** `DEFECT MA-03`.

#### WL-122 Low (P2): minimum sizes still rounded to nearest (WL-16 leftovers)
- B4 `kwh_required` prints 4.7 kWh for 4.706; C1/C3 `recommended_kva` prints 3.25 for 3.2547; D6 `panel_w` 271.49 → "271"; D15 `drive_kw` 11.6516 → "11.65"; D16 `amps` 26.12 → "26.1". **Fix:** use the `up1`/`up2` formats from `engine/format.js`. **Verify:** `DEFECT MA-05`, `DEFECT MD-09`.

#### WL-123 Low (P2): page text the engine contradicts
- A10: "a 1,000 W inverter on 200 Ah at 12 V runs well under an hour"; engine and B3 give 1 h 1 min.
- A4: "Use the running amps for the cable" gives 7.88 A for a 1.5 ton inverter AC; W1, W3, E4 and N18 design on 9.18 A.
- W4 FAQ says the page "does not check the current rating"; it does (`over_cable_rating`).
- N18 "clipped on the surface" example names the geyser; the circuit that changes is the 2 ton AC.
- C6: 3.5 kVA "the usual size" for one inverter AC + fans, lights, fridge; engine gives 5 kVA (non-inverter fridge) or 3 kVA.
- C5: larger pumps need "above 30 kVA"; 6–7 hp fits 25 kVA.
- B5: online UPS "closer to one W per VA"; A9 says online UPS are rated 0.8.
- A10 title promises "kWh to Ah" but only Ah to Wh runs (intent mismatch).
- **Fix:** render each claim from an engine example; add a content test per claim. **Verify:** `DEFECT MA-04, 06–11`.

#### WL-124 Low (P2): error messages point at the wrong place
- C1–C4: too-large watts in a list row shows `watts_too_large` with no row number; N18 prints "Load 0 watts is too large" (counts from zero) (`engine/core.js:43`, `engine/messages.js:94-104`; WL-29 leftover).
- W4 (`/wiring/solar-cable-size-calculator/`): blank string current says "Enter watts." and focuses nothing (`engine/wiring.js:24` falls back to `watts`, which W4 lacks).
- `units` hours error says "for at least one appliance" on a single-input converter (`messages.js:35`).

#### WL-125 Low (P2): the same 400 W lighting load gets 2.5 mm² on W2 and 1 mm² on W3
- W2's `circuit` field defaults to `other` and ignores `load_type`. **Fix:** default `circuit` from `load_type`, or show the minimum rule used.

#### WL-126 Low (P3): two engine edge cases
- `battery_bank` returns 0 batteries for a tiny positive load because `ceilSafe` (`engine/core.js:64`) subtracts a fixed 1e-9 (practically unreachable).
- `cable_rating` (`engine/wiring.js:200`) reports watts at 30 °C with no derating (4,416 W instead of 3,489 W at 45 °C); no live page uses it.

**Engineering recommendations for the PEC reviewer (no failing test):** earth-fault loop not checked (C16 on 4 mm² at 80 m: R1+R2 ≈ 0.90 Ω vs 1.44 Ω limit, fine there but unchecked in general); microwave and laser printer on a B-curve despite inrush; fractional `circuits`/`qty` accepted; three-phase DOL motors on C-curve borderline; 1 hp pump is 1,000 or 932 W and 2 hp is 2,000, 1,864 or 1,900 W on different pages.

### C4. Solar and prices (D1–D16, N3, N6, N12, N14, N17)

Formulas are correct (1e-6 agreement on random grids and boundaries); 3,699 hostile inputs gave no NaN/Infinity/negative/blank; WL-11, 12, 17, 18 hold. D5 = E5 for AC units; D14 = N3; D9 = D14 panel share; N14 = D1; homepage default (6 panels) = D7 = N17. WL-92 and WL-100 above came from this part.

#### WL-127 Medium (P1): D8 says "Is a 5 kW solar system enough? Yes" against its own engine
- `content/pages/D8.json:513-514` answers "Yes … which needs 5.27 kW of panels and a 5.11 kW inverter"; line 179 says "A five kW inverter with 9 panels suits…" while the engine's minimum inverter is 4,085 × 1.25 = 5,106 W. "five kW" and "Yes" are typed text; the number-words test (WL-23) only checks words from twenty up. **Fix:** engine-rendered yes/no or remove the claim; extend the number-words test below twenty. **Verify:** `DEFECT MD-02`.

#### WL-128 Medium (P1, engineer decides): D3 off-grid is sized on the yearly average yield
- `/solar/off-grid-solar-calculator/`, `engine/solar.js:112`. Need 6.645 kWh/day, 1.755 kW installed. Lahore in January: 1.755 × 92.1 ÷ 31 = 5.214 kWh/day, 21.5% short. Months below need: Lahore Jan, Jul, Nov, Dec; Islamabad and Peshawar Jan, Feb, Nov, Dec; Multan Jan, Dec; Karachi Jul, Aug; Quetta none. Worst-month sizing needs 4 panels instead of 3 in every city but Quetta; `pvout_month` is already in `data/cities-pk.json`. **Fix:** size off-grid on the worst month or show the shortfall month. **Verify:** `DEFECT MD-04`.

#### WL-129 Low (P2): more than 24 hours a day accepted
- D5 at 25 h → 25 kWh/day, 11 panels; D15 at 25 h → 91 panels; D5 night hours 25 → 1,865 Ah; D3 accepts 30 h; D6 accepts PSH 25 (`engine/solar.js:57, 92, 144, 168`). E5 and the appliance rows reject 25 h. **Fix:** cap hours at 24 and PSH at about 12. **Verify:** `DEFECT MD-05`.

#### WL-130 Low (P2): N6 sky label changes with the PR you type
- `/solar/solar-forecast-tomorrow/`, `engine/forecast.js:16` vs `:26`: a forecast of 5,100 Wh/m² (= Lahore's typical 5.1 PSH) shows "Sunny" (99.45%) at PR 0.78 and "Partly cloudy" (63.75%) at PR 0.5. **Fix:** compare PSH with PSH. **Verify:** `DEFECT MD-06`.

#### WL-131 Low (P2): D6 shows no panel above 585 W
- `/solar/solar-panel-for-12v-battery/`: 200 Ah 24 V needs 724 W; the engine computes 2 × 585 W but no output shows it; the panel card and how text are hidden. **Fix:** show `panels_of_largest` with a notice. **Verify:** `DEFECT MD-07`.

#### WL-132 Low (P3): prices outside the listed sizes are extrapolated silently
- Below 3 kW or above 20 kW the nearest size's Rs/W is reused with no flag (1 kW on-grid = Rs 100,000–166,667). **Fix:** a "few price points at this size" notice (the low-confidence notice already exists).

### C5. Browser, UX, accessibility

All 86 calculator pages passed default, invalid-input (empty, −5, abc, "1,500", 1e15, 0), recovery, select-option, rapid-change, share round-trip, print-call, Roman Urdu and back/forward checks with no NaN/Infinity/blank, no JS errors and no failed requests, except as listed. WL-05, 25, 26, 30, 31, 33, 34, 52, 55, 77 re-checked and still fixed.

#### WL-89 High (P1): homepage share links lose the user's plan
- **Live evidence (19:26 UTC, re-confirmed by curl later the same evening):** `curl -I 'https://wattlyst.com/?load=city:lahore,years:5'` returns `HTTP/2 301`, `location: https://wattlyst.com/?load=city%3Alahore%2Cyears%3A5`, `x-redirect-by: WordPress`. In the browser: row 1 Qty changed 4 → 6, Copy link, open link → Qty 4 and the default plan ("Hybrid solar 3.51 kW … Rs 13,331") instead of the shared plan ("Hybrid solar 4.1 kW … Rs 15,150").
- **Cause:** WordPress core `redirect_canonical` on the static front page re-encodes `:` and `,`; `assets/js/wattlyst-tool.js` `init()` reads the raw query with `/[?&]load=([^&#]*)/` and splits on `:` and `,`, finds no pairs, and silently shows defaults. Affects Copy link, WhatsApp text, the `replaceState` URL and any reload. The 301 is cached 7 days; every `?load=` variant is a full-page cache miss. All other tools' share links pass.
- **Fix:** in `includes/class-wattlyst-site.php` add a `redirect_canonical` filter returning false when `is_front_page() && isset($_GET['load'])`; optionally decode `%3A`/`%2C` once in JS. **Verify:** the curl above returns 200 with no Location; a Playwright share round trip on `/` restores the plan; add a `tests/wordpress.test.js` assertion for the filter.

#### WL-90 High (P1): on desktop, any homepage error swaps the columns and swallows the click
- **Cause:** `assets/css/wattlyst-home.css` inside `@media (min-width:1200px)`: `.wl-tool-split>.wl-out{grid-row:1/span 2}` has no `grid-column`; `.wl-rtable` is pinned to column 1 row 2. On an error, `show()` hides `[data-wl-rtable]`; auto-placement then moves "Your plan" into column 1 and the inputs into the 336 px right column. Introduced in v0.8.14 (PR #29).
- **Evidence:** inputs move from x=149 (704 px wide) to x=881 (336 px); the appliance list needs sideways scroll (521 px in 334 px); typing `abc` then pressing "Plan my home power": the button moves 120 px between mousedown and mouseup, no submit fires, focus does not move to the field. Screenshots: `shots/home-1366-after-error-blur.png`, `shots/vp/home-error-1366x768.png`, `shots/vp/home-error-1920x1080.png` (browser QA scratch folder). E1 and phone layout unaffected.
- **Fix:** `.wl-tool-split>.wl-in{grid-column:1;grid-row:1}` and `.wl-tool-split>.wl-out{grid-column:2}`. **Verify:** Playwright at 1366 and 1920: inputs' bounding box unchanged before and after an error; first click submits and focuses the field.

#### WL-133 Medium (P1): homepage phone appliance list headings are invisible
- Phone block of `wattlyst-home.css`: `#wl-h1 .wl-loads thead th{background:none…}` keeps the white `th` text: "Watts", "Qty", "Hours a day" are `rgb(255,255,255)` on white (1:1). Each phone row shows three unlabelled boxes; E1 is fine. **Fix:** add `color:var(--wl-muted)`. **Verify:** computed colour contrast ≥ 4.5:1 at 390 px.

#### WL-134 Medium, Likely (P2): amber-only focus ring
- `wattlyst.css`: `.wl-loads input:focus, …, .wl-remove-row:focus, .wl-btn-secondary:focus{outline:3px solid #ffbf47}` comes after the dark `:focus-visible` rule and wins on list inputs, × Remove, "+ Add appliance" and share-bar buttons: about 1.64:1 on white (WCAG 1.4.11 needs 3:1). **Fix:** dark outline plus amber halo, as on links.

#### WL-135 Medium (P1): N7, N18 and N17 result tables scroll sideways on phones and tablets
- Table width / visible box: N7 816 px in 303/333/711 px (360/390/768 wide); N18 894 px in the same; N17 471 px in 333 px. On N18 the wire, MCB and voltage-drop columns (the answer) are off screen. Only the homepage table has the phone card layout. **Fix:** apply the existing card CSS (it already uses `data-l` labels) to every `.wl-rtable` below 769 px. **Verify:** no `.wl-rtable` scrollWidth > clientWidth at 390 px.

#### WL-137 Low (P3): small UI items
- Home "Show every step" checkbox `#wl-how-all` stays focusable with a hidden label in the error state (the only axe violation in 36 runs).
- GeneratePress mobile menu: Escape does not close it (`aria-expanded` stays true, focus drops to body); with JS off the Menu button does nothing.
- With JS off, Calculate does a native GET and reloads defaults (noscript note is present; WL-27's fix only works with JS on).
- N18 new row starts with a blank cable length, so the first edit shows an error; rows are called "Appliance" on a circuit sheet.
- No Roman Urdu toggle on N7, N16, N18 (no `label_ur` in `content/labels-ur.json`).
- Recalculated tables use a normal space after "Rs" (server prints a non-breaking space), so "Rs 363,750" can wrap.
- 3 px overlap between the appliance select and the × button on phones (home, E1, C1, H3, N18 at 360/390).
- N11 accepts 100 × 100 batteries (1,200 V) with no warning; × buttons are all named "Remove this appliance" with no row number.

#### WL-139 Low (P2): Calculate button below the fold on phones (WL-51/WL-78 still partly open)
- At 390 × 844 the first input is on screen on every tool page, but the Calculate button sits 935–2,292 px down (home 2,250, C1 2,022, N18 2,058). Results update on change, so this mostly matters for discoverability. Homepage is now 10,784 px tall on a phone (was 14,192 at WL-78).

### C6. Performance

#### WL-136 Medium (P2): homepage mobile Lighthouse sits at the 95 gate
- Local mobile 94 / 93 / 94 (median 94); live mobile 95 (1 run). Live home: HTML 168 KB decoded / 56.7 KB brotli, DOM 1,007 elements, main thread 2.73 s of which Style & Layout 1,176 ms, long tasks 660 ms and 370 ms, TBT 129 ms, FCP 2.20 s, LCP 2.23 s (LCP element `p.wl-answer`). CI on GitHub's hardware was green, so read this as "no headroom left", not as a CI failure.
- Real JavaScript including nested imports (the JS budget test counts only the page module): H1 65.7 KB raw / 22.2 KB brotli across 13 files; E1 44.4 KB; N18 36.2 KB; N7 30.0 KB; B1 25.0 KB. GeneratePress `menu.min.js` adds 7.3 KB everywhere.
- **Fix:** reduce style/layout cost on the homepage (fewer CSS grid/subgrid recalculations, `content-visibility:auto` on the folded sections below the planner), defer the result-table module until first calculation, and make the budget test count the whole import chain (open to-do from earlier handoffs). **Verify:** Lighthouse mobile median of 3 ≥ 97 locally.

#### WL-138 Low (P3): versioned assets cached only 7 days
- `dist/*.js?ver=<hash>` and `logo.svg?v=` change on every build but are served `max-age=604800`; they can be `max-age=31536000, immutable` (LiteSpeed/hPanel or `.htaccess` in the plugin folder for `dist/`). HTML is still 7 days (WL-36, owner).

### C7. SEO, internal links, content

#### WL-140 Medium (P2): page text cannot contain links
- `includes/class-wattlyst-render.php` `sections()` (line 555), `examples()` and `faq()` print through `esc_html()`, and the content JSON has no link field. The text names tools without linking them: D11 "Size the connection with the sanctioned load calculator…", H9 "The battery backup calculator…", F2 "see the electricity bill calculator for Pakistan linked below". **Fix:** a `[[ID|anchor]]` token resolved at build time to the live URL (build fails on an unknown or non-live ID), printed through `wp_kses` allowing only `<a href>`, plain text in FAQ schema. **Verify:** D11 HTML has an in-section `<a href="/bill/sanctioned-load-calculator/">`; a test that every token resolves.

#### WL-141 Medium (P2): data pages and DISCO pages are weakly linked
- `/data/pakistan-electricity-bill-index/` and `/data/pakistan-solar-price-tracker/` (the site's link-earning assets) get in-content links only from each other and `/data/`. F9 and F11 have 3 linking pages, F3–F6 4; F1's `related` lists only F2 and F12 among DISCO pages. See the link plan in section G.

#### WL-142 Medium (P2): the ten hubs are thin and show no date
- `generated/pages/P-*.json` have `content: null`: only an H1 and children's metas copied verbatim; `/troubleshoot/` 92 words, `/data/` 94, `/battery/` 184, `/guides/` 195. Schema has `dateModified` but no visible date (10 hubs). `/bill/` "Electricity Bill Calculators Pakistan 2026" vs F1 "Electricity Bill Calculator Pakistan 2026" invites cannibalisation. **Fix:** `content/pages/P-*.json` with a 40–60 word answer, task-routing sections, an engine key fact and the dates line; give `/bill/` a distinct focus ("all 11 DISCO bill calculators").

#### WL-143 Low (P3): homepage BreadcrumbList with no visible breadcrumb
- `tools/build.js` `schemaFor` emits a one-item "Home" list; `hero()` drops the home crumb (WL-81). **Fix:** omit BreadcrumbList on the home type.

#### WL-144 Low (P3): nav and anchor hygiene
- The header menu marks the parent hub `aria-current="page"` on every child page (`includes/class-wattlyst-pages.php` `menu_fallback()`, `str_starts_with`); use `aria-current` only on an exact match.
- `/appliances/` hub (H2) is in neither header nor footer; without the home grid it sits at depth 3 and H3–H7 at depth 3–4. Add it to the footer "Calculators" column.
- The embed page has 87 identical "Open the full page" anchors (`embeds()` / `embedList`); add the tool name or `aria-label`.
- Every Related link uses the target's exact H1 ("Electricity Bill Calculator Pakistan" ×36); optional `link_text`, or rely on WL-140.
- `/feed/` and `/comments/feed/` return 404 with an RSS body (`Content-Type: application/rss+xml`); optional HTML 404.

#### WL-145 Medium (P2): meta descriptions promise what the page doesn't do
- F2–F11: "…with the current tariff, FPA and all taxes" (ten identical except the name); F1 "taxes and FPA". Income tax is excluded and FPA is blank by default.
- D10 "Enter solar kW": the tool has no solar kW field. D14 "part by part": only the panel share is broken out. F13: "…from NEPRA's latest schedule found…" (grammar). llms.txt inherits these.
- **Fix:** accurate wording in `specs/keyword-map.csv` plus one local hook per DISCO from the existing body sections (rule 5: metas come from the keyword map).

#### WL-146 Medium (P2): E5 title "1.5 Ton Inverter AC: 1 Unit per Hour on Average"
- The 1.0 kW is `avg_w: 1000` in `data/appliances.json`, marked "engineer to confirm"; E5's own cited source (Gree datasheet via a retailer) uses 1.2 units per hour; other Pakistani results say 1.2–1.5. `specs/seo-rules.md` §5 uses this exact answer with a range ("0.5–1.4 depending on…"). **Fix:** put the engine range in the answer (and optionally title); PEC to confirm `avg_w`.

#### WL-147 Medium (P2): D9 headings promise data the page doesn't have
- H2 "Solar panel rate today by brand: LONGi, Jinko…" is answered "Wattlyst does not publish a price per brand"; H2 "Solar plate price in Lahore, Karachi and other cities" is answered "We have no separate city price list". D9's own sources have brand tables. **Fix:** publish dated brand min/max rows, or reword the H2s as honest questions.

#### WL-148 Medium, Likely (P1, engineer): C8 petrol fuel curve probably too low
- The petrol curve in `data/generator-fuel.json` is fitted to two Honda inverter generators from a US dealer site: about 1.84 L/h for a 5 kVA set at 75% load. Open-frame 5–6 kVA spec sheets found on 15 Oct give 2.1–2.5 L/h (one, 2.35 L/h at 80%, is close; others 15–35% higher). The diesel chart is cited from a site that names no original source. Impact: generator running cost may be understated on C8, N7 and the homepage decision. **Fix:** add datasheets for open-frame petrol sets sold in Pakistan (or a conventional/inverter choice), cite the diesel chart's publisher, PEC to confirm.

#### WL-149 Low, Likely (P2): F1 FAQ still names the TV fee
- News reports (June–July 2025) say electricity duty and the PTV fee were removed from bills from July 2025; the engine correctly leaves both out, but the F1 FAQ lists the TV fee as a reason a bill differs. Competitor Toolsfluent still adds both (its 300-unit total Rs 13,772 vs Wattlyst Rs 13,458). **Fix:** drop the TV fee mention; add a sourced FAQ "Why do other calculators show a higher bill?" (needs a primary notification as source).

#### WL-150 Low (P3): false precision on market prices
- D9 "Rs 23,400 to Rs 26,618" for one panel; D14 "Rs 166.67 per watt"; D9 title "Rs 40 to 45.5/W" while the body says "Rs 45.50"; B1 "about 3 h 24 min". **Fix:** a rounding format for market price ranges in `engine/format.js`; keep exact values for tariff arithmetic.

#### WL-151 Low (P3): weak or untidy source lists
- N7: 9 of 31 sources share the label "W11stop (w11stop.com) (price or upkeep data)" with no product or date (`backupSources` in `tools/build.js`). D9, D14 and the tracker cite a direct competitor as price data. B1 and E1 cite only Wattlyst's methodology page. **Fix:** product + date labels; dealer/installer lists over competitor blogs; one primary source each for B1 and E1.

#### WL-152 Low (P3): "net-metering application/paperwork" wording on D8, D12, D13, D14, N3, while D10 and D11 say new users are on net billing. One term site-wide, defined once on D11.

#### WL-153 Low (P3): answers over 60 words (H1 70, N2 71, D14 72, H2 67, F14 66, C1 64, tracker 64, N18 63, N7 62); E1 has no explanatory H2 sections (`content.sections` empty).

### C8. Security, privacy, reliability, test coverage

**Verified OK:** PHP output is escaped (`esc_html`, `esc_attr`, `esc_url`; JSON-LD and the tool config use `wp_json_encode` with `JSON_HEX_TAG`); browser DOM writes use `textContent`, and the two `innerHTML` uses (`drawGrid`, the appliance select copy) take only numbers and server-built markup; the `?load=` reader accepts only known fields and listed options; the lead handler (off by default) has a honeypot, signed time token with `hash_equals`, per-IP hourly limit, sanitised fields, private admin-only post type and retention cleanup; security headers (HSTS, `X-Frame-Options`/`frame-ancestors`, Referrer-Policy, Permissions-Policy) are set; REST users hidden; `xmlrpc.php` 405. Secret scan of the whole git history (AWS, GitHub, OpenAI-style keys, private keys, Slack tokens) found nothing. Live probes: `.git/HEAD`, `.git/config`, `specs/`, `data/`, `generated/`, `tests/`, `dist/`, `PROGRESS.md` all 403; `wattlyst-tools.php` 200 with an empty body (ABSPATH guard). There are no npm dependencies, so `npm audit` has nothing to check. The IndexNow key and Search Console tag are public by design. Calculations run in the browser; the only external call is Open-Meteo on N6, which fails gracefully to the typical day (checked by blocking it). No server-side endpoint does expensive work, so there is no compute-abuse surface.

#### WL-154 Low (P2): privacy policy says Google Analytics 4 is used, but no GA tag is live
- `data/site.json` `analytics.enabled: true` (provider "Google Analytics 4", "Installed through Google Site Kit") makes `/privacy-policy/` print an Analytics section; the live crawl found a GA tag on 0 of 110 pages and no third-party requests. The policy should match what the site does. **Fix:** owner decides: set `analytics.enabled` to false until GA4 is actually installed, or install it (WL-46 was "ignore GA4", so false is the consistent choice).

#### WL-155 Low (P3): test and tool gaps
- `tests/guardrails.test.js` `checkClean` checks NaN, Infinity and blank, but not "negative", which rule 7 also forbids (fields that may be negative, such as a net saving, need an allow-list).
- 17 calculators have fewer than 3 spec cases (e.g. `kva_to_kw`, `va_to_watts`, `ah_to_wh`, `kwh_to_ah`, `kw_to_kva`, `watts_to_va`, `wh_to_ah`, `tco`, `ups_recharge_energy`: 1 each).
- `node tools/maintenance.js` prints "- none" above real stale-data lines (the `stale_data` list is empty while the price-point list is not).

**Server load:** no 5xx in about 200 serial requests; median TTFB about 380 ms (347 ms LiteSpeed hit, 432 ms miss; slowest 2.54 s on a miss); 54 of 110 pages were cache misses at crawl time; `x-hcdn-cache-status: MISS` on all HTML. The WL-75 parallel-load risk (database connection limit after a cache purge) was not re-tested by rule; it remains an owner hPanel item. No capacity claim can be made without a load test.

---

## D. Tool-by-tool audit

Status: **Pass** = formula, page numbers and browser checks all passed; **Partial** = works, with the listed findings; **Fail** = a result or page claim is wrong for the default or a common case. "Browser" covers the checks in C5. SEO/rendering: every page below returns 200, is server-rendered, has one H1, correct canonical, title/meta from the keyword map and valid schema unless noted.

| Tool | URL | Purpose | Maths | Browser / UX | SEO / content | Status |
|---|---|---|---|---|---|---|
| H1 Home Power Planner + Decision Engine | `/` | Size solar/battery/inverter, pick a setup | Matches spec; WL-91, 92, 93–97, 99–101, 103, 105 | WL-89, 90, 133, 136, 137 | WL-101, 116, 143, 153 | **Fail** |
| A1–A3, A5–A8 | `/converters/…` | W↔A↔kW, kVA, volts | Correct (14 scenarios each) | Pass | Pass | Pass |
| A4 | `/converters/230v-watts-to-amps-calculator/` | 230 V W→A | Correct | Pass | WL-123 (cable advice) | Partial |
| A9 | `/converters/va-to-watts-calculator/` | VA→W | Correct | Pass | WL-123 | Partial |
| A10 | `/converters/ah-to-wh-calculator/` | Ah→Wh | Correct | Pass | WL-123 (text, title intent) | Partial |
| B1 | `/battery/battery-backup-time-calculator/` | Runtime | As spec; WL-120 | Pass | WL-150, 151 | Partial |
| B2, B3 | `/battery/12v-…/`, `/battery/200ah-…/` | Runtime | As spec; WL-120 | Pass | — | Partial |
| B4 | `/battery/battery-bank-size-calculator/` | Bank size | As spec; WL-120, 122, 126 | Pass | — | Partial |
| B5 | `/battery/ups-backup-time-calculator/` | UPS runtime | As spec; WL-120 | Pass | WL-123 | Partial |
| C1, C3 | `/generator/generator-size-calculator/`, `…starting-watts…` | Generator kVA | Correct; WL-122, 124 | Pass | — | Partial |
| C2, C4 | `/generator/…wattage…`, `…running-vs-starting…` | Generator watts | Correct; WL-124 | Pass | — | Partial |
| C5 | `/generator/generator-for-well-pump/` | Pump generator | Correct | Pass | WL-119, 123 | **Fail** (text) |
| C6 | `/generator/generator-for-1-5-ton-ac/` | AC generator | Correct | Pass | WL-123 | Partial |
| C7 | `/generator/what-can-a-kva-generator-run/` | Capacity | Correct | Pass | — | Pass |
| C8 | `/generator/generator-fuel-consumption-calculator/` | Fuel | Correct to data | Pass | WL-148 (data) | Partial |
| D1 | `/solar/solar-battery-size-calculator/` | Solar battery | Correct | Pass | — | Pass |
| D2, D7 | `/solar/solar-panel-wattage-calculator/`, `/solar/solar-system-size-calculator/` | kW from kWh | Correct; WL-106 | Pass | — | Partial |
| D3 | `/solar/off-grid-solar-calculator/` | Off-grid | Correct to spec; WL-128, 129 | Pass | — | Partial |
| D4 | `/solar/inverter-size-calculator/` | Inverter | Correct | Pass | — | Pass |
| D5 | `/solar/solar-panels-to-run-ac/` | Solar for AC | Correct; WL-129 | Pass | — | Partial |
| D6 | `/solar/solar-panel-for-12v-battery/` | Panel for battery | Correct; WL-122, 129, 131 | Pass | — | Partial |
| D8 | `/solar/solar-system-for-5-marla-house/` | House preset | WL-92 | Pass | WL-127, 152 | **Fail** |
| D12, D13 | `/solar/solar-system-for-10-marla-house/`, `…1-kanal…` | House presets | WL-92 | Pass | WL-152 | Partial |
| D9 | `/solar/solar-panel-price-pakistan/` | Panel price | Correct | Pass | WL-147, 150, 151 | Partial |
| D10 | `/solar/net-billing-calculator/` | Net billing | Correct | Pass | WL-145 | Partial |
| D14 | `/solar/solar-system-price-pakistan/` | System price | Correct; WL-132 | Pass | WL-145, 150, 151, 152 | Partial |
| D15 | `/solar/tubewell-solar-calculator/` | Pump solar | Correct; WL-122, 129 | Pass | — | Partial |
| D16 | `/solar/charge-controller-size-calculator/` | Controller | Correct; WL-122; no Voc check (WL-24) | Pass | — | Partial |
| E1 | `/load/home-electrical-load-calculator/` | Home load | Correct load; WL-112 (price) | Pass | WL-151, 153 | Partial |
| E2, E3, E6 | `/load/…` | Load, units | Correct | Pass | WL-124 (E6 message) | Pass |
| E4 | `/load/load-before-adding-ac/` | Add-AC check | WL-110 | Pass | — | Partial |
| E5 | `/load/ac-units-calculator/` | AC units | Correct (= D5, N16) | Pass | WL-146 | Partial |
| F1 | `/bill/electricity-bill-calculator-pakistan/` | Bill | Correct | Pass | WL-114, 116, 117, 145, 149 | Partial |
| F2–F11 | `/bill/<disco>-bill-calculator/` | DISCO bills | Correct; WL-109 (F3–F11 print rounding) | Pass | WL-116, 145 | Partial |
| F12 | `/bill/k-electric-bill-calculator/` | KE bill | Correct; WL-109 | Pass | — | Partial |
| W1, W3 | `/wiring/wire-size-for-1-5-ton-ac/`, `/wiring/breaker-size-calculator/` | Wire, breaker | Correct; WL-125 | Pass | — | Pass / Partial |
| W2 | `/wiring/wire-size-calculator/` | Wire size | Correct; WL-121 (DC), WL-125 | Pass | — | Partial |
| W4 | `/wiring/solar-cable-size-calculator/` | Solar cable | Correct | WL-124 (blank current) | WL-123 | Partial |
| W5 | `/wiring/voltage-drop-calculator/` | Voltage drop | Correct | Pass | — | Pass |
| H3–H7 | `/appliances/…` | Appliance pages | Match `appliances.json` | Pass | — | Pass |
| N1 | `/bill/bill-audit-overbilling-checker/` | Overbilling | WL-111 | Pass | WL-114 | Partial |
| N2 | `/troubleshoot/inverter-error-codes/` | Error codes | n/a | Pass | WL-153 | Pass |
| N3 | `/solar/solar-quote-checker/` | Quote check | Correct (= D14) | Pass | WL-152 | Pass |
| N4 | `/bill/sanctioned-load-calculator/` | Sanctioned load | Correct; WL-110 | Pass | — | Partial |
| N5, N8, N9, N10, N12, N14 | `/load/…`, `/solar/…` | Small tools | Correct | Pass | — | Pass |
| N6 | `/solar/solar-forecast-tomorrow/` | Forecast | WL-130 | Pass (live forecast + failure) | — | Partial |
| N7 | `/load/ups-vs-solar-vs-generator-cost/` | Backup cost | WL-95–98, 102, 104 | WL-135, 137 | WL-151 | Partial |
| N11 | `/troubleshoot/battery-series-parallel-calculator/` | Series/parallel | Correct | WL-137 (no voltage warning) | — | Pass |
| N13 | `/solar/solar-for-mosque-and-shop/` | Mosque/shop | WL-92 (+86%) | Pass | — | **Fail** |
| N16 | `/bill/ac-bill-calculator/` | AC bill impact | Correct (= F1 twice, = E5) | WL-137 (no Urdu) | WL-118 | Pass |
| N17 | `/solar/solar-size-from-electricity-bill/` | Seasonal sizing | Correct; WL-106 | WL-135 | — | Partial |
| N18 | `/wiring/home-wiring-load-schedule/` | Circuit sheet | Correct (rows = W2/W1) | WL-135, 137 | WL-123 | Partial |
| Bill Index | `/data/pakistan-electricity-bill-index/` | Data page | 32 cells correct | Pass | WL-115, 116, 141 | Partial |
| Solar Price Tracker | `/data/pakistan-solar-price-tracker/` | Data page | n/a | Pass | WL-141, 151, WL-15 | Partial |

---

## E. Mathematical test report

Independent expected values come from reference code written for this audit (formulas from physics, IEC tables and `specs/formulas.md`; the bill and decision models do not import the engine). "Actual" is the engine. All scripts are in `audit/2026-10-15/` on branch `claude/project-thread-1qfruz`.

| # | Tool | Inputs | Independent expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | F1 bill | 300 units, 1 kW, unprotected, FPA 0 | 9,930 + 350 + 969 + 155.82 = 11,404.82 × 1.18 = 13,457.69 | 13,457.69 | Pass |
| 2 | Bill Index | 300 units, 2 kW, FPA 1.11 | 14,264 | 14,264 | Pass |
| 3 | F5/F10 printed lines | default | lines 9,562 + 1,721 = 11,283 | prints 11,284 | **Fail** (WL-109) |
| 4 | N16 | default | F1(with AC) − F1(without) = 18,130 | 18,130 | Pass |
| 5 | N1 | 210 units, 34 days | overcharge vs protected pro-rated ≈ 4,549 | 930 | **Fail** (WL-111, spec gap) |
| 6 | E1 | default list, 454 units | 401–500 band energy ≈ 17,685 | 16,555 (at 36.46) | **Fail** (WL-112) |
| 7 | E4 vs N4 | two 1.5 t ACs, 4.4 kW | one answer | 5 kW vs 3 kW | **Fail** (WL-110) |
| 8 | A1 | 1,500 W, 230 V, pf 1 (`mode: ac1`) | 1,500 ÷ 230 = 6.522 A | 6.522 A | Pass |
| 9 | A5 | 10 kW, 400 V, `mode: ac3`, pf 0.8 | 10,000 ÷ (√3 × 400 × 0.8) = 18.04 A | 18.04 A | Pass |
| 10 | B3 | 200 Ah, 12 V, 80 W, lead-acid | 200 × 12 × 0.5 × 0.85 = 1,020 Wh ÷ 80 = 12.75 h | 12.75 h | Pass (as spec) |
| 11 | B3 with the site's 30 W UPS idle draw | same | reference model with idle draw: 9.67 h | 12.75 h | **Fail** (WL-120, model gap) |
| 12 | B5 | 150 Ah, 12 V, 10 W | with idle 21.55 h | 76.5 h | **Fail** (WL-120) |
| 13 | W2 DC | 3,000 W, 48 V | 3,000 ÷ (0.9 × 48) = 69.4 A → breaker > 63 A | 62.5 A, 63 A | **Fail** (WL-121) |
| 14 | W1 / W3 / E4 / N18 row | 1.5 t inverter AC (1,900 W design, pf 0.9) | 1,900 ÷ (230 × 0.9) = 9.18 A; same breaker on all four | same on all four | Pass |
| 15 | C1 | 1 hp motor + 2 fans | max(1,160 × 1.25, 2,960) ÷ 0.8 = 3.7 → 5 kVA | 5 kVA | Pass |
| 16 | N7/H1 generator | same load | ≥ 5 kVA (C1 rule) | 2.5 kVA | **Fail** (WL-96) |
| 17 | C5 | 1 hp pump + 4 W | 2,796.4 + 4 > 2,800 → 5 kVA; text says lights fit 3.5 kVA | engine 5 kVA; text wrong | **Fail** (WL-119, text) |
| 18 | D7 | 469 units, Lahore | 469 ÷ 30 ÷ 4.0 = 3.909 kW → 7 panels | 7 | Pass |
| 19 | D8 | default list (15.635 kWh/day) | energy rule: 7 panels | 9 panels | **Fail** (WL-92) |
| 20 | N13 | small mosque | energy rule: 7 panels | 13 | **Fail** (WL-92) |
| 21 | D3 | 6.645 kWh/day, Lahore, January | 1.755 kW × 92.1 ÷ 31 = 5.214 kWh/day (21.5% short) | sized on yearly average | **Fail** (WL-128, spec gap) |
| 22 | N17 vs D7 | Karachi, 330 units × 12 | N17 2.332 kW → 4 panels; D7 2.391 kW → 5 | 4 vs 5 | **Fail** (WL-106, consistency) |
| 23 | D14 vs N3 vs D9 | 5 kW | same range; D9 = panel share | same | Pass |
| 24 | N14 vs D1 | same inputs | same Ah | same | Pass |
| 25 | D5 vs E5 | 1.5 t inverter AC, 8 h | same units | same | Pass |
| 26 | H1 default | defaults | indep. re-implementation: hybrid, −Rs 591,834 net | same | Pass |
| 27 | H1 big home | 3 ACs × 8 h, 4 kW sanctioned | price the billed 3.51 kW (Rs 482,875) | prices 9.36 kW (Rs 1,035,000) | **Fail** (WL-91) |
| 28 | H1 vs D7 | 191 units (3 ACs × 2 h) | same size | 5.85 vs 1.755 kW | **Fail** (WL-92) |
| 29 | H1 24 h cuts | backup 24 h | combo solar saving 0 | Rs 13,331/month | **Fail** (WL-93) |
| 30 | H1 budget | budget = UPS middle 157,369 / −1 | fits / over by Rs 1 | same | Pass |
| 31 | H1 hybrid premium | 2.7 kW | > 0 | Rs 0 | **Fail** (WL-100, data) |
| 32 | N7 vs B5 | 700 W on "1 kVA" UPS | B5: exceeds rating | N7 picks it | **Fail** (WL-97) |
| 33 | Fuzz, all engines | ~113,000 hostile inputs | ok:false with a known code, never NaN/Inf/blank/negative | as expected | Pass |
| 34 | Monotonicity, A/B/C/W | 101,316 pairs | non-decreasing | 0 violations | Pass |

**Regression tests for every confirmed calculation defect** are in the branch folder (section K): `DEFECT DE-01..07, DE-12` (decision), `DEFECT MA-01..16` (converters/battery/generator/wiring), `DEFECT MD-01..09` (solar/prices), `DEFECT MF-01..05` and text cases (bills/load). They fail today and must pass after each fix; they can be moved into `tests/` one by one with their fix (rule 2: the same PR changes `specs/formulas.md` and the tests).

---

## F. Technical SEO and crawl report

**Route inventory (live, 15 Oct 19:07–19:17 UTC, serial):** manifest 110 live pages (77 tool, 11 pillar, 7 trust, 5 guide, 5 appliance, 2 data, 1 home, 1 lookup, 1 embed) = keyword-map 90 + site-pages 20 = sitemap 110 (`/wp-sitemap.xml` → `wp-sitemap-posts-page-1.xml`) = WP REST pages 110. Posts 0, media 0, no attachment pages. No missing routes, no extra WordPress pages, no orphans.

**Status codes and redirects:** 110 of 110 return 200 with no redirect. Single 301s: uppercase → lowercase, missing slash → slash, http → https, `https://www` → apex, `/index.php` → `/`, `/sitemap.xml` → `/wp-sitemap.xml`. `http://www` still takes 2 hops (WL-40, owner). `/sample-page/`, `/hello-world/`, `?p=1`, `?page_id=2`, `/page/2/`, `/2026/`, category/author archives, `?author=1`, post/user/category sitemaps all 404. Real 404 status on random URLs.

**On-page:** exactly one title, meta, canonical (self) and H1 per page; titles 39–60 characters, metas 121–155; no duplicates; all equal the keyword-map/site-pages rows (templated titles equal the rendered manifest title). Robots meta `max-image-preview:large, index, follow, max-snippet:-1` on all; no X-Robots-Tag on pages; no skipped heading levels. H1, answer and main content are in the initial HTML on all 110; tool forms are server-rendered.

**Structured data:** JSON-LD parses on all 110. Organization, Person, BreadcrumbList on all; WebPage 97; WebApplication + Offer 83; FAQPage 92 (questions and answers match visible text exactly on all 92); CollectionPage 11; Article 5; Dataset + DataDownload 2; AboutPage, ContactPage, WebSite 1 each. BreadcrumbList matches the visible breadcrumb on 109 (home: WL-143). `dateModified` matches a visible date on 100 (10 hubs: WL-142). FAQ rich results are now limited by Google to government and health sites, so FAQPage markup is harmless but should not be expected to show.

**Endpoints:** robots.txt (plugin version; disallows `/wp-admin/`, `/?s=`, `/search/`; sitemap line), `/llms.txt` (200, noindex, lists all 110; inherits the WL-145 meta wording), `/ads.txt` 404 (intended while no AdSense id), both `/data/*.csv` 200 `text/csv` noindex, `/embed/a1/` and `/embed/f1/` noindex + canonical to the tool, `?load=` and `?utm_` URLs 200 with clean canonical (except the homepage redirect, WL-89), `/?s=` and `/search/` noindex, feeds 404 (WL-144 note), REST users 404, xmlrpc 405, readme/license 404, plugin `data/` and `generated/` 403.

**Images:** two per page (header and footer logo) with alt, width and height; footer lazy, header eager; OG/Twitter images 200.

**Internal links:** 5,179 links parsed, no nofollow, no links to redirects, 404s or non-canonical URLs. Every page at depth 1 thanks to the home grid; without it, 85 at depth 2, 5 at 3, 3 at 4, 1 at 5 (terms), 1 at 6 (privacy). Fewest in-content linking pages: F9, F11, N6, `/troubleshoot/` (3); `/data/`, Bill Index, Solar Price Tracker (2). No dead ends: every tool, guide, appliance, lookup and data page has a Next step and Related list.

**Near-duplicates:** no pair above 0.5 Jaccard on 5-word shingles of main content (highest F3/F7 0.317, F2/F8 0.268). Word counts: tools/guides/appliances 1,369–3,223; thin hubs 92–280 (WL-142).

**Previously reported, confirmed fixed during this crawl:** WL-32, 37, 38, 41, 42, 44, 62 (REST users incl. `?rest_route=`), 66, 82, 83, 84.

**Indexing:** not checked. No Search Console access; nothing here claims a page is or isn't indexed.

---

## G. Internal-link plan

Rows 20–21 need WL-140 first; the others go into existing `related` arrays in `content/pages/<ID>.json`.

| # | Source | Destination | Suggested anchor | Reason |
|---|---|---|---|---|
| 1 | F1 bill calculator | Bill Index | Pakistan Bill Index for this month | Data page has 2 in-content links |
| 2 | F14 FPA guide | Bill Index | latest FPA in the Bill Index | The FPA figure comes from it |
| 3 | N1 overbilling checker | Bill Index | typical bill for your units | Benchmark for "is my bill too high" |
| 4 | D14 system price | Solar Price Tracker | solar price tracker | Tracker has 2 in-content links |
| 5 | D9 panel price | Solar Price Tracker | panel price history | Same data |
| 6 | N3 quote checker | Solar Price Tracker | current price per watt | Check a quote against dated prices |
| 7 | F1 | F3–F11 | [DISCO] bill calculator | F1 links only F2 and F12 |
| 8 | F2–F12 | FPA guide (F14) | what the FPA line on your bill means | Every bill has an FPA line |
| 9 | F3–F11 | Peak hours guide (F13) | peak hours for [DISCO] | Only F2 links it |
| 10 | H9 inverter vs UPS | N7 | UPS vs solar vs generator cost per hour | The guide compares, N7 prices |
| 11 | B5 UPS backup | N7 | compare UPS, generator and solar backup cost | Next decision after a runtime |
| 12 | C1 generator size | N7 | is a generator cheaper than solar backup? | N7 has 5 links |
| 13 | B3 200 Ah | H8 lithium vs tubular | lithium vs tubular 200Ah battery | Battery choice follows |
| 14 | B1 | H8 | lithium or tubular battery | Same |
| 15 | D1 solar battery | N11 series/parallel | how to wire the batteries | D1 sizes, N11 wires |
| 16 | H5 water motor | D15 tubewell solar | solar for a water pump | Same load |
| 17 | H5 | C3 starting watts | starting watts of a motor on a generator | The page explains surge |
| 18 | N14 autonomy | N6 forecast | tomorrow's solar output forecast | N6 has 3 links |
| 19 | D10 net billing | N6 | how much your panels will make tomorrow | Same audience |
| 20 | D11 guide (in text) | N4 | sanctioned load calculator | Named but not linked |
| 21 | H9 (in text) | B1, D4 | battery backup time calculator; inverter size calculator | Named but not linked |
| 22 | E1 and footer | `/appliances/` (H2) | appliance watts and units | Hub missing from nav |
| 23 | N2 error codes | B5 | check the UPS backup time | N2 has 4 links |
| 24 | `/` decision result | N7 and C1 | compare backup costs in detail; size a generator for motors | Explains WL-102 and WL-96 differences |

---

## H. Performance report

**Environment:** 15 Oct 2026, 18:40–19:50 UTC. Lighthouse 12.8.2 (same as CI), Chromium 141 headless, Playwright 1.56. Mobile = simulated throttling (RTT 150 ms, 1.6 Mbps, 4× CPU); desktop = `--preset=desktop`. Local copy = `tools/wp-test-site.sh` (WordPress 7.1.3 + SQLite, GeneratePress 3.6.1, PHP 8.3 built-in server: no compression, no page cache, so local bytes are uncompressed and local TTFB is meaningless). Live runs went through the session's HTTPS proxy (adds latency), one run per page, serial.

**Lab, local (median of 3):**

| Page | Mobile | LCP ms | FCP ms | SI ms | TBT | CLS | Bytes | Requests | JS bytes | DOM | Desktop | Desktop LCP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 94 | 2,628 | 2,353 | 2,704 | 0 | 0 | 275,496 | 34 | 75,199 | 1,007 | 100 | 573 |
| B1 | 99 | 1,710 | 1,557 | 1,557 | 0 | 0 | 140,712 | 12 | 33,248 | 322 | 100 | 417 |
| E1 | 98 | 1,880 | 1,729 | 2,471 | 0 | 0 | 188,081 | 15 | 53,188 | 436 | 100 | 486 |
| F1 | 99 | 1,655 | 1,561 | 1,561 | 0 | 0 | 157,221 | 12 | 35,478 | 379 | 100 | 419 |
| N7 | 99 | 1,732 | 1,580 | 1,580 | 0 | 0 | 164,003 | 13 | 38,409 | 482 | 100 | 426 |
| N18 | 99 | 1,802 | 1,693 | 1,693 | 0 | 0 | 173,934 | 15 | 44,936 | 523 | 100 | 477 |

Accessibility, Best practices and SEO: 100 on every run, local and live.

**Lab, live (mobile, 1 run):**

| Page | Perf | LCP ms | FCP ms | SI ms | TBT ms | CLS | TTFB ms | Transfer | Requests | JS transfer | DOM |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 95 | 2,232 | 2,198 | 2,558 | 129 | 0 | 114 | 100,539 | 34 (17 real) | 30,994 | 1,007 |
| B1 | 99 | 1,297 | 1,297 | 3,148 | 0 | 0 | 421 | 53,711 | 12 | 13,253 | 322 |
| E1 | 100 | 1,130 | 1,130 | 2,089 | 0 | 0 | 231 | 68,736 | 15 | 20,657 | 436 |

Against the targets (lab only): LCP ≤ 2.5 s met on all live runs (home 2.23 s, close); CLS 0 everywhere; INP cannot be measured in the lab, but click-to-DOM-update latency was median 1–4 ms, max 49 ms with 40 appliance rows, and Event Timing for first clicks 48–88 ms (well under 200 ms).

**Field data:** none available to this audit (no CrUX, no Search Console). The site is two days old; Search Console's Core Web Vitals report will need weeks of Chrome traffic before it shows data.

**Source observations:** render-blocking GeneratePress `main.min.css` (~150 ms); ~15 KB unused inline plugin CSS plus ~15 KB unused theme CSS; no unused JS flagged; real JS chains in WL-136; heap grew 8–25 KB over 50 repeated calculations after GC, DOM nodes and listeners unchanged (no leak). Live network: everything brotli, no duplicate downloads, no third-party requests except Open-Meteo on N6, no fonts, AdSense off, HTML `max-age=604800` (WL-36), versioned assets 7 days (WL-138).

**Infrastructure (observed, not assumed):** LiteSpeed page cache + Hostinger CDN (`x-hcdn-cache-status: MISS` on HTML); median TTFB ~380 ms through the proxy; no 5xx at serial pace. Capacity under parallel load is unknown (WL-75 owner item; no load test by rule).

**Reproduce:** `tools/wp-test-site.sh /tmp/wp 8080`, then `npm install --no-save lighthouse@12.8.2` and `node tools/lighthouse-check.js node_modules/.bin/lighthouse http://127.0.0.1:8080/ …` (CI's own gate); for live, run PageSpeed Insights on https://wattlyst.com/ from a browser.

---

## I. Prioritized remediation roadmap

Effort figures are **estimates** for one focused thread, including spec, tests, build and local WP check. Every calculation change follows rule 2: `specs/formulas.md` + spec cases + tests in the same PR. Items marked [ENG] need the PEC reviewer's decision before or after the change.

### P0: critical (wrong or contradictory recommendations on the flagship and its siblings)

| Task | Findings | Effort (est.) | Depends on | Files / URLs | Acceptance test |
|---|---|---|---|---|---|
| Price and name decision setups on the array net billing accepts (or add a "raise sanctioned load" setup) | WL-91 | 0.5 day | — | `engine/decision.js`, `specs/formulas.md`, spec cases, `/` | `DEFECT DE-01` passes; default `/` result unchanged |
| One sizing rule for grid-tied solar (energy-based, capped at sanctioned load; power rule only off-grid/D5/D15) | WL-92 | 1 day | [ENG] rule choice | `engine/solar.js` `solarSystem`, planner, D8/D12/D13/N13 content, formulas.md D/H1 | `DEFECT MD-01`, `DEFECT DE-02` pass; D8 panels = D7 for the same kWh |

### P1: high (broken homepage features, wrong numbers on tools, missing modelling with real effect)

| Task | Findings | Effort (est.) | Depends on | Files / URLs | Acceptance test |
|---|---|---|---|---|---|
| Stop WordPress redirecting `/?load=` | WL-89 | 1 hour | — | `includes/class-wattlyst-site.php` | `curl -I 'https://wattlyst.com/?load=city:lahore'` → 200; share round trip on `/` |
| Pin homepage grid columns | WL-90 | 1 hour | — | `assets/css/wattlyst-home.css` | Playwright 1366/1920: inputs box unchanged after an error; first click submits |
| Phone list header colour; result-table card layout on all `.wl-rtable` | WL-133, WL-135 | 2–3 hours | CSS budget (move shared rules to `wattlyst.css`) | CSS | Contrast ≥ 4.5:1; no rtable overflow at 390 px |
| Decision engine modelling: solar during cuts, close-call output, generator baseline, surge on standby generator, UPS VA labelling, voltage-matched hybrid rows, missing "not counted" text, hybrid premium data | WL-93–100 | 2–3 days (split in 2 PRs) | [ENG] for WL-93, 98; data refresh for WL-100 | `engine/decision.js`, `engine/backup.js`, `data/backup-prices.json`, `data/component-prices.json`, `content/pages/H1.json`, `N7.json` | `DEFECT DE-03..07` pass; content test for every spec "not counted" item |
| Bill print rounding reconciles | WL-109 | 0.5 day | — | `engine/bill.js`, formulas.md F, spec cases | `DEFECT MF-01`; lines sum = total on 3,003 bills |
| One sanctioned-load rule for E4 and N4 | WL-110 | 0.5 day | owner/[ENG] | `engine/load.js`, `engine/sizing.js`, E4/N4 content | `DEFECT MF-02` |
| N1 fair bill on pro-rated protected slabs | WL-111 | 0.5 day | formulas.md N1 | `engine/bill.js` `bill_audit` | `DEFECT MF-03` |
| E1 price via slab bill | WL-112 | 2 hours | — | `engine/load.js`, `E1.json` | `DEFECT MF-04` |
| Battery idle draw | WL-120 | 0.5 day | [ENG] default | `engine/battery.js`, B1–B5 content | `DEFECT MA-02` |
| DC feed efficiency + DC fuse sizes | WL-121 | 0.5 day | [ENG] | `engine/wiring.js`, `data/cable-ampacity.json` | `DEFECT MA-03` |
| Wrong page claims: C5 headroom, D8 "5 kW enough" | WL-119, WL-127 | 2 hours | — | `C5.json`, `D8.json`, number-words test | `DEFECT MA-01`, `DEFECT MD-02` |
| Off-grid worst-month sizing or shortfall notice | WL-128 | 0.5 day | [ENG] | `engine/solar.js`, D3 | `DEFECT MD-04` |
| Petrol fuel curve and diesel chart source | WL-148 | 0.5 day research + data | [ENG] | `data/generator-fuel.json` | Dated datasheets for 2+ open-frame sets sold in PK; spec cases updated |

### P2: medium (consistency, content, links, accessibility, performance)

| Task | Findings | Effort (est.) | Files | Acceptance test |
|---|---|---|---|---|
| Small decision/consistency items | WL-101–104, 106, 108 | 1 day | decision/backup/solar, content, tests | `DEFECT DE-12`; browser-copy test over many inputs in the suite |
| Bill text and data consistency (FPA wording, KE FPA, 300-unit basis, 700 cliff, FPA bounds, N16 warning, wording errors, TV fee) | WL-114–118, 149 | 1 day | content JSON, `data/bill-index.json`, `tools/build.js` | Every 300-unit figure states kW and FPA basis; content tests |
| Engine edge/text leftovers | WL-122–125, 129–131 | 1 day | engine, content | `DEFECT MA-04..12, 14, 16`, `DEFECT MD-05..07, 09` pass |
| Link tokens in page text + link plan | WL-140, 141 | 1 day | `class-wattlyst-render.php`, `tools/build.js`, content `related` | Token test; data pages ≥ 6 in-content linking pages |
| Hub content and dates | WL-142 | 1 day | `content/pages/P-*.json` | Each hub ≥ 300 words with answer, visible date |
| Meta descriptions, E5 range, D9 headings | WL-145–147 | 0.5 day | `specs/keyword-map.csv`, content | SEO lint green; metas match tool behaviour |
| Focus ring contrast | WL-134 | 1 hour | `wattlyst.css` | 3:1 focus indicator on all controls |
| Homepage speed headroom + whole-chain JS budget test | WL-136 | 1 day | homepage CSS/JS, `tests/site.test.js` | Lighthouse mobile median ≥ 97 locally; budget test counts nested imports |
| Calculate button position on phones | WL-139 | 0.5 day | templates/CSS | Calculate within 1.5 viewports at 390 px, or a sticky Calculate |
| Privacy policy analytics flag | WL-154 | 10 min (owner decision) | `data/site.json` | Policy matches live third-party requests |

### P3: low (polish, optional)

| Task | Findings | Effort (est.) | Acceptance test |
|---|---|---|---|
| Decision budget low-end, dead branch | WL-105 | 2 hours | spec case at Rs 500k budget |
| Rule-3 cleanup of messages and duplicate constants | WL-107 | 0.5 day | No unit number typed in `messages.js` |
| Engine edge cases, `protected_check` comma input | WL-113, 126 | 1 hour | `DEFECT MF-05`, `MA-13`, `MA-15` |
| Price extrapolation notice | WL-132 | 1 hour | Notice outside listed sizes |
| UI polish list | WL-137 | 0.5 day | axe 0 violations; Escape closes menu |
| Immutable cache for versioned assets | WL-138 | owner/hPanel or `.htaccess` | `cache-control: max-age=31536000, immutable` on `dist/*.js?ver=` |
| Schema and nav hygiene | WL-143, 144 | 2 hours | No BreadcrumbList on home; `aria-current` exact only |
| Content polish (precision, sources, net billing term, answer length, E1 sections) | WL-150–153 | 1 day | Content checklist |
| Test gaps and upkeep report formatting | WL-155 | 2 hours | Guardrail checks negatives with an allow-list |

**Owner and engineer items carried forward (not new):** WL-15 stale price points (25 of 38), WL-14 tariff questions, WL-24 PEC items, WL-36 HTML TTL, WL-40 `http://www` two hops, WL-75 database limit and LiteSpeed crawler, WL-88 "Reviewed" byline vs "review in progress" wording, AdSense/consent/brand profiles from the upkeep report.

---

## J. Search results and competitor validation

Searches on 15 Oct 2026 with a US-based search tool (about 9 links per query, not Google Pakistan). Lists are what the tool returned, not ranked positions. No search volumes, difficulty or Wattlyst rankings were estimated.

| Keyword | Seen in results | Competitor features | Wattlyst gap | Wattlyst advantage | Realism |
|---|---|---|---|---|---|
| electricity bill calculator pakistan | toolsfluent, propakistani, aaj, dailycapital | DISCO selector, filer status (s.235), slab warning | No filer toggle; FPA blank by default | NEPRA source, engine tables, removed duty/PTV correctly omitted, Urdu, named author | Realistic |
| lesco bill calculator | 9 of 9 spam pages on hacked subdomains | none | — | Any real tool wins; deep-link the official bill check | Realistic |
| k electric bill calculator | hackmd page, toolsfluent, generic tools | ToU mode, filer option | No ToU/filer on F12 | Same as F1 | Realistic |
| 10kw solar system price pakistan | toolsfluent, propakistani, ferozepower, aaj | Single ranges | No per-part breakdown | Size table, payback, dated sources, CSV tracker | Medium |
| solar panel price in pakistan | phoneworld, ary, thenews, nukta, icons | Brand tables, city ranges | WL-147 | Dated sources, calculator, tracker | Hard (news sites) |
| net billing / net metering calculator | toolsfluent (Rs 11), profit, aaj, tribune | Regime switch, filer | — | Rs 8.13 from NEPRA's own decision; old vs new side by side | Realistic |
| battery backup time calculator | genus blog, copies | Basic formula | WL-120 idle draw | DoD, chemistry, PK examples | Realistic |
| watts to amps calculator | viox, copies | DC/1-phase/3-phase | — | Same + table | Slow global head term |
| wire size calculator pakistan | US code tables, AWG tools | US sizes | — | Only tool with PK sizes (7/29, 3/29) | Realistic |
| generator size calculator | US stores and blogs | US whole-house sizes | WL-96 on N7 | PK appliance list | Realistic |
| ups vs solar vs generator | vendor blog, analysis, papers | Prose only | WL-102 | Only calculator | Realistic |
| solar system for 5 marla house | 10 of 10 property listings | — | — | Only info page | Mostly property intent |
| inverter error codes (+ inverex nitrox) | AU blog, parasite PDFs, OLX | Single-brand lists | — | Multi-brand lookup incl. Nitrox | Strong opening |
| 1.5 ton inverter ac units per hour | retailer blogs | 1.2–1.5 units/h | WL-146 | Calculator + N16 | Retailer blogs |
| solar size from electricity bill | toolsfluent, dailycapital | Bill amount in rupees as input | No rupees → units path | 12-month sizing | Realistic |
| ac bill calculator pakistan | toolsfluent, retailers | Flat per-unit cost | — | Slab jump and lost protection | Realistic |
| 5 kva generator fuel per hour | Indian tool, spec sheets | 2.1–2.5 L/h | WL-148 | PKR cost vs grid | Realistic |
| units from bill amount | rate tables only | — | No reverse tool | Engine can do it | Opening |

**Missing features worth building (clear user benefit; owner decides):**
1. Bill amount → units (reverse bill). No tool appears for that search; it also feeds N17, D7 and the planner.
2. Income tax (s.235) filer/non-filer option on the bill tools, for bills where people compare against a real bill above the threshold (needs a dated, sourced rate in `data/`).
3. Official online bill-check deep links on each DISCO page (URLs to verify first).
4. ToU path for 5 kW and above on F1/F12 (today `tou_required_at_5kw` errors; at least link the ToU tool).
5. Brand price rows on D9 and the tracker from the dated sources already collected (WL-147).

One search result mentioned a Punjab 300-unit provincial relief scheme (FY 2026-27) that could affect Punjab DISCO bills; not verified, worth an owner look.

---

## K. Test automation and regression coverage

**Existing coverage (strong):** 728 tests: 407 spec cases for 66 calculators, guardrail fuzz on every calculator, message coverage, keyword-map SEO lint, build freshness, typed-digit check, schema, trust pages, images, JS size, content checklist and link graph, ad/lead/affiliate rules, WordPress plumbing, deploy (versioned imports, preload chain, SHA-pinned CI), number words, live "how" text, price monotonicity and freshness, one FPA source, inlined CSS budget. CI adds a browser smoke test on every live page and Lighthouse on 6 URLs.

**Gaps found by this audit:**
- Spec cases are author-written expected values; no independent reference model exists in the suite (the audit's `indep.mjs` files fill this).
- No cross-tool consistency tests (H1 vs D7, N7 vs C1/B5, E4 vs N4, N17 vs D7).
- Page-text claims typed by hand ("Yes", "five kW", "a few lights") are not checked against the engine.
- Guardrail does not check "negative"; 17 calculators have fewer than 3 cases (WL-155).
- Browser data-copy test uses default inputs only (WL-108).
- JS budget test ignores nested imports (known to-do).
- No browser test for share round trip on `/`, or layout stability after an error at desktop width (WL-89, WL-90 would have been caught).
- No phone-width overflow check on `.wl-rtable` (WL-135).

**Audit regression tests (branch `claude/project-thread-1qfruz`, folder `audit/2026-10-15/`, not merged):**

| File | Passing (correct behaviour) | Failing on purpose (one per defect) |
|---|---|---|
| `decision/decision.test.mjs` | 6 (independent = engine on 34 scenarios; table = text; budget threshold; browser copy over many inputs; cross-tool agreements; N7 guard) | 8: DE-01..07, DE-12 |
| `mathA/audit-math-a.test.js` | 18 | 16: MA-01..16 |
| `mathD/verify.test.mjs` / `defects.test.mjs` | 27 | 9: MD-01..09 |
| `mathF/verify.test.mjs` / `defects.test.mjs` | 14 | 8: MF-01..05 and text cases |

Run: `node --test audit/2026-10-15/<group>/<file>`. The folder is outside `tests/`, so `npm test` stays green (728/728). Supporting scripts (`indep.mjs`, `ref.mjs`, fuzz and scenario scripts) are next to the tests. The folder is not blocked by `.htaccess`, which is one more reason not to merge it as is: move each test into `tests/` with its fix.

**Recommended additions (in order of value):** cross-tool contradiction tests (one per pair above); the independent bill/decision models as reference tests; page-claim tests that render each typed claim from an engine example; Playwright checks in `tools/browser-check.js` for share round trip on every page with a form, layout stability after an error at 1366 px, and rtable overflow at 390 px; whole-chain JS budget.

---

## L. Regression prevention checklist (every release)

**Mathematical correctness**
- [ ] `npm test` green; `node tools/build.js --check` clean.
- [ ] Every changed formula: `specs/formulas.md` + spec cases + tests in the same PR; no test loosened.
- [ ] Minimum sizes use `up*` formats; printed lines reconcile with printed totals.
- [ ] No typed number or yes/no claim in page text that the engine does not produce (number words checked below twenty too).

**Decision consistency**
- [ ] Cross-tool tests green: homepage vs D7/N17 solar size, homepage/N7 generator vs C1, N7 UPS vs B5, E4 vs N4, N16 vs F1 twice.
- [ ] Price and benefit in the decision engine rest on the same array.
- [ ] Every spec "not counted (the page says so)" item appears on the page.
- [ ] Close calls are labelled; budget and fallback text matches the rule.

**Functional behaviour**
- [ ] CI browser check green (no JS errors, no duplicate scripts, no NaN/blank).
- [ ] Share link round trip on `/` and on one page per hub returns the same result (`curl -I '/?load=…'` is 200).
- [ ] Invalid input on the homepage at 1366 px: layout stays, first click submits, focus moves.

**Mobile rendering**
- [ ] No page or `.wl-rtable` overflow at 360 and 390 px; list headings visible; touch targets ≥ 24 px (44 px goal).

**Technical SEO**
- [ ] keyword-map lint green; sitemap = manifest; canonicals self; no new noindex; FAQ schema = visible text; one H1.
- [ ] New pages linked from at least two related pages and their hub.

**Accessibility**
- [ ] axe 0 violations on home, one tool per hub, N7, N18; focus indicator ≥ 3:1; errors `role=alert`, notices `role=status`.

**Performance**
- [ ] Lighthouse mobile ≥ 95 on CI URLs (aim ≥ 97 on `/`); JS budget counts the whole import chain; CLS 0.

**Security and privacy**
- [ ] No `innerHTML` with user input; PHP output escaped; privacy policy matches live third-party requests and `data/site.json` flags.
- [ ] No secrets in commits; `.htaccess` still blocks repo internals.

**Build and deployment**
- [ ] Local WP check (`tools/wp-test-site.sh`) before merge; PROGRESS.md handoff updated; project-files copies of `specs/` and `data/` synced (rule 9).
- [ ] After deploy: spot-check `/` and two tools live; watch for 5xx after the cache purge (WL-75).

---

## M. Completed, pending and blocked checks

**Completed:** route inventory and live crawl (all 110 URLs + endpoints); independent maths for every engine; decision engine re-implementation and 34 scenarios; cross-tool matrix; browser QA on 86 pages; 16 pages × 6 viewports; axe on 36 runs; keyboard checks; Lighthouse local (6 pages × mobile/desktop × 3) and live (3 pages); interaction latency and memory; security code review, secret scan and folder probes; content review of 23 pages; 24 searches.

**Not done or blocked:** real-user Core Web Vitals and Search Console (no access); Safari, Firefox, real devices, screen readers; print rendering (only the `window.print` call checked); quote form POST (forbidden); primary-source re-check of NEPRA figures and market prices; parallel-load behaviour (no load test by rule); hPanel logs and settings.

Evidence locations: audit scripts and tests on the branch (`audit/2026-10-15/`); crawl raw data, URL table (`urls.csv`), screenshots and Lighthouse JSON in this session's scratch folder (not kept after the session ends; re-run the scripts to regenerate).
