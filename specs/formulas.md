# Wattlyst calculator formulas (single source of truth)

Status: drafted 2026-10-13, implemented in `engine/` 2026-10-13 (Phase 1). Every formula here must pass `calculator-test-cases.json` before a page ships.
All defaults below live in `data/defaults.json` (the engine reads them from there; this table documents them).
Engineer review required before launch (see engineer-reviewer.md). Units are SI unless stated.

## Global defaults (editable by user, shown on the page)
| Symbol | Meaning | Default | Why |
|---|---|---|---|
| V_1ph | Single-phase voltage | 230 V (PK), 120 V (US toggle) | NEPRA Performance Standards: 400/230 V, 50 Hz, ±5% |
| V_3ph | Three-phase line-to-line | 400 V | same |
| PF | Power factor (AC loads) | 0.8 for mixed/motor loads, 1.0 resistive (heater, iron, geyser) | industry convention |
| η_inv | Inverter/UPS efficiency | 0.85 (UPS/older), 0.90–0.93 (modern hybrid) | typical datasheets |
| DoD | Usable depth of discharge | lead-acid/tubular 0.5, LiFePO4 0.9 | battery life convention |
| η_chg | Charging efficiency | lead-acid 0.85, LiFePO4 0.95 | typical |
| margin | Sizing safety margin | 1.25 | continuous-load practice |
| yield | PV output kWh per kWp per day | from data/cities-pk.json (Global Solar Atlas) | Lahore 4.0, Karachi 4.6 ... |
| PR | Performance ratio (if PSH used instead of yield) | 0.78 | matches GSA yield/PSH |

## A. Conversions
- DC: `I = P / V`; `P = V × I`
- AC single-phase: `I = P / (V × PF)`; `P = V × I × PF`
- AC three-phase (V = line-to-line): `I = P / (√3 × V × PF)`; `P = √3 × V × I × PF`
- kW = W / 1000. `kW = kVA × PF`; `W = VA × PF` (UPS VA ratings: line-interactive often PF 0.6, online 0.8–1.0; read the label)
- `Wh = Ah × V`; `Ah = Wh / V`; usable Wh = Wh × DoD
- 1 unit = 1 kWh. `units = W × hours / 1000`
- Units from amps (E6 "Amps" mode, owner-approved 13 Oct 2026, same page, no separate URL): `units = V × A × PF × hours / 1000` (DC: PF = 1; AC 1-phase default V 230 / 120 US, PF editable; 3-phase adds √3). From amp-hours: `units = Ah × V / 1000`. Keywords "amps to kwh", "amps to units", "amp hours to units" are supporting keywords of E6.
- 1 HP = 745.7 W (motor input watts ≈ HP × 745.7 / motor efficiency; default motor eff 0.8)

## B. Battery / UPS
- Runtime (AC load through inverter): `t_h = (Ah × V_bank × DoD × η_inv) / P_load`
- Runtime (DC load): same with η_inv = 1
- Series strings: V adds, Ah same. Parallel: Ah adds, V same.
- Required bank: `Ah = (P_load × t_h) / (V_bank × DoD × η_inv)`; batteries = ceil(Ah / Ah_per_battery) × (V_bank / V_battery)
- Loadshedding recharge check: `t_recharge = (Ah × DoD) / (I_charge × η_chg)`; OK if `t_recharge ≤ grid hours between outages`
- UPS capacity: `P_max = VA × PF`; reject if P_load > P_max or surge > inverter surge rating
- Peukert (optional, lead-acid at high current): off by default; if enabled use k = 1.1–1.3 and show the note. Do not apply to LiFePO4.
- Guard: P_load ≤ 0 → error, never Infinity/NaN.

## C. Inverter & generator sizing
- Running total: `P_run = Σ P_i` (only appliances on at the same time)
- Surge: `P_surge = P_run + max_i(P_start_i − P_run_i)` (only the largest motor starts at once)
- Inverter: continuous ≥ `P_run × margin`; surge rating ≥ `P_surge`; `kVA = P_run × margin / PF / 1000`
- Generator: `kVA = max(P_run × margin, P_surge) / PF / 1000`, PF 0.8 (generator nameplate convention)
- Starting factors (defaults, user-editable, engineer to confirm): non-inverter AC/fridge/motor compressor 3×, fridge 4× of small running, inverter AC 1× (soft start), resistive 1×.

## D. Solar
- Daily energy: `E = monthly_units / 30` (or appliance sum)
- Array size: `kWp = E / yield_city` (preferred) or `E / (PSH × PR)`
- Panels: `ceil(kWp × 1000 / panel_W)`; roof area ≈ panels × 2.6 m² (585 W class, ~2.28 × 1.13 m) — confirm per datasheet
- Solar battery: `Ah = (E_night × days) / (V_bank × DoD × η_inv)`
- Panel for 12V battery: `W = (Ah × V × DoD / η_chg) / (PSH × PR)` (PR 0.78: panels rarely deliver STC rating; covers heat, dust, wiring, PWM loss) → round up to standard panel
- Charge controller (MPPT): `A = P_array / V_battery × 1.25`; PWM: `A = Isc × N_parallel × 1.25`
- On-grid sizing cap: net billing size ≤ sanctioned load (NEPRA Prosumer Regulations 2026, secondary sources)

## E. Load, AC, units
- AC units: `units_day = avg_kW × hours`; inverter AC avg_kW default 1.0 for 1.5 ton (range 0.5–1.4, user slider); rated max from spec sheet (Haier 1.5 ton: 410–1,950 W input). Non-inverter 1.5 ton default 1.8 kW while compressor runs × duty 0.8.
- Sanctioned load check: total kW vs sanctioned kW; amps = W / (230 × PF)

## F. Bill (Pakistan A-1 domestic) — data from data/tariff-pk-2026.json, never hard-coded
- Protected (≤200 units every one of last 6 months, non-ToU, <5 kW): slab-wise, one-previous-slab benefit.
- Unprotected: all units × rate of band reached.
- Fixed charge: `Rs/kW × sanctioned kW` from the reached band.
- Add-ons (secondary, monthly re-check): FC surcharge Rs3.23/unit, QTA (quarterly), FPA (monthly input), GST 18%. Show each line separately with source and date.
- Net billing: `import × slab tariff − export × buyback`; buyback default 11 (editable, label "not yet confirmed on a NEPRA page").

## W. Wiring (advisory, always with "confirm with a licensed electrician")
- Design current: `I_b = P / (V × PF)`; breaker `I_n` = next standard size ≥ I_b; cable ampacity `I_z ≥ max(I_b × 1.25, I_n)` so `I_b ≤ I_n ≤ I_z` always holds; margin < 1 rejected
- Voltage drop single-phase: `ΔV = 2 × L × I × ρ / A`, ρ_copper = 0.0225 Ω·mm²/m (≈70 °C); three-phase: `ΔV = √3 × L × I × ρ / A`; target ≤ 3% (lighting) / 5% (other)
- PK cable designation n/d (n strands, strand diameter d in thou = 0.001 inch): `A = n × π × (d_mm / 2)²` with `d_mm = d_thou × 0.0254 = d_inch × 25.4` → 3/29 ≈ 1.28 mm², 7/29 ≈ 2.98 mm² (sold as 2.5), 7/36 ≈ 4.6 (≈4), 7/44 ≈ 6.9 (≈6). Engine input `strand_in` is in inches (0.029 for /29).
- Ampacity table: IEC 60364-5-52 values for PVC copper, method B1/C (engineer to load exact table + PK maker datasheets into data/cable-ampacity.json)

## G. New tools (added 13 Oct 2026). Assumptions marked [ENGINEER] need engineer sign-off before launch.
- **Bill audit (N1):** `days = reading_date − previous_reading_date`; `units_30 = units × 30 / days`. Flags: days > 31 (billing-cycle stretch can push slab: recompute bill at units_30 and show the difference); units − previous-year-same-month > 50% (spike); protected status lost although all 6 months ≤ 200 (cite history); FPA/QTA line ≠ notified rate × units; "detection units" line present → explain the user's right to ask for the detection proforma. Output is an estimate, never an official finding.
- **Sanctioned load (N4):** `connected_kW = Σ rated_W / 1000`; `demand_kW = connected_kW × diversity` (default 0.6 home, [ENGINEER]); recommend `max(1, ceil(demand_kW))` kW (a motor's starting surge lasts seconds and does not register on the MDI, so it is shown only as a note for inverter/generator sizing, [ENGINEER]); warn at ≥ 5 kW (ToU meter mandatory, not protected) and show net-billing cap = sanctioned kW.
- **Winter heating (N5):** heat needed Q (kW) user input or from room size; AC heat mode `cost/h = Q / COP × tariff` (COP default 3.0 at ~7 °C outdoor, user editable, [ENGINEER]); electric heater `cost/h = Q / 1.0 × tariff`; gas heater `cost/h = Q / η_gas × 3.6 / CV_gas × gas_price` (η 0.8 for flued, CV ≈ 37 MJ/m³ — confirm against OGRA/SNGPL data; gas price input).
- **Solar quote checker (N3):** `Rs_per_W = total_price / (kWp × 1000)`; compare with data/solar-prices.json ranges (dated); checklist of included items (structure, DC/AC cables, breakers/SPD, earthing, net-billing fees, warranty years); verdict = below / within / above range. Never names an installer as cheating.
- **Solar forecast (N6):** `units_day = kWp × Σ_hours(GTI_forecast_kW/m²) × PR` using a free forecast API (Open-Meteo GTI or radiation × transposition); PR 0.78; show as estimate with cloud cover.
- **UPS vs solar vs generator 5-year cost (N7):** `TCO = capex + Σ_years(energy_cost + maintenance) + replacements` (lead-acid every 2 yrs, LiFePO4 8+ yrs, [ENGINEER]); generator fuel `L/h = fuel_rate(kVA, load%)` from data/generator-fuel.json; grid recharge energy for UPS = backup_kWh / (η_chg × η_inv).
- **E-bike charging (N8):** `kWh_charge = Ah × V / 1000 / η_charger` (η 0.85); `Rs_per_charge = kWh_charge × tariff`; `Rs_per_km = Rs_per_charge / range_km`.
- **AC temperature (N9):** `saving% = per_degree% × (T_new − T_old)`; per_degree default 6%/°C as an editable rule of thumb, labelled as approximate [ENGINEER]; `units_saved = monthly_AC_units × saving%`.
- **Inverter AC payback (N10):** `annual_saving = (units_noninv − units_inv) × tariff`; `payback_months = price_difference / (annual_saving / 12)`.
- **Series/parallel (N11):** `V_total = n_series × V_cell`; `Ah_total = n_parallel × Ah`; `kWh = V_total × Ah_total / 1000`. Only identical batteries; warn on mixing chemistries/ages.
- **Cleaning loss (N12):** `loss_kWh_day = kWp × yield × soiling%`; soiling% grows `rate%/day × days_since_clean` capped at 25% (rate default 0.3%/day for dusty cities, [ENGINEER], research-based); `Rs_lost = loss_kWh × tariff_or_buyback`; clean when Rs_lost_since_clean > cleaning_cost.
- **Mosque/shop solar (N13):** load profile templates (prayer-time AC/fan blocks, Jummah peak; shop 10:00–22:00) → daily kWh → solar sizing (section D).
- **Autonomy (N14):** `days = (Ah × V × DoD × η_inv) / (daily_load_Wh − daily_solar_Wh_cloudy)`; cloudy solar = normal × 0.2–0.4 (user editable).

## Phase 3 tools (added 2026-10-13, Wave 1 pages). Assumptions marked [ENGINEER] need engineer sign-off.
- **Appliance rows** (E1 home load, D4 inverter, generator, D8 solar from loads): rows `{ id, watts, qty, hours }` (plain `{ run, start, qty }` rows are accepted too). `id` from data/appliances.json gives running W, starting W and typical hours/day; `watts` overrides running W (starting W scales in proportion); `id` "custom" or blank needs `watts`; qty ≥ 0 (default 1); hours 0–24. Energy per row uses the appliance's average draw `avg_w` where one is known (inverter ACs, section E), scaled with any watts override; amps and peak always use the running/starting watts.
- **Home load (E1):** `P_run = Σ run × qty`; `P_peak = P_run + max(start − run)` (section C, one motor starts at a time); `I = P / (V × PF)` at running and at peak; `units_day = Σ run × qty × hours / 1000`; `units_month = units_day × days` (30); optional `Rs = units_month × tariff` and sanctioned-load check (section E).
- **Add an AC (E4):** `P_new = P_current + P_ac_run`; `P_peak = P_current + P_ac_start`; amps as above; `within = P_new / 1000 ≤ sanctioned kW`; the AC's own circuit (MCB, curve, cable) uses the MCB size rule (W3) with the AC as the appliance, so this page and the wiring pages print the same breaker.
- **Generator for an AC (C6):** loads = [AC running/starting from data/appliances.json] + optional other loads (run, start ≥ run); section C generator formula; `standard_kva` = next size in data/defaults.json `standard_generator_kva` [ENGINEER].
- **Generator for a pump (C5):** `P_run = HP × 745.7 / η_motor` (section A, η 0.8); `P_start = P_run × k_start` (`start_factors.motor` = 3, [ENGINEER]); then section C.
- **UPS backup (B5):** `P_max = VA × PF`; load > P_max (or surge > surge rating) is an error, never a shorter time; otherwise runtime from section B.
- **Solar for an AC (D5) and solar from loads (D8):** `E_day = avg_W × hours / 1000` (AC: `avg_w` from data/appliances.json, section E; loads: Σ run × qty × hours); `kWp_energy = E_day / yield`; `kWp_power = P_run / 1000 / PR` (the array must carry the running load at midday without a battery); `kWp = max(kWp_energy, kWp_power)`; panels = ceil(kWp × 1000 / panel_W); inverter continuous ≥ `P_run × margin`, surge ≥ `P_start`; optional night battery `Ah = (P_run × night_hours) / (V_bank × DoD × η_inv)` (section D, LiFePO4 DoD 0.9, hybrid η 0.9, V_bank default 24 V).
- **Panel for a 12 V battery (D6) additions:** `fitted_W` = standard panel size chosen; `t_charge = (Ah × V × DoD / η_chg) / (fitted_W × PR)` hours of peak sun, `days = t_charge / PSH`; MPPT controller `A = fitted_W / V × margin` → next standard size.
- **AC units (E5):** `avg_kW` = `avg_w` of the chosen AC in data/appliances.json ÷ 1000 (inverter 1 ton 0.65, 1.5 ton 1.0, 2 ton 1.3 [ENGINEER]; non-inverter = running W × duty 0.8), or a custom kW; `units = avg_kW × hours`; cost lines `= units × tariff` per hour, day and month.
- **Net billing vs old net metering (D10):** old net metering `units_net = max(0, import − export)`, billed at the band that `units_net` reaches (energy only); `extra_vs_net_metering = max(0, net_billing_energy − net_metering_energy)`; excess export under old rules carries forward as units.
- **Wire size (W1, W2):** `I_b` from section W (an appliance id sets P: inverter AC at its maximum rated input `starting_w`, others at running W); breaker `I_n` = next standard size ≥ I_b, but ≥ `I_b × margin` for motor-type loads (motor, compressor, inverter compressor, high inrush) [ENGINEER]; cable `I_z ≥ max(I_b × margin, I_n)` from data/cable-ampacity.json (IEC 60364-5-52 Table B.52.4, method B1 conduit in wall or C clipped direct) with a minimum size per circuit (lighting 1.0 mm², other 2.5 mm² [ENGINEER]); the chosen cable is the smallest that also keeps `ΔV = 2 × L × I_b × ρ / A` (√3 × L × I × ρ / A three-phase) within 3% lighting / 5% other. Pakistani n/d sizes are shown as the exact size, else the next size up, never smaller. Errors (not undersizing) when no listed cable or breaker fits.
- **MCB size (W3):** `I_n` as above; curve from load type (IEC 60898-1: B 3–5 × I_n, C 5–10 × I_n, D 10–20 × I_n); the matching cable is the smallest with `I_z ≥ max(I_b × margin, I_n)` (method B1) above the minimum size.

## Engine contract and clarifications (Phase 1, 2026-10-13)
Each calculator is `engine/<file>.js` → `calc(inputs, data)` returning `{ ok: true, ...values }` or
`{ ok: false, error: code, field }`. `data = { defaults, tariff, cities }` from `data/*.json`. The `calc`
id is the one used in `calculator-test-cases.json`. Error codes map to user messages in `engine/messages.js`.
These rules fill gaps in the sections above; they are part of the formulas:
- **Rounding up** (panels, batteries, kW, standard sizes) ignores floating-point dust: 2.9999999 / 3.0000001 → 3.
- **Standard sizes** (panels, charge controllers, breakers) come from `data/defaults.json`; the result shows the next size up.
- **Battery bank count**: `series = V_bank / V_battery` (must be a whole number, else error), `strings = ceil(Ah_required / Ah_battery)`, `batteries = series × strings`.
- **UPS capacity** output key is `can_run` (`ok` is reserved for the result envelope). If one surge field is filled the other is required; both blank skips the surge check.
- **Standard sizes exceeded** (breaker > 63 A, controller > 100 A): result carries `above_standard_sizes: true` and the UI says to split the circuit/array or consult an engineer.
- **Loads list**: `start` defaults to `run`; `start < run` is an error; `qty` multiplies running watts; only the largest single start step is added for surge.
- **Sanctioned load**: recommended = max(min_sanctioned_kw, ceil(demand)); empty appliance list is an error; ToU warning when recommended ≥ `tou_threshold_kw` (5).
- **Bill, lifeline**: only when the user ticks lifeline; ≤ 100 units; all units at the lifeline band reached (1–50 → 3.95, 51–100 → 7.74), no fixed charge, no QTA. [VERIFY against a DISCO lifeline bill]
- **Bill, protected**: > 200 units is an error (protected cannot apply). **Bill, ≥ 5 kW**: must use the ToU calculation (`bill_tou`); the flat bill AND net billing refuse it. ToU fixed basis = max(`tou.fixed_min_fraction` (0.5) × sanctioned, MDI), from the tariff file.
- **Bill total**: subtotal = energy + fixed + FC surcharge × units + QTA × units + FPA × units; GST % applied to the subtotal. QTA/FPA may be negative (shown as credit lines); the subtotal is never below 0. Add-on rates are inputs; a blank field uses `tariff-pk-2026.json` `addons_secondary` (FC 3.23, GST 18, QTA for the chosen quarter `period`, FPA if notified else 0), each shown with its source and date. [VERIFY GST base and whether FC surcharge applies to lifeline]
- **Net billing**: if export credit > import energy charge, `net_energy_rs = 0` and the excess is `carry_forward_rs` (never a negative bill).
- **Bill audit (N1)**: slab jump = the 30-day-equivalent units fall in a LOWER unprotected band than billed units (a short cycle never flags). Fair estimate = all billed units × rate of the band the 30-day equivalent reaches + that band's fixed charge; `extra_rs = billed − fair` (min 0). Long cycle = days > 31. Spike = units > previous-year units × 1.5.
- **AC temperature (N9)**: saving capped at 100%; lowering the set point returns `extra_pct`/`extra_units`, never a negative saving. Set points limited to 16–30 °C.
- **Cleaning (N12)**: with a cleaning cost, `clean_after_days` = first day n where Σ_{k=1..n} kWp × yield × min(rate × k, cap) × tariff > cleaning cost (searched up to 365 days).
- **TCO (N7)**: `replacements = floor((years − ε) / life_years)`; fuel L/h table comes later from `data/generator-fuel.json`, until then energy cost per year is an input.
- **Autonomy (N14)**: if cloudy-day solar ≥ load, no day count is shown; the message says the solar covers the load.
- **Voltage drop**: if ΔV ≥ supply voltage the cable is rejected with a clear message (no negative voltage at load).
- **Inputs**: PF/efficiency/DoD must be 0.05–1, voltages ≥ 1 V; lifeline bills default FC surcharge and GST to 0 until verified (user can enter them); plain decimal text ("1500", "12.5") is accepted (hex/exponent text rejected), any value above 1e12 is rejected; yes/no ticks accept true/'true'/'on'/'yes'/1; blank uses the default; anything non-numeric, negative where not allowed, PF/efficiency/DoD outside (0, 1] is an error, never NaN.
- **Data in the engine**: `data = { defaults, tariff, cities, appliances, cables }`; `appliances` is data/appliances.json keyed by id, `cables` is data/cable-ampacity.json (loaded 2026-10-13 from IEC 60364-5-52 Table B.52.4, engineer to confirm).
- **Not yet in the engine** (need data first): N2 inverter error codes (`data/inverter-codes.json`), N6 solar forecast (live API), N13 mosque/shop load templates, generator fuel table.
- **Open engineering questions for the PEC engineer** (from the AI Engineer Reviewer, 13 Oct 2026): compressor start factor 3× may be low (locked-rotor 4–7×); generator kVA treats starting watts at PF 0.8 although start PF is lower; PWM controllers should also check array Voc; lead-acid recharge ignores the absorption stage (optimistic); AC temperature saving is linear 6%/°C (label as approximate); unprotected "all units at reached band" for 101–200 must be checked against SRO 279(I)/2026 text; lifeline eligibility may also need ≤ 1 kW sanctioned; for a formerly protected consumer, a long cycle's real overcharge (loss of protected tariff) exceeds `extra_rs`.
