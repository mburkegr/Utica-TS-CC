# Utica Deal Model: Phase 1 Completion Summary (2026-09-18)

## Delivered
- Published Artifact: https://claude.ai/artifact/KzC7NEQPUjAStZTGfVmkcx (private to the owner until shared).
  Single self-contained HTML (0.58 MB): React 18 from cdnjs, engine + UI bundle inline, type-curve library and
  price deck embedded. Runtime capability declared: `downloads`.
- Source: `ts-engine/` (engine, ui, tests, data, build.mjs) plus the built `utica-deal-model.html`.

## Scope covered
Deal Setup | Development | Pricing & NGL | Costs & Taxes | Carry & Dale | Results | Sensitivities.
Slot inputs split per tab over one canonical slot array; Slot and Unit sticky on every slot table; Type Curve
editable on Development, read-only elsewhere. Run Model, IRR, MOIC, payback, 8-quarter dynamic table,
full-life annual table, EUR/ft (raw pre-shrink / residue post-shrink), NGL theoretical / recovered labels,
production and cumulative-FCF charts with 5Y/10Y/20Y/Full display window (default 10Y, presentation only),
monthly production/cash-flow detail, eight two-way sensitivities plus carry/entry customs, scenario matrix at
+/- $50/ft. PV is intentionally absent (engine carries no discounting; would be an approved economic change).

## Adjustments requested and made
1. Sensitivities stay on the main thread. Header shows a spinner with what is running; the Run button and every
   Generate button are disabled while any calculation runs; each grid/scenario result carries the base-run
   signature it started from and the reducer discards results from a superseded base run.
2. `downloads` capability implemented. Download CSV buttons for quarterly, annual, monthly production/cash flow,
   every generated two-way sensitivity (IRR and MOIC blocks), and the scenario matrix; copy-to-clipboard kept as
   secondary. Filenames: `<Deal_Name>_Quarterly.csv`, `<Deal_Name>_Annual.csv`,
   `<Deal_Name>_Monthly_Production_Cash_Flow.csv`, `<Deal_Name>_<Table>_Sensitivity.csv`,
   `<Deal_Name>_Scenario_Matrix.csv` (default stem `Utica_Deal`). Buttons appear only when the runtime grants the
   capability; the viewer confirms each save.
3. Structure unchanged: engine locked and separate from React; UI imports only `engine/index`.

## Validation state
`npm test` runs, in order: pricing, ngl, ownership, well, layers, calendar, promote, returns, sensitivities,
reporting reconciliation; flowbackDelay = 0 regression; UI boundary; UI integration (C11 fixture); UI downloads,
running indicator and stale guard. All pass; the only reported failures are the documented C09a/C09b
flowbackDelay = 0 diagnostics from L06 onward. Engine results are unchanged from the approved validation summary.

## Draft autosave
Canonical inputs autosave to localStorage (schema `utica-ui-v1`, 400 ms debounce) and restore on reload;
Reset Model and Clear Draft are on Deal Setup. Recovery only; not a deal library.

## Known limits for manual testing
- Main-thread calculations: about 1 s per sensitivity grid, about 2 s for the scenario matrix; the page is
  unresponsive for that interval by design (Phase 1).
- Download saves prompt the viewer for confirmation each time (platform behavior).
- Reset Model does not clear the saved draft until Clear Draft is pressed (so a reset can be undone by reload).
