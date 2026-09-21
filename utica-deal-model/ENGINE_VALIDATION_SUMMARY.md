# Utica Deal Model: TypeScript Engine Validation Summary

Date: 2026-09-18
Reference model: `mburkegr/Utica-Model-V7` at commit `92cad9a54028b39e06eafa69acf87ac78db5ecb3` (unmodified)
Golden fixtures: `utica_fixtures/` (harness 1.0.0; primary environment pandas 2.2.3, replicated bit-identically under pandas 3.0.2)
Engine: `ts-engine/engine/*.ts`, 16 modules, no UI dependencies

## 1. Overall result

Every module reconciles to the Python reference within the documented tolerances (`TOLERANCES.md`).
Across the full suite, 426 comparison units were run: 410 passed, and the 16 that report as failed are
the two `flowbackDelay = 0` diagnostic cases (C09a, C09b) at levels L06 and above, where the divergence
is intentional and documented (section 5). No golden-parity unit failed.

| Module | Fixture level | Units | Max abs diff | Max rel diff | Notes |
|---|---|---|---|---|---|
| prepare | L00 | 42/42 | 0 | 0 | acquisition override removed |
| pricing | L03 | 37/37 | 0 | 0 | deck shift also covered by the C11 oil/gas grids |
| ngl | L02 | 46/46 | 0 | 0 | $70 calibration base preserved |
| ownership | L01 | 23/23 | 0 | 0 | |
| well / production | L04 | 23/23 | 0 | 0 | full curve, shut-in identical (286, 328, 1) |
| layers (Dale, carry, scaling) | L05 | 23/23 | 0 | 0 | |
| calendar, legacy parity switch | L06 | 18/18 | 0 | 0 | `calendarMonths = 360` |
| calendar, full life vs C07-FL | L06 | 3/3 | 0 | 0 | |
| promote schedule | L07 | 11/11 | 8.4e-9 | 1.5e-15 | cumulative-sum rounding only |
| promote applied | L08 | 18/18 | 8.4e-9 | 1.5e-15 | |
| promote, full life vs C07-FL | L07/L08 | 4/4 | 8.4e-9 | 1.5e-15 | |
| rollup, legacy parity | L09 | 11/11 | 8.4e-9 | 1.5e-15 | |
| returns (IRR, MOIC, payback, standalone) | L10 | 11/11 | 6.7e-10 | 2.9e-9 | tolerance IRR 1e-8, MOIC 1e-9 |
| rollup / returns, full life vs C07-FL | L09/L10 | 2/2 | 8.4e-9 | 2.5e-9 | |
| sensitivities: bases, axes, isolation | L12 | 6/6 | 0 | 0 | base inputs byte-identical after all runs |
| sensitivities: two-way grids (1,176 cells) | L12 | 30/30 | 6.4e-10 | 9.8e-10 | 13 grids C11, 2 grids C12 |
| sensitivities: scenario matrix (189 points) | L12 | 1/1 | 2.5e-10 | 6.0e-10 | labels corrected to +/- $50/ft |
| reporting: legacy period overlap | L11 | 24/24 | 4.6e-13 | 1.1e-12 | Q4 26..Q4 27 and 2026..2033 |
| reporting: dynamic-period suite | L11 | 50/50 | 9.1e-13 | 1.1e-12 | new behavior, tested separately |
| reporting: EUR / ft | L11 | 23/23 | 6.8e-13 | 1.2e-15 | |
| regression: flowbackDelay = 0 | n/a | 24/24 checks | | | permanent guard |

## 2. Golden parity cases (class G)

| Case | Purpose | Python IRR | Engine IRR (legacy switch) | Status |
|---|---|---|---|---|
| C01 | Baseline single well | 13.0696% | 13.0696% | pass, all levels |
| C02 | File pricing, ethane recovery, distinct switch dates | 15.1907% | 15.1907% | pass |
| C03 | Ownership/scaling variants, dry gas, % severance | 8.6394% | 8.6394% | pass |
| C04 | Economic limit, curve-exhaustion trigger (m286) | 38.6593% | 38.6593% | pass |
| C05 | Slot-level Granite carry, mixed slots | 19.6028% | 19.6028% | pass |
| C06 | Dale + carry, payout reached (ordering rule) | 5.0442% | 5.0442% | pass |
| C07 | Pooled payout group, staggered spuds, late spud | 20.7263% | 20.7263% | pass |
| C08 | Dale never reaches payout; decline-driven limit (m328) | -7.3192% | -7.3192% | pass (no exception path) |
| C09a | Spud before effective, flowbackDelay = 0 | -3.5667% | see section 5 | golden L00..L05 only |
| C10 | Zero curve, IRR failure path | null / MOIC 0.0 | null / MOIC 0.0 | pass |
| C11 | Heterogeneous deal, full sensitivity engine, scenario matrix | 35.6452% | 35.6452% | pass |
| C12 | Deal-level D&C, bid and carry overrides | 19.3574% | 19.3574% | pass |

## 3. Phase 2 reference (class P2)

C07-FL (monkeypatched 600-month Python calendar) is the target for the engine's default full-life
behavior. Engine calculation horizon 2026-10 to 2058-07 (382 months); economic calendar end 2058-07;
fixture rows beyond the horizon verified all-zero. IRR 20.7274% vs Python 20.7274% (diff 3e-17);
MOIC 1.81303 vs 1.81303. Recovered tail cash flow $22,306 across all three slots.

## 4. Intentional divergences from the Python reference (approved)

1. **No 360-month master-calendar cutoff.** Default horizon is the latest slot's full type curve;
   production ends at shut-in or curve month 360; the reported frame ends at the last nonzero month.
   The Python cutoff also removed the final `flowbackDelay` months of every well. `calendarMonths`
   exists only as a parity switch for tests.
2. **Acquisition-cost override removed.** Acquisition is always net acres x $/acre.
3. **`flowbackDelay = 0` handled explicitly.** One aligned row per month; D&C, first-month production
   and acquisition each booked once (regression test `regression_flowback_zero.ts`).
4. **Dale never-payout path returns a normal schedule** (all flags false, null dates), reconciled to
   the pandas 2.2.3 fixture; the pandas 3 exception is not reproduced.
5. **Scenario matrix labels** state the computed +/- $50/ft D&C cases.
6. **Reporting periods are dynamic**: 8 quarters from the quarter containing the model start; annual
   through economic life. Legacy hard-coded columns are reproduced exactly where they overlap.
7. **Payback is full life**; charts accept a display window that is a pure filter.
8. **Explicit labels**: raw (pre-shrink) vs residue (post-shrink) gas; theoretical (pre-recovery) vs
   recovered (post-recovery) NGL volumes; recovered NGL per ft added as a derived audit metric.
9. `nglDiff`, `slot_promote` and alias columns do not exist in the engine.

## 5. Diagnostic cases (class X) and the divergence they document

| Case | Python behavior | Engine behavior | Effect |
|---|---|---|---|
| C09a (flowback 0, spud 2026-07 before effective) | Spud month appears 4 times after the left join and the index-price re-merge; spud-month D&C and first-month production doubled in the rollup | One row; each booked once | Python IRR -3.57% is an artifact; engine +15.71% |
| C09b (flowback 0, spud = effective) | As above, plus acquisition booked twice | Acquisition booked once | Python IRR -6.12% is an artifact; engine +15.44% |

Both cases are golden for L00 through L05 (well-level economics are unaffected) and diagnostic from
L06 onward. They cannot fail the primary parity suite.

## 6. Known Python reference-model bugs (not fixed; reference left unmodified)

1. pandas 3.0.x crash in `build_promote_schedule` when Dale is enabled and no payout group reaches
   its hurdle (empty datetime `Series.map`). `requirements.txt` does not pin pandas.
2. `flowbackDelay = 0` duplicates the spud month (2 x 2 = 4 rows) via `align_to_financial_calendar`
   and the index-price re-merge in `build_all_slot_financials`.
3. Scenario-matrix legend text shows D&C +/- $100/ft while the computation uses +/- $50/ft.
4. The 360-month calendar cutoff truncates the final `flowbackDelay` months of every well.
5. `model.py` lines 1490 and 1492 emit pandas 2.2 downcasting FutureWarnings (behavior changes in pandas 3).
6. Deal Summary "$/Acre Bid" ignores the acquisition override while "Acquisition Cost" honors it
   (moot in the engine; override removed).

## 7. Methodology items preserved and flagged for later review

- MOIC on the deal-level netted monthly series (same-month capex and inflows offset).
- Economic-limit test has no look-ahead: a single negative month shuts the well in permanently, so a
  deck price dip can end a well early in file-pricing mode.
- Type-curve library ends at month 360 with most curves still economic; curve extension is a possible
  Phase 3 with its own methodology decision.
- Promote schedule fields merge onto any slot sharing a payout-group name (validation deferred).

## 8. How to re-run

```
cd ts-engine && npm install && npx tsc && npx tsx tests/run_all.ts
```
`FIXTURE_ROOT` (default `/mnt/user-data/outputs/utica_fixtures`) points the tests at the fixture set.
