# Utica-Model-V7 Golden Fixtures

Generated from the unmodified Python reference model at a pinned commit. The
production model code was never edited; `model.py` was imported from the
pinned clone and the required `app.py` functions were AST-extracted with
definition-time and body-dependency verification (see `harness/reference_loader.py`).

## Provenance

* Repository: https://github.com/mburkegr/Utica-Model-V7
* Commit SHA and file hashes: `manifest.json` (root) and every `<case>/manifest.json`
* Harness version and source hash: in every manifest
* Generation environment: recorded in the root manifest (`environment`)

## Layout

```
utica_fixtures/
  manifest.json                    root manifest (commit, hashes, environment, per-case status)
  TOLERANCES.md                    numeric comparison rules for the TypeScript reconciliation
  cross_environment_check.json     pandas 2.2.3 vs 3.0.2 numeric comparison of the whole set
  README.md                        this file
  <case>/
    manifest.json                  case class, purpose, monkeypatch record, per-file SHA-256
    L00_inputs.json                raw inputs, app-preprocessed slot table and deal inputs,
                                   prepare_* outputs
    L01_slot_metrics.json          calc_slot_metrics per slot
    L02_ngl_factors.json           build_slot_ngl_factors per slot
    L03_price_series.json          index prices on each slot's well dates and on the deal calendar
    L04_single_well_frames.json    run_single_slot_economics per slot (period 0 + 360 curve months)
    L05_slot_financials_pre_alignment.json
    L06_aligned_slots_with_acquisition.json
    L07_promote_schedule.json      build_promote_schedule (empty when no Dale slot)
    L08_all_slots_post_promote.json
    L09_deal_frame.json            roll_up_deal + index prices (what IRR/MOIC are computed on)
    L10_returns.json               IRR, MOIC, standalone slot returns, payback (legacy and dynamic)
    L11_reporting.json             legacy quarterly/annual tables, dynamic expected tables,
                                   EUR/ft, TC table strings, Dale group audit
    L12_sensitivities.json         (C11, C12) grids, bases, axes, scenario matrix
    P2_full_life_vs_parent.json    (C07-FL only) monkeypatch consistency assertions
```

## Case classes

| Class | Cases | Use |
|---|---|---|
| G (golden parity) | C01 C02 C03 C04 C05 C06 C07 C08 C09a C10 C11 C12 | Primary parity suite |
| P2 (full-life reference) | C07-FL | Phase 2 only; monkeypatched horizon, not production output |
| X (diagnostic) | C09b | Documented expected divergence; never a parity failure |

## Internal assertions that every case passed at generation time

* Stepwise L8/L9 frames identical to `run_deal_model` end-to-end output.
* Stepwise IRR/MOIC identical to `run_deal_model` and `run_deal_metrics`.
* Payback date read back from the production Plotly figure equals the harness interpolation.
* EUR/ft from `calc_slot_eur_metrics` equals the sum of the exported single-well frame / lateral.
* Harness dynamic reporting tables equal the Python legacy tables on every overlapping column.
* (C11) every IRR point read back from the scenario-matrix figure equals the reconstructed grid.
* (C07-FL) rows on or before the legacy calendar end identical to C07; flow columns after the
  last nonzero month are zero; cumulative cash-flow difference equals the recovered tail.

## Environment decision

Primary fixtures were generated under pandas 2.2.3 / numpy 2.2.6. Reason: under pandas 3.0.x the
reference model raises `TypeError: Cannot cast DatetimeArray to dtype float64` in
`build_promote_schedule` whenever Dale is enabled and no payout group ever reaches its hurdle
(empty datetime `Series.map`). Under pandas 2.2.3 the same code returns `NaT`, which is the
intended never-active behavior. `requirements.txt` does not pin pandas. The whole set was
regenerated under pandas 3.0.2 and compared numerically; see `cross_environment_check.json`.

## Reference-model findings recorded during generation (no code changed)

1. pandas 3 incompatibility above (C08 scenario). Recommend pinning `pandas<3` in the reference
   repository or handling the empty-mapper case; decision belongs to the model owner.
2. `model.py` lines 1490 and 1492 (`fillna(False).astype(bool)` on object columns) emit pandas 2.2
   FutureWarnings about silent downcasting; behavior changes in pandas 3.
3. The 360-month calendar cutoff removes the final `flowback_delay` months of every well, not only
   late spuds, because the calendar starts at the effective date while production starts later.
   C01 (spud = effective, flowback 4) loses months 357 to 360 of its curve.
4. `flowback_delay = 0` with spud month = effective month books acquisition twice (C09b).
5. Scenario-matrix legend text shows D&C +/-100 while the computed cases are +/-50.
