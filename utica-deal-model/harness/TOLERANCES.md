# Fixture Comparison Rules and Numerical Tolerances

These rules govern how the TypeScript engine is reconciled against the Python
golden fixtures. Fixture JSON stores floats at 17 significant digits so every
IEEE-754 double round-trips exactly, but comparisons are numeric, never string
equality. A value `a` (TypeScript) matches `b` (Python) when

    |a - b| <= atol + rtol * |b|

with the per-field tolerances below. Booleans, dates, strings, integer counts
and null-ness are compared exactly.

## Case classes

| Class | Meaning | Reconciliation rule |
|---|---|---|
| G | Golden parity | Every exported level must match within tolerance. Any miss fails the primary parity suite. |
| P2 | Phase 2 full-life reference (monkeypatched horizon) | Compared only when the engine runs with an unlimited calendar. Not a production-model output; never mixed into the G suite. |
| X | Diagnostic / documented expected divergence (C09b) | Compared and reported. The documented divergence (acquisition booked twice by Python) is expected; the case can never fail the primary parity suite. |

## Tolerances by quantity

| Quantity (typical columns) | atol | rtol | Notes |
|---|---|---|---|
| Ownership ratios: `working_interest`, `*_working_interest`, `ownership_factor`, `*_net_wells`, `dale_initial_interest_pct`, `promote_ownership_factor` | 1e-12 | 1e-12 | Pure arithmetic on inputs |
| NGL factors: `shrink`, `ngl_pct_of_wti`, `sales_volume_factor`, `shrink_contribution`, `aggregate_ngl_price` | 1e-12 | 1e-12 | |
| Prices: `index_*_price`, `local_*_price`, `deck_*_price` | 1e-9 | 1e-12 | |
| Volumes (bbl, Mcf, BOE per month): `*_production`, `*_royalty_volumes`, `*_scaled`, `slot_gross_*`, `slot_net_*` | 1e-9 | 1e-9 | |
| Money per month: revenue, LOE, tax, capex, `slot_asset_purchase`, `*_cash_flow`, `operating_cf`, `slot_promote_ocf` | 1e-6 | 1e-9 | Dollar values up to ~1e7 |
| Cumulative money: `promote_cumulative_*`, `cum_*` | 1e-5 | 1e-9 | Accumulation of ~360 terms |
| `promote_running_multiple` | 1e-10 | 1e-10 | Ratio of cumulatives |
| Flags: `economic_limit_reached`, `well_shut_in`, `carry_reversion_active`, `promote_hurdle_reached`, `promote_active`, `dale_*` booleans | exact | | Any flag flip is a failure regardless of magnitude elsewhere |
| Dates: `date`, `promote_hurdle_date`, `promote_effective_date`, calendar start/end | exact (ISO day) | | |
| `period` | exact integer | | Includes the period-0 convention on empty calendar rows |
| IRR (`irr`, standalone slot IRR, sensitivity grids) | 1e-8 | 0 | Solver differences; both sides must agree on `null` |
| MOIC (`moic`, standalone, grids) | 1e-9 | 1e-9 | Both sides must agree on `null` vs `0.0` |
| Payback date | 1 second | | Interpolated timestamp; compare as seconds since epoch |
| Payback years | 1e-9 | | |
| EUR per ft | 1e-9 | 1e-9 | |
| Reporting tables (quarterly/annual numeric) | 1e-6 | 1e-9 | Legacy columns are golden; NaN in Python (no rows in period) must be `null` or absent in TS |
| Sensitivity axes (`x_values`, `y_values`, bases) | 1e-10 | 0 | Axis construction is deterministic arithmetic; dates exact |
| Weighted spud month (`base_spud_month`) | exact month | | Uses Python `round()` (banker's rounding); TS must replicate |

## Null and dtype rules

* Python `NaN`, `NaT`, `None` are all exported as `null`. The exporter records
  each DataFrame column's pandas dtype so the TS side knows whether a `null`
  came from a float, a datetime or an object column.
* Bool columns that became `object` dtype after the calendar left-join contain
  `null` on empty calendar rows in Python. TS may hold `false` there; the
  comparison treats `null` vs `false` on those specific columns as a match
  only when the row has no well data (`period == 0` and all volumes zero).
* `slot_promote` and `operating_cf_shut_in` are legacy alias columns; TS need
  not emit them. Missing alias columns are not failures.

## Legacy vs dynamic reporting

* `L11_reporting.legacy_python_golden` is the parity target on the columns it
  contains (Q1 26..Q4 27, 2026..2033).
* `L11_reporting.dynamic_expected_harness_derived` documents the intended new
  behavior (8 quarters from calendar start, annual through economic life). It
  is harness-derived and has already been asserted equal to the legacy table
  on every overlapping column. It is tested as a separate suite.
* `L10_returns.payback_legacy_python_golden` (2040 cutoff, read from the
  production figure) is golden; `payback_dynamic_expected` is the new
  full-life behavior and belongs to the dynamic suite.

## Order and alignment

* Row order within every frame is Python's order (slot_id, then date). Compare
  by `(slot_id, date)` key, not by position, so row-order differences are
  reported as alignment problems rather than value mismatches.
* Sensitivity grids are compared cell by cell with `y_values` as rows and
  `x_values` as columns.
