# Wattlyst off-page and brand plan (Phase 5)

Status: 2026-10-14. Owner work: these steps happen outside the site and need the owner's own accounts and email.
Rules: specs/seo-rules.md section 7. No paid links, no link exchanges, no guest posts written only for a link,
no keyword-rich anchors we ask for. Every pitch offers something useful (data, a free embed, an answer).

## 1. Link-earning assets (live on the site)
| Asset | URL | Why someone links |
|---|---|---|
| Pakistan Electricity Bill Index (monthly) | /data/pakistan-electricity-bill-index/ | Bill for 100/200/300/500 units in every DISCO, change vs last month, CSV, CC BY 4.0 |
| Pakistan Solar Price Tracker (monthly) | /data/pakistan-solar-price-tracker/ | Panel, inverter, battery and system prices with dated sources, CSV, CC BY 4.0 |
| Embeddable calculators | /embed-calculators/ | Free iframe/script embed for blogs, installers, dealers, forums; visible "Calculator by Wattlyst" credit |
| Calculators with formulas | every tool page | Cited in forum answers and AI answers because each result shows its formula |

## 2. Monthly data release (after each refresh, first week of the month)
1. Refresh data (FPA, QTA, fuel, solar prices; see PROGRESS.md handoff), run the build, merge.
2. Send the press summary paragraph from each data page (section "Summary for journalists") to the list below, one short personal email each, with the page link and the CSV link. Subject idea: "October 2026 electricity bill index: 300 units now Rs ... (data, free to use)".
3. Post the same summary once on the Wattlyst LinkedIn page and X account.

## 3. Outreach targets
- News and tech: Dawn (business desk), Express Tribune (business), Business Recorder, ProPakistani, TechJuice, Profit (Pakistan Today), Geo / The News business pages. Pitch: the Bill Index on the day NEPRA notifies the monthly FPA; the Solar Price Tracker when panel prices or solar tax rules change.
- Solar installers and dealers (Lahore, Karachi, Islamabad, Multan): offer the embed (solar size, net billing, quote checker, panel price) for their site; they keep the credit link.
- Universities and forums: electrical engineering departments (UET Lahore, NUST, NED), PakWheels and other PK forums, r/pakistan, r/solar, PK solar Facebook groups: answer real questions; link only when the tool answers the question (one link, no repeats).
- Expert quotes: answer journalist requests (HARO-style services, X posts from reporters) on bills, solar and loadshedding with the data pages as the source.

## 4. Brand profiles (same name, logo, description everywhere)
Name: Wattlyst. Logo: assets/brand/logo-512.png. Link: https://wattlyst.com/
Short description (160 chars): "Free electricity calculators for homes, solar and Pakistan bills. Every result shows its formula. Monthly bill index and solar price tracker."
Profiles to create: YouTube (short tool walkthroughs: one calculator per video, under 60 seconds), Facebook page, X, LinkedIn company page.
After each profile is live, add its URL to `data/site.json` `organization_same_as` (feeds Organization schema), run the build and merge.

## 5. Tracking (monthly)
Keep a sheet with: month, referring domains (Google Search Console > Links, Bing Webmaster Tools), new links and where from, pages in top 20 (Search Console > Performance, average position <= 20), embeds seen (Search Console links to /embed-calculators/ pages, or a search for "Calculator by Wattlyst").
Phase 5 gate (build-plan.md): first referring domains from real sites; 10+ pages in the top 20.

## 6. Growth phase action plan (2026-10-15)
Owner checklist, indexing steps (Search Console request indexing, Bing import from GSC), brand profile text, email and forum drafts, SERP content-gap ideas waiting for the owner, and the monthly tracking sheet: Claude Doc "Wattlyst growth plan: October 2026", https://claude.ai/code/artifact/cd425966-5265-4b0c-b9e3-9a3d32958ef3 .
Bing and other IndexNow engines get every changed page automatically after each deploy (plugin v0.8.10).
