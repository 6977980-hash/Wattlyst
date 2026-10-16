# Audit regression tests, 15 October 2026 (do not merge as is)

Read-only audit of wattlyst.com at main 1b6520f (v0.8.15). Full report: `REPORT.md` (same as
`/mnt/project-files/electricity-tool-hub/audit/wattlyst-audit-2026-10-15-full.md`), findings WL-89 to WL-155.

Each folder holds an independent reference model (it does not import the engine module it checks) and node:test files:
- `decision/decision.test.mjs`: homepage decision engine and N7 (6 OK tests, 8 `DEFECT DE-xx` tests).
- `mathA/audit-math-a.test.js`: converters, battery, generator, fuel, wiring, N4, N11, N18 (18 OK, 16 `DEFECT MA-xx`).
- `mathD/verify.test.mjs`, `mathD/defects.test.mjs`: solar and prices (27 OK, 9 `DEFECT MD-xx`).
- `mathF/verify.test.mjs`, `mathF/defects.test.mjs`: bills and load (14 OK, 8 `DEFECT MF-xx`).

Run: `node --test audit/2026-10-15/<folder>/<file>` (Node 20+). `DEFECT` tests fail today on purpose; each must pass after
its fix. Move a test into `tests/` in the same PR that fixes its finding (rule 2: formulas.md + spec cases + tests together).
This folder sits outside `tests/`, so `npm test` is unaffected, and it is not blocked by `.htaccess`: never merge it to main as is.
