# Progress

## Handoff for next phase (after 21 Oct audit fix Phase 9b: ToU on the bill pages) — written by the audit Phase 9 thread, 2026-10-21

Owner said yes (21 Oct 2026) to the same ToU path on the remaining bill pages. Plugin v0.8.32. No page stops at 5 kW any more. The Phase 9 note below still holds for H1, D10 and D11.

**What is where**
- `touTotal()` in `engine/bill.js`: `bill_total` hands a sanctioned load at or above the threshold to it (peak units, blank = default share from `data/defaults.json` `tou_peak_share`; optional MDI; then `bill_tou`). Output flag `tou_bill_estimate` (notice), `fixed_basis` (engine text for the fixed-charge line, flat and ToU). Rule: `specs/formulas.md` section F "ToU path" bullet, part "Bill pages"; spec cases tagged "Phase 9b".
- Fields `peak_units` and `mdi_kw` (advanced) on F1-F12 and F14; their Sanctioned load hints point to the peak units and link F13. Every F how text prints `{{out.energy_calc}}` and `{{out.fixed_basis}}`.
- E1 (`home_load_bill`) and N16 (`ac_bill_impact`) in `engine/acbill.js`: ToU with the default share (flag `tou_share_estimate`, no peak field), E1 how prints `bill_calc`, N16 how prints `before_tariff`/`after_tariff`.
- Notice texts `tou_bill_estimate`, `tou_share_estimate` in `engine/message-text.js`; flags in `NOTICES`.
- Tests: `tests/tou-path.test.js` (last test), `tests/bill-engine.test.js` WL-162 test now checks every page gives a ToU result at 5 kW.

**Do not touch / watch**
- `tou_required_at_5kw` now only lives in `bill_energy` (`flatSanctioned`); no page reaches it. Keep it as the guard for the flat energy charge.
- N16 defaults to Protected ticked: at 5 kW the user gets `protected_at_tou` until they untick it (by design: a ToU connection is never protected).
- The "Bill result legal disclaimer" thread was editing bill result areas and Terms at the same time; this phase changed only bill fields, hints and how text.

**Open to-dos**
- [ENGINEER] confirm `tou_peak_share` (same item as Phase 9).
- A comparison "this month on a 5 kW ToU meter" for heavy flat users (bills expert F-6) is still not built.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 9: ToU bill path for 5 kW and above) — written by the audit Phase 9 thread, 2026-10-21

Owner: every fix phase runs in its own new thread, only after the owner says to start it. All rows of `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/status.md` are now ticked (Phases 1 to 8 and row 9). Open owner decision: WL-199 (Calculators menu, mockups in `mockups/calculators-nav/`). Plugin v0.8.31. Phase 9 changed one engine area (ToU path in the planner and net billing), one data default, three pages' fields and text.

**What is where**
- Default peak share: `data/defaults.json` `tou_peak_share` with its reasoning in `tou_peak_share_source` (a Wattlyst estimate, in `_meta.engineer_confirm`). Rule: `specs/formulas.md` section F bullet "ToU path at 5 kW and above"; spec cases tagged "Phase 9" in `specs/calculator-test-cases.json`.
- Planner + decision engine (H1): `home_plan` bill step and `wholeBill()` in `engine/planner.js` (every whole bill, also `netSaving` for the four setups, goes through it; flat slab bill below the threshold, `bill_tou` at or above). Optional input `peak_share` (advanced field in `content/pages/H1.json`); outputs `tou`, `peak_share`, `tou_estimate` (notice flag), `tariff_text` (engine-built phrase used in the H1 how text and how_ur). H1 FAQ "Does the planner work for a sanctioned load of 5 kW or more?".
- Net billing (D10, D11): ToU branch of `net_billing` in `engine/bill.js`; optional input `peak_units` (field on both pages); outputs `tou`, `peak_units`, `tou_peak_estimate` (notice flag), `import_calc`, `nm_calc` (engine-built sums; both pages' how text now prints these for flat and ToU alike); error `protected_at_tou`. D10 has a ToU worked example.
- Notice/error texts: `engine/message-text.js` (`tou_estimate`, `tou_peak_estimate`, `protected_at_tou`); flags in `NOTICES` in `engine/messages.js` (placed before `low_confidence`, so the ToU notice wins on H1).
- Tests: `tests/tou-path.test.js`.

**Do not touch / watch**
- The flat bill pages (F1 to F12, F14), E1 and N16 still stop at 5 kW with `tou_required_at_5kw` (link to F13 under Sanctioned load); only H1, D10, D11 got the ToU path. Do not remove that error from `flatSanctioned()`.
- The peak share must stay at most 1 minus the day share (evening peak vs daylight use); the planner caps a blank share and errors on an entered one.
- The homepage JS chain grew by about 2 KB raw in this phase; it is still under the 72 KB raw / 30 KB gzip test, but plan bytes before adding more to `planner.js`, `bill.js` or `decision.js`.

**Open to-dos**
- [ENGINEER] confirm the default peak share and the off-peak-only netting of exports under old ToU net metering (formulas.md open question (10)); a real ToU bill (peak/off-peak units) or PRECON smart-meter data would replace the estimate.
- The ToU fixed charge uses the minimum basis (half the sanctioned load, MDI blank) on H1; an MDI input could be added later. Engineer Reviewer PASS (2026-10-21); its non-blocking notes: only one notice shows at a time, so `solar_above_sanctioned` or a size notice can hide `tou_estimate` (the estimate still shows in the how text and hint); the ToU peak hours in `data/tariff-pk-2026.json` are from 2023 and unverified.
- A ToU mode on the flat bill pages and N4/N16 comparison "this month on a 5 kW ToU meter" (bills expert F-6) is not built; owner's call.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 8: trust and AdSense readiness) — written by the audit Phase 8 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 to 8 ticked). All eight audit phases are done. Next is row 9 of status.md (**H1/D10 ToU path for 5 kW and above**, WL-162 c), only with the owner's yes; WL-199 (Calculators menu) still waits for the owner's decision on the mockups. Plugin v0.8.30. Phase 8 changed one bill rule (FPA units), bill data, appliance and error-code data, trust pages, the author bio and the ads gate.

**What is where**
- WL-243/244 bills: protected FC surcharge default in `data/tariff-pk-2026.json` `addons_secondary.fc_surcharge_per_unit.by_category` (source: the owner's itemised LESCO protected bill; name and address never stored). FPA-month units: input `fpa_units` in `addOns()` (`engine/bill.js`), rule in `specs/formulas.md` section F bullet "FPA units", spec cases at the end of `specs/calculator-test-cases.json`; the optional box is in the `fields` of `content/pages/F1.json` to `F14.json` (F14 explains it in its text). N16 and the planner pass no `fpa_units`, so they use the month's own units.
- WL-217/240 ads gate: `adsConfig()` in `tools/lib/monetize.js` (fails without `consent.cmp` when ads are enabled; every page whose content has `live` must be in `data/site.json` `ads.no_ads_pages`); the manifest ads block carries `no_ads_pages` and `cmp`, read by `Wattlyst_Ads::active()` (`includes/class-wattlyst-ads.php`). N6 credit: content key `credit` in `content/pages/N6.json`, `creditOf()` in `tools/build.js`, printed by `credit()` in `includes/class-wattlyst-render.php` under the result. AdSense account meta tag: `verification()` in `includes/class-wattlyst-head.php` (front page, when `adsense_pub_id` is set).
- WL-215 bio: `data/site.json` `people[0]` (`short_bio`, `bio`, `knows_about`, `credential`, `home_location`, `bio_source`); About people block in `renderTrust` (`tools/build.js`), Person schema in `person()`, author box in `author_box()` in the render (`short_bio`). Facts are the owner's own words of 21 Oct 2026; change only with the owner.
- WL-219: `data/site.json` `operator` (name, country); privacy policy section "Who runs this site" and Terms "Governing law" in `content/trust/`. DISCO pages F2 to F13 carry a one-sentence income-tax FAQ linking F1; F1 and F14 keep the full text.
- WL-216: every `causes`/`action` in `data/inverter-codes.json` is our own summary (no manual quotes; `_meta.notes` says so); DC safety sentences kept. N2 text says rows are summaries.
- WL-218: `data/appliances.json` inverter AC rows cite Haier Pakistan product pages (starting watts = the maker's maximum cooling input), TVs Samsung Pakistan, LED bulb Philips Pakistan; ceiling fans (AC and DC), pedestal DC fan and chest freezer are now "Wattlyst estimate, engineer to confirm" (no maker source was reachable).
- Tests: `tests/trust-adsense.test.js`.

**Do not touch / watch**
- Never enable ads without `consent.cmp`; never take N6 off `no_ads_pages` unless the owner buys the Open-Meteo commercial plan.
- Never add a bio fact the owner did not give (he is not a licensed electrician; the bio says so).
- Error-code rows: write any new code in our own words with the manual linked; no quoted manual text (test).

**Open to-dos**
- AdSense owner steps (OW-1, OW-2): Search Console indexing first; then set `adsense_pub_id` with `enabled` false (meta tag + ads.txt prove ownership), apply, install a Google-certified CMP and set `consent.cmp`, then slots and `enabled` true.
- The 1.5 ton inverter AC row still cites Gree's figures through a retailer page (Japan Electronics); gree.com.pk was unreachable from here: swap to a maker page when reachable.
- Fans and chest freezer need a maker datasheet, NEECA label or a Wattlyst meter reading (owner can photograph nameplates).
- Lifeline GST default (WL-241) still [VERIFY]: needs a real lifeline bill.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 7: technical SEO plumbing) — written by the audit Phase 7 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 to 7 ticked). Next is **Phase 8 (trust + AdSense readiness)**: read README, then only `phase-8-trust-adsense.md` and its rows in `audit/fix-list-2026-10-21.md`. After Phase 8 comes row 9 of status.md (H1/D10 ToU path), also only with the owner's yes. Plugin v0.8.29. Phase 7 changed PHP plumbing, the build, the upkeep report, content anchors and source URLs; no engine formula or figure moved.

**What is where**
- WL-208 lowercase redirect: `gate()` in `includes/class-wattlyst-site.php` (absolute URL via `home_url( user_trailingslashit() )`, query kept). The http://www two-hop is a Hostinger hPanel rule, not the plugin (owner item, unchanged).
- WL-209 entities: `person()` + `personUrl()` in `tools/build.js` (Person `url` = About entry); the About people block (`'people'` in `renderTrust` blocks) prints `<li id="<person id>">`. Organization `areaServed`/`knowsLanguage` read `area_served`/`languages` in `data/site.json`.
- WL-210 error-code headings: data `heading` per brand in `data/inverter-codes.json`; `codeTables()` builds the short caption and the `note` (name + models); `ref_table()` prints any table `note` under the H2 (`aria-describedby`).
- WL-211 anchors: optional content key `anchor` in `content/pages/<ID>.json` (29 much-linked pages have one); the build checks it differs from the H1 and puts it in the manifest row; `related()` uses it at the bottom (`link_to( $r, true )`), the Next step box under the result keeps the H1. Test counts inbound anchors per page.
- WL-212 outbound links: `outboundLinks()`, `linkFlags()`, `checkLinks()` in `tools/maintenance.js`; every report lists http links and hosts in `data/maintenance.json` `link_watch_hosts`; `node tools/maintenance.js --links` runs the quarterly network pass (one request a second, redirects not followed). The 21 Oct pass replaced every plain redirect with its final address in content/ and data/.
- WL-213: `queue_warm()` in `includes/class-wattlyst-pages.php`, deactivation in `wattlyst-tools.php` and `uninstall.php` use `wp_unschedule_hook` (clears the batches that carry an argument).
- Tests: `tests/technical-seo.test.js`.

**Do not touch / watch**
- A new much-linked page: give it an `anchor` if the WL-211 test fails; never set an anchor equal to the H1.
- `checkLinks` must not follow redirects (it reports the new address); keep the one-second delay.
- The LinkedIn URL in `data/site.json` lost its trailing slash (final address); keep it in sync if the owner edits it.

**Open to-dos (from the 21 Oct link pass, need a Pakistani connection or the owner)**
- "Check by hand": w11stop.com (403 bot wall, many price sources), powerhouseexpress.com.pk and surmawala.pk (429), profit.pakistantoday.com.pk, exideindustries.com, business-standard (403), lesco/gepco/hesco sites and two bill.pitc.com.pk pages (timeouts), several 503s (bill.pitc.com.pk, fesco, mepco, vt.edu extension page, Yamaha datasheets, Huawei manual PDF): likely blocking this egress, re-run `--links` from Pakistan.
- Not replaced on purpose: the toolsfluent.com blog source now redirects to a tracker tool page (different content; competitor source already open), myadcenter.google.com (Google's own wording in the privacy policy).
- One dead charger source (jsbl.com) was dropped from data/backup-prices.json; the 2.4 kVA UPS charger figure now rests on one listing (still marked engineer to confirm).
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 6: phone layout and navigation) — written by the audit Phase 6 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 to 6 ticked). Next is **Phase 7 (technical SEO)**: read README, then only `phase-7-technical-seo.md` and its rows in `audit/fix-list-2026-10-21.md`. Plugin v0.8.28. Phase 6 changed layout only (render PHP, CSS, two small browser files, table row labels in content); no engine formula or data value moved. WL-199 (Calculators menu) was not built: it still waits for the owner's yes on the mockups.

**What is where**
- WL-198 Next step under the result: `next_inline()` in `includes/class-wattlyst-render.php` (the page's `next` + first two `related`, live rows only via `live_row()`); printed by `tool()` after the share bar, and by `lookup()`. Not on the home planner or in an embed. Styles `.wl-next-inline` in `assets/css/wattlyst.css`. The full Related list (`related()`) stays at the bottom.
- WL-238 embeds: `tool()` prints the result block before the inputs when `$this->embed` (set in `embed_html()`). Iframe heights in `data/site.json` `embed` (list calculators get the taller one; `r.hasList` set in `tools/build.js`, read by `embedList` in `tools/lib/datasets.js`). The embed page lists the script code first (`embeds()`); text in `content/pages/embed.json`.
- WL-202 error codes: `lookup()` has a `data-wl-count` status (count + jump link), filled by `assets/js/wattlyst-page.js`; brand tables are printed stacked (`ref_table(..., true)`: `data-l` on cells, section class `wl-stack`, phone card CSS in the max-width 768 block).
- WL-204 list calculators: tool pages with an appliance list call `tool( true )`; on those the form gets class `wl-tool-list` (home keeps `wl-tool-split`). Two-column CSS at 1100 px and wider; the result column is sticky only on tall screens (min-height query), because a sticky column taller than the screen would hide its share bar and Next step. `.wl-out-title` style moved from the home CSS to the main CSS.
- WL-200 hubs: `groups()` + `children()` in the render; a hub section that links the hub's pages becomes a task group (its H2, its text, then its cards); pages no section links go under one "More ..." heading; `sections( false, true )` skips the grouped sections. Hub routing text is in `content/pages/P-*.json` sections, so moving a link there moves the card.
- WL-239 row labels: content `table.row_head` + a `label` per row (C1 to C4, D4, E2); `tools/build.js` puts them in the first column and sets `row_head`, the render prints `<th scope="row">`. Labels are page text (typed-number tests read them).
- WL-205: home counts by page type (`kinds()`, `tools_label()`, `count_label()` in the render: calculators, guides, datasets); picker groups one per category (`catalog_groups()`); 404 heading CSS (`body.error404 .entry-title`); footer links and checkboxes at touch size; table scroll cue (edge shadow on `.wl-table-wrap`) and tighter cells at 400 px; units never break from figures in reference tables (`ref_table`); A1/A2 short supply option labels; C1 per-row label "Starting watts"; BROWSE BY TASK colour in the home CSS.
- Tests: `tests/phone-layout.test.js`. CI browser check (`tools/browser-check.js`) now fails a tool page whose Next step is missing or far below the result at phone width, and an embed that prints the inputs above the result.

**Do not touch / watch**
- Home CSS has about 650 bytes left; main CSS about 4.5 KB under its limit. No browser JS was added to the homepage chain.
- Do not make the list-calculator result column sticky on short screens again (see above).
- A section link in a hub's content now decides which card group a page sits in; check the hub page after editing hub text.

**Open to-dos**
- WL-199 Calculators menu and /calculators/ page: owner decision on the mockups (`mockups/calculators-nav/`). The home chip strip on phones (2 of 11 visible) belongs to it.
- Long appliance names (data/appliances.json) are cut in the phone picker; shorter display names would be a data change.
- Reference tables on bill pages still scroll sideways on a phone (now with an edge shadow as the cue); a card layout like the error codes is possible later.
- Error-code table headings are very long (WL-210, Phase 7).
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 5: page text) — written by the audit Phase 5 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 to 5 ticked). Next is **Phase 6 (phone layout)**: read README, then only `phase-6-phone-layout.md` and its rows in `audit/fix-list-2026-10-21.md`. Plugin v0.8.27. Phase 5 changed page text, metas and two build helpers only; no engine formula moved. The text formats live in `specs/formulas.md` bullet "Market prices and rough times".

**What is where**
- Build-only text formats: `engine/approx.js` (`marketRs` = `rsm`, `lakhRs` = `lakh`, `roughHours` = `hm5`, now rounded down to the half hour, WL-183/190); registered in `tools/build.js` `APPROX`/`APPROX_RE`. Never in live how text or result captions (the build fails).
- Month length in text: pages print the engine's `out.days` / `d.days_per_month` with two decimals; only N1 (typed reading cycle), N8 (one charge a day), N12 and N14 print whole days (WL-184; test lists them).
- Home answer and saving labels: `content/pages/H1.json` (answer names the recommended setup's saving; `decision_saving_rs` and `full_saving_rs` labels say which setup and whether cuts are counted, WL-185).
- Sources: every live tool, guide, hub and data page has at least one outside source (test in `tests/page-text.test.js`, WL-234). Datasheet figures quoted in H8 are listed in its `literal_numbers` (WL-233).
- Titles and metas: `specs/keyword-map.csv` (D14 lakh title, H1 home title, F13, D16, N1, E3, E4, A10, N2) and `specs/site-pages.csv` (tracker title from `ds.month`, built in `tools/lib/datasets.js` `solarTracker`). Bill Index FAQ date is `ds.checked` from `billIndex` (WL-193).
- llms.txt: `llmsTxt` in `tools/build.js` appends each page's built answer after its meta (WL-195).
- Installer term: "AEDB-certified installer" everywhere, defined once on D11 (WL-196). Error-code DC safety line lives in `data/inverter-codes.json` actions (WL-236).
- Tests: `tests/page-text.test.js` (one test per row group).

**Do not touch / watch**
- Never type a datasheet number into page text without listing the exact phrase in that page's `literal_numbers`, and keep it word for word with the cited source.
- Answers on the long pages must stay within the word limit (`seo-content.test.js` WL-153); the home answer is at the limit.
- Titles with a placeholder are length-checked on the rendered text; a larger price can push the D14 title over the limit.

**Open to-dos**
- H8 still uses the default lithium depth of discharge for backup while the guide now says daily use deeper than the datasheet's rated point shortens life; whether the default should move is an [ENGINEER] call (data, not text).
- Tubular cycle figures: only Exide's inverter-battery page is cited; other makers differ.
- The F13 schedule is still the 2023 IESCO one; when a 2026 DISCO schedule is sourced, update the data and drop the determination year from the F13 H1.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 4: solar, battery and wiring engine) — written by the audit Phase 4 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 to 4 ticked). Next is **Phase 5 (page text)**: read README, then only `phase-5-page-text.md` and its rows in `audit/fix-list-2026-10-21.md`. Plugin v0.8.26. Every rule of this phase lives only in `specs/formulas.md` (bullets "Inverter: on-grid or load-carrying", "Panel voltages", "Hybrid inverter starting string", "Solar pump string and drive", "Hybrid quote with its battery", "Solar PV cable", "Battery current and C-rate", W "Design current", E "Home load", C "Water motor 1 hp") and in the spec cases noted "21 Oct 2026 audit Phase 4". Phase 4 was done in one thread as two commits groups (4a solar, 4b battery/wiring).

**What is where**
- WL-171/169/174: `solarSystem` in `engine/solar.js` decides on-grid vs load-carrying (`grid_tied`), builds `inverter_text` (the "how" sentence; pages print `{{out.inverter_text}}`) and `inverter_buy` (`stdSize`/`buyKw`, list `standard_inverter_kw` in data/defaults.json). Battery cards are optional outputs on D5, D8, D12, D13, N13 (shown when backup hours > 0). H1 planner's `inverter_buy` in `engine/planner.js`.
- WL-182: page key `price_of` (tools/build.js) gives text `{{px.out.*}}` and `{{px.checked}}`; used on D8, D12, D13, N13.
- WL-230/175: `panelVolts`, `hybridString` (solar.js); used by `backup_compare` (backup.js, `string_min`, `panels_energy`) and `home_decision` (decision.js, hybrid counted only with enough panels). Panel and hybrid voltages in data/defaults.json (`panel_*`, `cell_temp_*`, `hybrid_pv_*`).
- WL-172/179: `solar_for_pump` (solar.js): `motor_v` (only `pump_motor_v`), string capped by `vfd_max_dc_v`, `string_below_bus` notice, drive from `standard_vfd_kw`, `drive_above_standard_sizes` notice. D15 page text explains the string.
- WL-173: `quote_checker` (prices.js) `battery_kwh`/`chemistry`, `battery_unknown` notice; N3 fields; N3 meta in keyword-map.
- WL-232: `panel_area_m2_by_w` (defaults) via `panelArea`.
- WL-170/180: data/cable-ampacity.json cables to 120 mm², n/d `sold_as_mm2`, `pv_cables` (EN 50618, `isc_factor`); `pvRating`, `pkLabel`, `aboveTable` in engine/wiring.js; W4 `fixed_inputs` `cable: pv`. DC fuse list in defaults `standard_dc_fuse_a`.
- WL-177: `dc_cutoff_ratio`, `max_c_rate_*` in defaults; `currentFor` (battery.js), `current_v` (wiring.js). B1 to B5 cards `battery_a`, `cutoff_a`; W2/W5 how text print `current_v`.
- WL-178: data/appliances.json `water-motor-1hp` equals the C5 rule (test). H5 locked-rotor wording. WL-231: `home_load` per-row PF (load.js; `load_type` on rows from `rowOf` in sizing.js); E1/E2 PF box blank.
- WL-181/176: H1.json battery_v default and idle sentence.
- Tests: `tests/solar-wiring-engine.test.js`. Engineer Reviewer: PASS after two rounds (fixed: pump string vs drive DC input, drive wording, 48 V bank on D8/N13, PV cable at 1.25 × Isc, current_v with amps; rejected with evidence: EN 50618 Table A.4 factors are as in data).

**Do not touch / watch**
- Never print an inverter size in page text by hand: use `inverter_text`/`inverter_buy` (the on-grid vs hybrid rule changes the figure).
- Panel voltages are one 585 W datasheet for every `panel_w`; changing the panel size does not change string voltages (PEC note).
- The `[ENGINEER]` items this phase added are listed in data `engineer_confirm` (defaults and cable file); bring them to the PEC brief.

**Open to-dos (PEC engineer notes from the review)**
- 220 V pump string at a 400 V drive input gives about 88% of the bus voltage on hot afternoons (notice shown); confirm drive limits.
- Small pumps get large arrays from the whole-string rule; consider a notice when the array is far above the drive.
- `standard_vfd_kw` stops at 37 kW; DC fuse has no continuous derating margin; DC drop % is against nominal volts; N3 hybrid premium priced at an inverter of kWp (decision engine uses kWp ÷ 1.3); hybrid start voltages from an off-grid unit; roof area below 330 W understated; three other water-motor rows (0.5, 1.5, 2 hp) still differ from the C5 rule (their measured ranges sit above it) and 3/29 has no shop size yet.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 3: input and error fixes) — written by the audit Phase 3 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 to 3 ticked). Next is **Phase 4 (solar, battery, wiring)**: read README, then only `phase-4-solar-battery-wiring.md` and its rows in `audit/fix-list-2026-10-21.md`. Plugin v0.8.25, PR #42. Rules live only in `specs/formulas.md` (bullets "Input checks (audit 2026-10-21 Phase 3)", Appliance rows "Blank boxes", D "Daily energy", C8, D9, F "Bill total") and the spec cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- WL-226 messages: `engine/messages.js` is the small browser part (generic patterns, `NOTICES` flag map, `noticeCode`, `errorMessage(code, { fields, texts, limit })`). Exact-code texts live only in `engine/message-text.js` (`EXACT`; build and tests import `errorMessage` from there). The build ships each page only the texts its calculator can produce: `pageTexts` in `tools/build.js` → tool `msg` → PHP config `msg` (`class-wattlyst-render.php`, which also passes each field's `unit`). `tool.msg` is left out of the page-date hash. `CalcError` carries `limit` (core.js `num` min/max), the result returns it, messages print it. A new exact code needs only a line in `EXACT`; `tests/input-errors.test.js` fails if a page lacks a text its calculator gives.
- WL-197: `say`/`show` in `assets/js/wattlyst-tool.js` move the message box under the wrong field (or under the appliance table) only on Calculate or a pick, and back above the results otherwise. CSS in `assets/css/wattlyst.css`: invalid red border on focus, dark field focus ring, `:has(>.wl-error)` spans a fourth subgrid row.
- WL-221: `typical_used` flag set in the `calculator` wrapper (engine/core.js) for listed appliances with blank boxes; D5 in `solar_for_ac`. D9 `panels_required` (engine/prices.js).
- WL-222: D7 field order and defaults in `content/pages/D7.json`; `usage_both` in `solar_size` (engine/solar.js).
- WL-223: mode-ignored boxes checked in `ac_units` (load.js), `charge_controller` (solartools.js), `units` and `amps_to_kw` (conversions.js), `voltage_drop`/`wire_size` (wiring.js).
- WL-224: bounds `margin_max`, `psh_min`, `load_w_max`, `fuel_per_unit_min_load_pct` in `data/defaults.json` (with sources); C8 `per_unit_hidden` notice, C8 `rs_per_unit` output optional.
- WL-225: `content/labels-ur.json` (every output on a toggle page now has one; optional outputs keep theirs in the build). The "How" heading gets "(English)" by CSS (`wl-how-en` class from `how()` in the render) while Roman Urdu is on.
- WL-227: whole quantities in `rowOf` (engine/sizing.js). List-only hours code is `loads_hours_required`.
- WL-241/242: `addons_secondary.fc_surcharge_per_unit.by_category` and `gst_pct.by_category` in `data/tariff-pk-2026.json` (sources, checked, verified flags); `addOns` in engine/bill.js reads them.

**Do not touch / watch**
- Homepage JS budget now has about 5 KB raw headroom (the message move); still plan bytes for 💾 rows.
- Never put an exact message text back into `engine/messages.js` (test checks). Notice flags go in `NOTICES`.
- List-row errors sit under the whole table; on a phone with a long list that is below the screen (the cell itself is focused and red). Phase 6 (phone layout) may want a per-row message.

**Open to-dos**
- [VERIFY] lifeline GST and the current protected FC surcharge rate: when the owner's expert or a real bill answers, change only `by_category` in the tariff file (plus formulas.md F and a spec case).
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 2: bill engine and bill pages) — written by the audit Phase 2 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phases 1 and 2 ticked). Next is **Phase 3 (input and error fixes)**: read README, then only `phase-3-input-errors.md` and its rows in `audit/fix-list-2026-10-21.md`. Plugin v0.8.24, PR #41. Rules live only in `specs/formulas.md` section F (bullets FPA exemption, Energy sum as printed, Next slab cliff, Default add-ons on F1–F12, ToU bill) and the spec cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- WL-157 FPA exemption: `addOns` in `engine/bill.js` (shared by `bill_total` and `bill_tou`) reads input `fpa_exempt` or `data/tariff-pk-2026.json` `addons_secondary.fpa_per_unit.exempt`; each `data/bill-index.json` month has its own `fpa_exempt` list, passed by `billIndex` in `tools/lib/datasets.js`. Texts: F14 (hint, key fact, section, example, mistake, FAQ), N1, N16 hint, P-G FAQ, Bill Index key fact/section/method/FAQ.
- WL-229 / WL-161: F1 to F13 `fpa_per_unit` field default `@data.fpa_latest.fpa_per_unit` with the month and `data.fpa_newest.note` in its hint; FC surcharge and GST fields have no default, only a `placeholder` (build renders `{{…}}` in placeholders now). Result cards include `fpa_rs`.
- WL-164: output `energy_calc` (string, slab-by-slab sum) used in every F page `how`; Bill Index CSV columns `top_slab_rate_rs_per_unit` and `avg_rate_rs_per_unit`.
- WL-165: outputs `next_units`/`next_rs` (absent at the top band and on lifeline). Output flag `optional: true` in content lets a result be absent at the defaults: `tools/build.js` gives it an empty value and `includes/class-wattlyst-render.php` prints the card `hidden`; the browser already hides empty cards.
- WL-163: N1 output `spike` (optional).
- WL-162: `bill_tou` returns the full bill; F13 fields/outputs/how/table rewritten. Message `tou_required_at_5kw` (`engine/messages.js`) points to "the ToU bill link under Sanctioned load"; field hints may now carry `[[ID|anchor]]` links (`withLinks` in the build, `linked()` in the field renderer). Pages that can show the message carry the F13 link in their Sanctioned load hint (test checks every one). N4 text on the 5 kW line corrected.
- WL-167/168/166: "FPA differs between DISCOs" sentences replaced (F1 to F12, P-F, N16); area + helpline facts on F2, F4, F5, F6, F12 with sources; Bill Index link sentences state its kW basis (F1, N1, P-F); F13 answer lists all four seasons; Bill Index per-unit figures say "before income tax" (content + ladder table head in `datasets.js`).
- Tests: `tests/bill-engine.test.js` (this phase). Older tests adapted where the FPA is now pre-filled (MF-01 FCA label, WL-116 basis wording, WL-117 page defaults, content checklist optional outputs).

**Do not touch / watch**
- Homepage JS budget: 15 bytes left (the 5 kW message got shorter). D8/D12/D13/N13 chain 228 bytes. `bill.js` has about 2 KB of its own budget left.
- Bill page totals now include the pre-filled FPA: when a Bill Index month becomes NEPRA-verified, every F page default bill moves (that is intended; rebuild and commit `generated/`).
- H1 and D10 still refuse 5 kW and above (WL-162(c), browser bytes): an owner decision for a later phase.

**Open to-dos**
- [ENGINEER] FC surcharge and GST on lifeline bills still assumed 0 until a real lifeline bill confirms it; ToU bill's FC/QTA/FPA/GST basis matches the flat bill (confirm on a real ToU bill).
- WL-14b (fixed charge per kW) has primary evidence in the 21 Oct bills expert file; formulas.md "Open tariff questions" not yet closed.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after 21 Oct audit fix Phase 1: correct data live and announced) — written by the audit Phase 1 thread, 2026-10-21

Owner: every fix phase of the 21 Oct 2026 audit runs in its own new thread, only after the owner says to start it. Shared rules and phase notes: `/mnt/project-files/electricity-tool-hub/audit/2026-10-21/handoff/` (README, `phase-N-*.md`, `status.md`; Phase 1 ticked). Next is **Phase 2 (bill engine)**: read README, then only `phase-2-bill-engine.md` and its rows in `audit/fix-list-2026-10-21.md`. Plugin v0.8.23, PR #40.

**What is where**
- WL-156/158 FPA months: `data/bill-index.json` `months` (newest first; `fpa_verified` true only with a NEPRA PDF; `fpa_ke` = the source covers K-Electric). F14 reads `data.fpa_latest` (pre-fill, newest verified month) and `data.fpa_newest.lead` (answer opens with the newest month) from `loadInputs` in `tools/build.js`.
- WL-160: `data/backup-prices.json` first UPS row (`sources_note` says why a source was dropped; `browserBackup` drops every `*_note`).
- WL-159: `data/generator-fuel.json` `prices` (one `effective` ISO day per fuel; build adds `effective_text` for page text, C8 prints it). Upkeep report `tools/maintenance.js` `out.fuel` flags fuel older than `fuel_price_max_age_days` in `data/maintenance.json`.
- WL-228: HAZECO sentences in `content/pages/F7.json`, `F9.json`, `bill-index.json` (FAQ). A HAZECO bill page is owner decision OW-7, not built.
- WL-214: `when()` in `includes/class-wattlyst-render.php` feeds the byline and the "Last ..." line: "Reviewed" + `reviewed` only when `data/site.json` reviewer is `signed_off`, else "Updated" + `modified`. Schema `lastReviewed` only after sign-off (`schemaFor`).
- WL-206: `generated/page-dates.json` (committed; never edit by hand) holds a hash of each built page and the day it last changed (`changedOn`, `PAGE_DATES` in `tools/build.js`). Page `modified` = newest of review day, change day and (hubs) children; manifest `lastmod`, schema `dateModified`, `article:modified_time` and the IndexNow batch use it. A content or data change gets the build day automatically; `WATTLYST_TODAY` pins it in tests.
- WL-207: `HTML_CACHE` and `headers()` in `includes/class-wattlyst-site.php` (visitors only; WordPress's own no-cache wins).
- Spec cases whose expected values come from refreshed prices were re-derived (notes say so). Tests: `tests/data-announce.test.js`.

**Do not touch / watch**
- Never hand-edit `generated/page-dates.json`; rebuilding is what moves a page's date. A build on a later day after a content change gives that later day, so always commit the rebuilt `generated/` with the change.
- Do not mark an FPA month verified without the NEPRA PDF. The protected-FPA exemption (WL-157) is still in `engine/bill.js`: Phase 2.
- Homepage JS budget unchanged by this phase (no browser JS changed).

**Open to-dos**
- Owner hPanel: HTML cache setting (LiteSpeed/Hostinger CDN browser cache was sending a week for the home page); the plugin now sends a short header, but a host rule can override it. Purge the CDN once after this deploy.
- Fuel source is a news report of the Petroleum Division notification (`verified` false): switch to the OGRA PDF when OGRA lists it. Fuel needs a refresh about weekly now (upkeep report).
- 1.2 kVA UPS row has two dealer sources; add a third dated dealer listing at the next price refresh.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after full-audit fix Phase 6: speed and hygiene) — written by the audit Phase 6 thread, 2026-10-16

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (all phases 1 to 6 ticked; the 15 Oct full audit is done). Next per that plan: a short read-only re-check of the P0/P1 items on the live site (no full re-audit unless the owner asks). Plugin v0.8.22, PR #38. Rules: `specs/seo-rules.md` (Core Web Vitals bullet: JS budget wording), spec cases at the end of `specs/calculator-test-cases.json` (third case per calculator).

**What is where**
- WL-136 speed: `assets/js/wattlyst-tool.js` loads `wattlyst-extra.js` only on first use (`extra()` getter: result table, N11 diagram, N6 forecast), so the homepage start-up path no longer fetches it. Whole-chain JS budget: test "WL-136 ... whole import chain" in `tests/site.test.js` (every nested engine import from manifest `assets.deps`, < 30 KB gzip and a raw ceiling); the old per-module raw test is kept. `tools/wp-test-site.sh` router compresses HTML (`zlib.output_compression`), like the live server, so local and CI Lighthouse measure what visitors get.
- WL-138: `dist/.htaccess` (1 year, immutable) is BUILT by `tools/build.js` (`DIST_HTACCESS` in `distFiles`); never edit it by hand. Root `.htaccess` unchanged; HTML cache and the unversioned embed script keep the server default.
- WL-107: the 1.5 ton AC figures (`ac_inverter_avg_kw_1_5_ton`, `ac_noninverter_kw_1_5_ton`) are no longer in `data/defaults.json`: `loadInputs` in `tools/build.js` copies them from the two AC records in `data/appliances.json`. `engine/messages.js`: `protected|lifeline_max_<n>_units` and `history_needs_<n>_months` are patterns that print the number in the code; the fixed messages that name a data value (5 kW ToU, 10 to 60 °C, 1 to 20 circuits, 0.05 dust, six months) are pinned to data by `tests/messages.test.js` (WL-107 test).
- WL-154: `data/site.json` `analytics.enabled` false (owner chose on 16 Oct 2026); privacy policy has no Analytics section until GA4 is really installed.
- WL-155: `tests/guardrails.test.js` `checkClean` rejects negative results except the `SIGNED` set (FPA/QTA credits, quote % below range); every calculator has at least 3 spec cases; `markdown` in `tools/maintenance.js` (now exported) prints "- none" only when no stale line follows.
- Tests: `tests/speed-hygiene.test.js` (this phase).

**Do not touch / watch**
- Homepage JS budget (per-module raw test): 9 bytes left. Any byte added to `wattlyst-tool.js`, `messages.js`, `format.js`, `core.js`, `decision.js` or `wattlyst-loads.js` must be paid back. Home CSS about 500 bytes left.
- `content-visibility:auto` on the homepage folds was tried and left out: Lighthouse accessibility drops to 93 (it cannot read colours or tap sizes in skipped content).
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31) stays out of main.

**Open to-dos**
- Owner hPanel: confirm LiteSpeed/CDN keeps the `dist/` 1-year header (the plugin `.htaccess` sets it; a CDN rule could override it). HTML cache stays 7 days (WL-36).
- Local Lighthouse on `/` (compressed test server): median 98 now, 99 on the previous main; the gain from the lazy table module is within noise there. The audit's 94 came from the uncompressed test server.
- Everything open from the earlier handoffs below still stands (WL-139, [ENGINEER] items, Toolsfluent price source, A10 title, WL-149, tariff questions).

## Earlier handoff (after full-audit fix Phase 5: SEO, content, internal links) — written by the audit Phase 5 thread, 2026-10-15

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (Phases 1 to 5 ticked). Next is **Phase 6**: read only its section there plus its report lines. Plugin v0.8.21, PR #37. Rules live only in `specs/formulas.md` (E5 bullet, `avg_w_range` sentence) and the spec case at the end of `specs/calculator-test-cases.json`; titles and metas only in `specs/keyword-map.csv` and `specs/site-pages.csv`.

**What is where**
- WL-140 in-text links: write `[[ID|anchor]]` in section paragraphs, worked examples and FAQ answers of `content/pages/*.json` (nowhere else: the build fails). `linked`/`withLinks` in `tools/build.js` resolve them (unknown, non-live or self link fails the build) and store plain text plus `l`; `Wattlyst_Render::linked()` prints them. Tests that scan text strip the `[[ID|` part.
- WL-142 hubs: `content/pages/P-A.json` to `P-X.json`. Hubs build after every other page (`builtById`, `results` in the build loop): a key fact `{from, n}` copies another page's built fact, `{{pg.<ID>.out.x}}` reads another page's default result. Hub dates: `dates()` in `class-wattlyst-render.php` ("Last updated" from `modified` when there is no review date). P-F h1/title/meta in `specs/site-pages.csv`.
- WL-143 no home BreadcrumbList: `schemaFor` in `tools/build.js`. WL-144: menu `aria-current` (`menu_fallback`), footer "Appliance watts" (`footer()`) in `class-wattlyst-pages.php`; feed 404 as HTML (`not_found` in `class-wattlyst-site.php`); embed link text in `embeds()`; "All ..." link keeps acronyms.
- WL-145 metas: `specs/keyword-map.csv` (F1 to F11, F13, D10, D14; E5 and D9 titles). WL-146: `avg_w_range` on the 1.5 ton inverter AC in `data/appliances.json`, `ac_units` outputs `avg_kw_low/high` (`engine/load.js`), E5 text. WL-147 D9 headings.
- WL-150 rough figures: `engine/approx.js` (build only) formats `rsm` (market prices) and `hm5` (runtimes) in page text; the build refuses them in live `how`/`how_ur` and result captions. Worked examples with arithmetic keep exact formats.
- WL-151 N7 source labels: `backupSources` in `tools/build.js`. WL-152 "net billing" wording on D8, D12, D13, D14, N3 (NEPRA document titles and the keyword "net metering application" kept). WL-153: nine answers trimmed to 60 words, E1 new sections, B1 and E1 sources.
- Tests: `tests/seo-content.test.js` (own tests; the audit branch had none for WL-140 to WL-153).

**Do not touch / watch**
- Homepage JS budget unchanged by this phase (still about 30 bytes left). Page text only; no browser JS changed.
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31) stays out of main.

**Open to-dos**
- D9, D14 and the Solar Price Tracker still cite a competitor price site (Toolsfluent) as a price source: replace with dealer lists at the next price refresh.
- WL-144 Related `link_text` not built (in-text links cover it); the link-graph test still counts only related/next/parent links as inbound.
- [ENGINEER] E5 range 0.5 to 1.4 units per hour (`avg_w_range_note`).
- A10 title "kWh to Ah" (from the Phase 4 note) not changed.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after full-audit fix Phase 4: battery, generator, wiring, solar tools) — written by the audit Phase 4 thread, 2026-10-15

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (Phases 1 to 4 ticked). Next is **Phase 5** (SEO, content, internal links): read only its section there plus its report lines. Plugin v0.8.20, PR #36. Rules live only in `specs/formulas.md` (section B "Battery-side draw" bullet; section W design-current and voltage-drop bullets; D6 and N3 sub-bullets "Full audit 2026-10-15"; D3 "Weakest month" sub-bullet; C8 WL-148 sub-bullet; N6 bullet) and the spec cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- WL-120 idle draw: `drawFor` in `engine/battery.js` (used by `battery_runtime`, `battery_bank`, `ups_backup`; outputs `idle_w`, `battery_w`, `stored_wh`, `battery_kwh_draw`; `usable_wh` is gone). Default from `ups-idle` in `data/appliances.json`, shipped to the B pages by `pageAppliances` in `tools/build.js` (field name `idle_w`). B1 to B5 text, formula lines and the new Advanced field; H8/H9 formula sentences.
- WL-121 DC current: `designCurrent` and `voltage_drop` in `engine/wiring.js` divide DC watts by `inverter_eff`; `breakerFor` adds `standard_dc_fuse_a` (`data/defaults.json`) on DC. W2 and W5 have an Advanced "Inverter efficiency (DC)" field; W2 output label "MCB or DC fuse".
- WL-125: W2 has no circuit field; `wire_size` takes the circuit from the load type. WL-126: `cable_rating` derated; `ceilSafe` in `engine/core.js` relative below 1.
- WL-124 messages: one row pattern in `errorMessage` (`engine/messages.js`, "Appliance N:" + the plain message for any `load_N_` code); custom row codes in `loadRows` (`engine/sizing.js`); E6 `units` code `hours_per_day_required` (`engine/conversions.js`); W4 blank current `amps_required`.
- WL-128: new `engine/offgrid.js` (`solar_offgrid`, D3's calc now) and `engine/months.js` (month keys/names/days, also used by `seasonal.js`); D3 outputs and text for the weakest month.
- WL-129 caps (`engine/solar.js`, `psh_max` in defaults), WL-131 D6 `panels_fitted`/`fitted_panel_w` outputs + notice, WL-130 `engine/forecast.js`, WL-132 `priceRange` in `engine/prices.js` (price notice text in `messages.js` now says "few published prices").
- WL-119/123/127 page text: C5 (example 3 is the pump with lights), C6, A4, A10, W4, N18, D8. WL-122 `up*` formats on B4, C1 to C4, D6, D15, D16.
- WL-148: `open_frame_datasheets` (petrol) and `primary_datasheets` (diesel) in `data/generator-fuel.json`; curve unchanged.
- Tests: `tests/battery-wiring-solar.test.js` (MA-01 to MA-16, MD-02, MD-04 to MD-09 from the audit branch; MD-04 checks the shown shortfall, not worst-month sizing).

**Do not touch / watch**
- Homepage JS budget: about 30 bytes left (messages.js shrank a little); D8/D12/D13/N13 (`solar.js` + loads) about 245 bytes. The 30 KB test still counts only each page's own module (Phase 6, WL-136).
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31) stays out of main.

**Open to-dos**
- [ENGINEER] one idle draw for every UPS size; idle added on top of full-load efficiency; DC cable default efficiency (hybrid, not the lower UPS figure) and nominal battery voltage; DC fuse list; D3 worst-month sizing (now only shown); petrol fuel curve vs the open-frame datasheets (C8, N7, homepage generator cost).
- Not changed: the planner (H1), N7 and the solar battery (D3/D8) do not add the idle draw, so H1 and B4 print different Ah for the same backup; `breaker_size` called in DC mode attaches MCB curve data to a fuse rating (no page uses DC on W3); the cable table stops at 35 mm², so many DC fuse sizes give "above the cable table"; "Hours is too large" style messages do not name the limit.
- A10's title promises "kWh to Ah" (WL-123): a keyword-map item for Phase 5. The number-words test still checks only twenty and up.
- No Pakistani-brand generator datasheets were found (Jasco, Kipor and others); N11 100 × 100 batteries warning still open.
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after full-audit fix Phase 3: bill calculators) — written by the audit Phase 3 thread, 2026-10-15

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (Phases 1, 2a, 2b, 3 ticked). Next is **Phase 4** (battery, generator, wiring, solar tools): read only its section there plus its report lines. Plugin v0.8.19, PR #35. Rules live only in `specs/formulas.md` (section F bullets Rounding, FPA input range, Average rate, Top-slab cliff, Protected check; N1 bill audit bullets; N4 and E4 bullets; E1 bullet; N16 bullet; Data pages bullet) and the spec cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- WL-109 rounded bill lines: `billLines` in `engine/bill.js` (each printed line whole rupees, GST on the rounded subtotal); `bill_total` wraps it and adds `avg_rate` (WL-114) and `cliff_units`/`cliff_rs` (WL-117). Every caller (planner, decision, N16, Bill Index) now gets whole-rupee lines.
- WL-118 FPA range: `min`/`max` (with `range_note`, `range_source`) on `addons_secondary.fpa_per_unit` in `data/tariff-pk-2026.json`; N16 notice `ac_above_sanctioned` (`engine/acbill.js`, text in `engine/messages.js`); N16 default sanctioned load is now a page default in `content/pages/N16.json`.
- WL-110 one sanctioned-load rule: new module `engine/sanction.js` (`sanctionedFor`, N4 `sanctioned_load`, E3 `load_check`, E4 `add_ac_check` moved out of `sizing.js`/`load.js` to keep the page JS budgets); E4 outputs `demand_kw`, `needed_kw`, `verdict`; E4's first field is now the connected load (every appliance installed), so diversity is applied once (Engineer Reviewer); E4 page text rewritten (`content/pages/E4.json`).
- WL-111 N1: pro-rated protected fair bill in `bill_audit` (`proratedProtected`, outputs `fair_protected`, `fair_basis`); N1 how and example 2 text.
- WL-112 E1: calc `home_load_bill` in `engine/acbill.js` (no rate field any more; sanctioned load sets the fixed charge, 5 kW+ gives the ToU message); E1 example 2 moved to a 4 kW connection.
- WL-113 `protected_check` parses each month. WL-114 F tables print "Average rate per unit"; F1 fixed-charge fact; N1 example 3 wording. WL-116 F1/F2 answers say "before the month's FPA"; H1 "one engine" paragraph softened.
- WL-115: `tools/lib/datasets.js` `billIndex` (`lab()` "(FPA reported)", `status()`, K-Electric row uses `fpa_ke`); `data/bill-index.json` month fields `fpa_ke`, disco `ke`; F14 FAQ/hint use `data.fpa_newest.note` (built in `tools/build.js` next to `fpa_latest`); F14 meta in `specs/keyword-map.csv`.
- Tests: `tests/bill-calculators.test.js` (MF-01 to MF-07 from the audit branch, adapted, plus WL-115 to WL-118). All MF tests failed on v0.8.18.

**Do not touch / watch**
- Homepage JS budget: about a dozen bytes left in the 30 KB test (H1 = tool script + base incl. `messages.js` + `decision.js` + loads). Any new message text costs every page; the list pages on `load.js` have room again because E4/N4 left it.
- `bill_total` now returns whole rupees: compare bills with an exact or rupee tolerance, not 0.01 on decimals.
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31) stays out of main.

**Open to-dos**
- [ENGINEER] E4 now uses N4's diversity 0.6 on the connected load, so many homes that "overloaded" before now fit; E1's own sanctioned-load check still compares the connected running load (not changed, the audit only named E4). N1 assumes the home was protected before when protection is at risk (page says so).
- WL-149 not done: no primary notification found for the PTV fee removal (only news, June to August 2025), so the F1 FAQ and Bill Index still name the TV fee "where it is still charged"; drop it once a gazette/SRO is found.
- Engineer Reviewer repeated the open tariff questions (formulas.md section F, WL-14a/b): fixed charge per kW or per consumer, and a previous-slab benefit for unprotected 1-200 units; both need the SRO 279(I)/2026 text (owner/PEC).
- The FPA range rests on a secondary source (see `range_note` and `range_source` in the tariff file); marked `range_verified: false`.
- Everything open from the earlier handoffs below still stands (WL-139, Roman Urdu on N7/N16/N18, N11 warning, component price rows, Phase 2b [ENGINEER] items).

## Earlier handoff (after full-audit fix Phase 2b: decision engine modelling) — written by the audit Phase 2b thread, 2026-10-15

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (Phases 1, 2a, 2b ticked). Next is **Phase 3** (bill calculators): read only its section there plus its report lines. Plugin v0.8.18, PR #34. Rules live only in `specs/formulas.md` (Global defaults table rows `yield` and `days_per_month`, N7 bullet, H1 planner paragraph, Home Power Decision Engine bullet) and the spec cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- One net-billed month for every decision setup: `netSaving` in `engine/planner.js` (shares of solar made, export allowed, extra units). `home_decision` (`engine/decision.js`) calls it for on-grid, hybrid, UPS, generator credit and combo; `grid_share` output (WL-93, WL-95).
- Ranking and close call: `rank` in `engine/prices.js`; outputs `close_call`, `runner_up`, `budget_low_end` (WL-94, WL-105).
- Backup checks and start: `home_plan` throws `backup_above_home` (message in `engine/messages.js`), makes backup watts optional at zero hours and returns `backup_surge_w` (WL-96, WL-103, WL-105).
- N7 `backup_compare` (`engine/backup.js`): optional `surge_w` (N7 field "Starting watts"), UPS, generator and hybrid inverter must carry and start the load; only hybrid rows whose `bank_v` matches the lithium pack; outputs `cheapest_buy`, `first_year_dearest` for page text. `standbyFor` (same bill baseline, generator credit) and `hybridBank` (hybrid battery bank, moved out of decision.js) live here too.
- Data: `data/backup-prices.json` UPS rows labelled by real VA, `lithium_pack.bank_v`; `data/component-prices.json` `bank_v` on hybrid inverter rows (browser copy carries it, `tools/build.js`); `data/defaults.json` `days_per_month` (average calendar month) and `bill_month_days` (N1 only); `data/cities-pk.json` `yield` from the monthly PVOUT values (WL-97, WL-98, WL-106).
- Page text: `content/pages/H1.json` (answer in kWh, how/how_ur cuts sentence, step seven, "What this comparison leaves out" paragraph, FAQ, N7 in related, backup hours hint); `N7.json` (key facts and FAQ from engine outputs, home planner sentence, surge field, H1 in related instead of D15); `D7.json`, `D2.json`, `E1.json` formula/how text use the data month length; `N1.json` uses `bill_month_days`.
- Tests: `tests/decision-modelling.test.js` (DE-03 to DE-07, DE-12, browser copy over many inputs, plus close call, voltage pairs, not-counted list vs spec, N7/H1 cross sentence, N7 claims, budget, one month length). All DE tests failed on the old engine.

**Do not touch / watch**
- Homepage JS budget: `decision.js` was shrunk again (logic moved to `prices.js`/`backup.js`/`planner.js` helpers); the 30 KB test still counts only the page's own module, so the real chain is larger (Phase 6, WL-136, must count the whole chain). `messages.js` counts on every page and the C1 page is also near the limit.
- Many default numbers moved slightly site-wide with the month length and yield; the homepage default home now sits just above the 400-unit slab, so its bill and the UPS running cost changed more than the rest.
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31) stays out of main.

**Open to-dos**
- [ENGINEER] marked in formulas.md: even spread of cuts, hybrid exporting only while the grid is on and using its full daytime self-use in a cut, `bank_v` of each inverter row, a start factor for UPS/hybrid inverters above their continuous rating (now they must carry the start continuously, which leaves many motor backups to the generator).
- [ENGINEER] H1 prices a small hybrid by Rs per kW from the smallest 48 V row, while N7 buys that whole unit: the two pages differ below the list until a 3 to 5 kW export-capable 48 V row is sourced (same data item as the premium "not known").
- Data items from the Phase 2a handoff below (re-source inverter rows) still stand.
- Everything open from the earlier handoffs below still stands (WL-139 phone Calculate button, Roman Urdu on N7/N16/N18, N11 warning).

## Earlier handoff (after full-audit fix Phase 2a: decision engine sizing and pricing, P0) — written by the audit Phase 2a thread, 2026-10-15

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (Phases 1 and 2a ticked). Next is **Phase 2b** (decision engine modelling): read only its section there plus its report lines. Plugin v0.8.17. Rules live only in `specs/formulas.md` (D5/D8 bullet, H1 planner paragraph, Home Power Decision Engine bullet) and the new spec cases at the end of `specs/calculator-test-cases.json`.

**What is where**
- WL-92 sizing rule: `solarSystem` in `engine/solar.js` takes a `power` flag; `solar_from_loads` passes it only for `off_grid` (D3), `solar_for_ac` (D5) and `solar_for_pump` (D15) keep it. Output `power_rule` says which; `kw_power` is still returned and shown in page text. The planner (`engine/planner.js`) follows automatically through `solar_from_loads`.
- WL-91 billed array: `home_plan` now also returns `net_billing_inverter_kw` (its inverter rule at the billed array). `home_decision` (`engine/decision.js`) prices and names every solar setup at `net_billing_kw` with that inverter; when no panel fits the sanctioned load the three solar setups are "not available" and never picked. The planner's `solar_above_sanctioned` notice text (`engine/messages.js`) now says the setups count only the panels that fit.
- WL-100 premium: `hybridPremium` in `engine/prices.js` (hybrid kW, premium, known flag); the decision text says the extra cost is "not known (none added)" instead of a zero premium.
- Page text rewritten for the energy rule: `content/pages/D8.json`, `D12.json`, `D13.json`, `N13.json` (answer, how, key fact, sections, mistakes, FAQ) and `H1.json` (how, how_ur, key fact). D3, D5, D15 text unchanged (they keep the power rule).
- Tests: `tests/decision-sizing.test.js` (DE-01, DE-02, MD-01 moved from the audit branch and adapted to `tests/load-data.js`; premium wording; inverter middle and low prices never fall with size). All failed on the old engine.

**Do not touch / watch**
- Homepage JS budget is full again (a few dozen bytes left in the 30 KB test): `decision.js` was shrunk to fit. Put new decision code in helpers of `prices.js`/`backup.js`/`planner.js` or shrink first. `messages.js` counts on every page.
- Default numbers changed on D8, D12, D13 and N13 (fewer panels, same inverters) and on the homepage only for lists whose running load beat their units; the homepage default result is unchanged except the hybrid line wording.
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31) stays out of main.

**Open to-dos**
- [ENGINEER] WL-92 rule choice (energy sizing for grid-tied lists instead of a diversity factor) is marked in formulas.md for the PEC reviewer.
- Grid-tied pages still size the inverter from the running load with margin, so the inverter can now be well above the panel kW (N13, D13); whether a grid-tied inverter needs to carry the whole load is an engineer item, and the D8/D13 "Is a 5/15 kW system enough" FAQ answers are MD-02 in Phase 4.
- Data item (owner): the on-grid 5 kW inverter row's high price comes from an unverified three-phase snippet, the 5 kW and 10 kW on-grid middle prices are equal, and there are no 3 kW on-grid or 3 to 5 kW export-capable hybrid rows; re-source `data/component-prices.json`. Until then the homepage default shows the hybrid premium as not known. MD-03 (hybrid always dearer than on-grid) waits for that data.
- Everything open from the earlier handoffs below still stands (WL-139 phone Calculate button, Roman Urdu on N7/N16/N18, N11 warning).

## Earlier handoff (after full-audit fix Phase 1: homepage and phone bugs) — written by the audit Phase 1 thread, 2026-10-15

Owner: every audit fix phase runs in its own thread and ends with this note. Phase plan, IDs and report lines per phase: `/mnt/project-files/electricity-tool-hub/audit/fix-phases-2026-10-15.md` (Phase 1 ticked). Next is **Phase 2a** (decision engine sizing and pricing, P0): read only its section there plus its report lines. Plugin v0.8.16, PR #32. No formula, data, engine or page text changed.

**What is where**
- WL-89 share link: `Wattlyst_Site::keep_share_link` (`includes/class-wattlyst-site.php`, `redirect_canonical` filter, front page with `load` only). JS reader unchanged (`init()` in `assets/js/wattlyst-tool.js`).
- WL-90 desktop columns: `.wl-tool-split>.wl-in` / `>.wl-out` grid pins in the `min-width:1200px` block of `assets/css/wattlyst-home.css`.
- WL-133 phone list headings: `#wl-h1 .wl-loads thead th` colour in the phone block of `wattlyst-home.css`.
- WL-134 focus ring, WL-135 result table cards (now every `.wl-rtable` below 769 px, uses the `data-l` labels), WL-137 steps toggle (`.wl-how-steps:has(>ol[hidden])>.wl-tg`), remove button `padding:0`: all in `assets/css/wattlyst.css`.
- WL-137 Escape closes the phone menu: `Wattlyst_Site::menu_escape` (inline script on the theme's `generate-menu` handle; theme untouched). "Rs" no-break space in redrawn tables: `drawTable` in `assets/js/wattlyst-extra.js`. N18 new row cable length and "circuit" wording: `loads_field`/`loads_row` in `includes/class-wattlyst-render.php` (template row takes the last default row's length from the page content).
- Tests: `tests/wordpress.test.js` (share filter, Escape), `tests/design.test.js` "full audit Phase 1". Browser: `tools/browser-check.js` `homeChecks` (share round trip, 1366/1920 error layout) and result table overflow on every page; both were run against the old code and failed as they should.

**Do not touch / watch**
- `wattlyst-home.css` has about 500 bytes left in its 20 KB budget; the home JS budget is unchanged (no tool/loads script grew). Shared rules go in `wattlyst.css`.
- The audit test folder on branch `claude/project-thread-1qfruz` (PR #31, "DO NOT MERGE") stays out of main; copy only your phase's DEFECT tests into `tests/`. Phase 1 had none there (browser items), so nothing was copied.
- A LiteSpeed/browser-cached old 301 for a `?load=` URL can live up to 7 days; the sync purge clears LiteSpeed on deploy.

**Open to-dos**
- WL-139 (Calculate button below the fold on phones) is not fixed: a sticky phone button was tried and dropped because it covers inputs, which fails Lighthouse `target-size` (accessibility 97). Needs an owner/design call (results already update on every change).
- With JavaScript off, Calculate submits a GET and the Menu button does nothing (GeneratePress); noscript note is present.
- No Roman Urdu toggle on N7, N16, N18 (needs `label_ur` in `content/labels-ur.json`): fits Phase 5.
- N11 accepts 100 × 100 batteries with no warning: engine item, fits Phase 4.
- Remove buttons have no row number in their name (would cost bytes in the home JS budget).
- Everything open from the earlier handoffs below still stands.

## Earlier handoff (after the homepage compact layout) — written by the decision engine thread, 2026-10-15

Owner asked for a compact homepage, arrangement only ("han" to the audit in `/mnt/project-files/electricity-tool-hub/audit/homepage-compact-2026-10-15.md`). Plugin v0.8.14; follow-up v0.8.15 (owner screenshots): planner fields in two aligned columns, task cards equal height (`grid-auto-rows:1fr`, two tools shown via `HOME_CARD_LINKS`, descriptions and tool names clamped). No formula, data, engine or page text changed.

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
| 2026-10-15 | Homepage follow-up (owner screenshots): aligned planner fields, equal-height task cards; plugin v0.8.15 | done: tests green, local WP checked | PR #30 |
| 2026-10-15 | Full audit fix Phase 1 (owner: phases in own threads): homepage share link (WL-89), desktop error layout (WL-90), phone headings, focus ring, result table cards, small UI items (WL-133..137; WL-139 left open, see handoff); plugin v0.8.16 | done: tests green, local WP + browser checks, axe 0 on / | PR #32 |
| 2026-10-15 | Full audit fix Phase 2a (decision engine P0): grid-tied lists sized by energy like D7 (WL-92 [ENGINEER], H1 D8 D12 D13 N13), decision setups priced at the array net billing accepts (WL-91), hybrid premium shown as not known instead of zero (WL-100); plugin v0.8.17 | done: tests green, Engineer Reviewer (4 defects fixed), local WP checked | PR #33 |
| 2026-10-15 | Full audit fix Phase 2b (decision engine modelling): power cuts spread over the day, generator credited with the grid units it supplies, UPS/generator/hybrid must start the backup load, UPS rows by real VA, matching battery voltages, close calls and runner-up, budget on the low price, backup above the home rejected, N7 claims from engine outputs, one month length (365 ÷ 12) and yield from monthly PVOUT (WL-93 to WL-106, WL-108); plugin v0.8.18 | done: tests green, Engineer Reviewer (5 defects fixed), local WP + browser check | PR #34 |
| 2026-10-15 | Full audit fix Phase 3 (bill calculators): printed bill lines add up (WL-109), E4 uses the N4 sanctioned-load rule (WL-110 [ENGINEER]), N1 fair bill on pro-rated protected slabs (WL-111), E1 priced as a whole bill (WL-112), "1,500" in history (WL-113), wording and average rate (WL-114), reported FPA month and K-Electric row (WL-115), bill basis named (WL-116), top-slab cliff fact (WL-117), FPA range and N16 notice (WL-118); WL-149 left (no primary source); plugin v0.8.19 | done: tests green, Engineer Reviewer (3 defects fixed: E4 connected load, N1 float edge, Bill Index K-Electric sentence), local WP + browser check | PR #35 |
| 2026-10-15 | Full audit fix Phase 4 (battery, generator, wiring, solar): UPS idle draw in B1 to B5 (WL-120), DC battery current with inverter efficiency and DC fuses (WL-121), page claims corrected (WL-119, WL-123, WL-127), round-up minimum sizes (WL-122), row error messages (WL-124), W2 lighting circuit (WL-125), cable_rating derated and ceilSafe (WL-126), D3 weakest month shown (WL-128 [ENGINEER]), hour and PSH caps (WL-129), N6 sky label (WL-130), D6 above largest panel (WL-131), price notice outside listed sizes (WL-132), generator datasheets (WL-148 [ENGINEER]); plugin v0.8.20 | done: tests green, Engineer Reviewer (2 defects fixed: H8/H9 backup formula, W5 DC current), local WP + browser check | PR #36 |
| 2026-10-15 | Full audit fix Phase 5 (SEO, content, internal links): in-text links (WL-140), hub content on 10 hubs (WL-142), no home breadcrumb (WL-143), menu/footer/feed/embed fixes (WL-144), metas (WL-145), E5 range (WL-146 [ENGINEER]), D9 headings (WL-147), rough market prices and runtimes (WL-150), N7 source labels (WL-151), net billing wording (WL-152), answer length and E1 depth (WL-153); plugin v0.8.21 | done: tests green, local WP check | PR #37 |
| 2026-10-16 | Full audit fix Phase 6 (speed and hygiene): result-table module loaded on first use and JS budget over the whole import chain, test site compresses HTML like live (WL-136), dist/ cached 1 year (WL-138), one source for AC figures and message limits (WL-107), analytics off in the privacy policy (owner, WL-154), negative-result guard, third spec case for 17 calculators, upkeep report fix (WL-155); plugin v0.8.22 | done: tests green, local WP + browser check, Lighthouse / median 98 | PR #38 |
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
| 2026-10-21 | Audit 2026-10-21 fix Phase 1: correct data live and announced (WL-156 July FPA NEPRA-approved + K-Electric, WL-158 October FPA exact and F14 leads with newest month, WL-160 hijacked source removed, WL-159 fuel prices + upkeep age check, WL-228 HAZECO, WL-214 "Updated" byline, WL-206 lastmod from content changes, WL-207 short HTML cache), plugin v0.8.23 | done: tests green, CI + Lighthouse green, local WordPress checked | #40 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 2: bill engine and bill pages (WL-157 protected homes pay the FPA, exempt list in data, WL-229 FPA pre-filled on F1-F12, WL-161 lifeline example matches, WL-164 slab-by-slab how text + CSV avg rate, WL-163 N1 spike row, WL-162 full ToU bill on F13 + 5 kW link, WL-165 next slab cliff, WL-167/168/166 DISCO, F13 and Bill Index text), plugin v0.8.24 | done: tests green, Engineer Reviewer, local WordPress checked | #41 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 3: input and error fixes (WL-197 error under the field + red focus, WL-226 messages with unit/example/limit and per-page texts, WL-221 typical-values notice + D9 panels required, WL-222 D7 monthly default, WL-223 ignored boxes checked, WL-224 bounds in data + C8 per unit, WL-225 Roman Urdu labels, WL-227 whole counts, WL-241/242 FC/GST per category in data, partial), plugin v0.8.25 | done: tests green, Engineer Reviewer (2 C8 defects fixed), local WordPress checked at 375 px | #42 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 4: solar, battery and wiring engine (WL-169 to 182, 230 to 232: on-grid vs hybrid inverter, sizes to buy, battery cards, build-time prices, hybrid starting string, pump string and drive, hybrid quote battery, roof area, cables to 120 mm² + DC message, PV cable EN 50618, DC current at cut-off, C-rate notice, 1 hp motor, appliance PF), plugin v0.8.26 | done: tests green, Engineer Reviewer PASS (second round), local WordPress browser check on 19 pages | #43 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 5: page text (WL-183 rough runtimes, WL-184 average month in text, WL-185 home saving labels, WL-233 lithium guide vs datasheet and fire safety, WL-234 outside sources on every page, WL-235 honest metas, WL-189 internal links, WL-188 tracker title, WL-190 lakh prices, WL-236 wrong statements, WL-192 slab rate, WL-193 index date, WL-194 peak-hours title, WL-195 llms.txt answers + home title, WL-196 installer term + MCB margin + N2 meta, WL-220 E3 label, WL-237 404 rule), plugin v0.8.27 | done: tests green | #44 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 6: phone layout and navigation (WL-198 Next step under the result, WL-238 embed result first + taller list iframe, WL-202 error-code count/jump/phone cards, WL-204 list calculators in two columns on desktop, WL-200 hub task groups, WL-239 table row labels, WL-205 small fixes: counts, 404, touch sizes, scroll cue, picker groups, select labels), plugin v0.8.28 | done: tests green | #45 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 7: technical SEO plumbing (WL-208 one-hop lowercase redirect, WL-209 Person url + Organization areaServed, WL-210 short error-code H2s, WL-211 varied Related anchors, WL-212 outbound-link check in the upkeep report + redirecting source links replaced, WL-213 warm-up cron cleared fully), plugin v0.8.29 | done: tests green | #46 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 8: trust and AdSense readiness (WL-243 protected FC surcharge 0, WL-244 FPA on the FPA month's units, WL-217 ads need a CMP, WL-240 N6 no ads + Open-Meteo credit, WL-215 author bio, WL-219 operator/governing law/short tax FAQ, WL-216 error codes in own words, WL-218 appliance sources), plugin v0.8.30 | done: tests green | #47 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 9: ToU bill path for 5 kW and above (WL-162 c): H1 planner + decision engine and net billing D10/D11 price the bill on ToU rates with a default peak share from data (estimate notice), plugin v0.8.31 | done: tests green | #48 |
| 2026-10-21 | Audit 2026-10-21 fix Phase 9b (owner yes): ToU bill path on the bill pages F1-F12, F14, E1 and N16 for 5 kW and above (peak units + MDI fields, default share estimate notice), plugin v0.8.32 | done: tests green | #49 |

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
