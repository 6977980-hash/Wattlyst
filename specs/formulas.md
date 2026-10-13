# Wattlyst calculator formulas (single source of truth)

Status: drafted 2026-10-13. Every formula here must pass `calculator-test-cases.json` before a page ships.
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
- Panel for 12V battery: `W = (Ah × V × DoD / η_chg) / PSH` → round up to standard panel
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
- Design current: `I_b = P / (V × PF)`; cable ampacity `I_z ≥ I_b × 1.25`; breaker `I_b ≤ I_n ≤ I_z`
- Voltage drop single-phase: `ΔV = 2 × L × I × ρ / A`, ρ_copper = 0.0225 Ω·mm²/m (≈70 °C); three-phase: `ΔV = √3 × L × I × ρ / A`; target ≤ 3% (lighting) / 5% (other)
- PK cable designation n/d (strands / strand diameter in thou): `A = n × π × (d × 0.0254 / 2)²` → 3/29 ≈ 1.28 mm², 7/29 ≈ 2.98 mm² (sold as 2.5), 7/36 ≈ 4.6 (≈4), 7/44 ≈ 6.9 (≈6)
- Ampacity table: IEC 60364-5-52 values for PVC copper, method B1/C (engineer to load exact table + PK maker datasheets into data/cable-ampacity.json)
