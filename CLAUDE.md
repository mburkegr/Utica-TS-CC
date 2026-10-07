# Utica-TS-CC

The Master Utica Artifact: a validated TypeScript oil-and-gas Deal Model and
economics engine, plus a GIS module, shipped as one self-contained HTML
artifact. Everything lives under `utica-deal-model/`.

## Standing rules

1. **The economics engine is locked.** `engine/` is reconciled line by line
   against a pinned Python reference. Do not change economic methodology
   without the owner's explicit approval. Presentation changes are fine;
   formula changes are not.
2. **Branch and PR.** Branch from current `main`, use a descriptive feature
   branch, open a PR back into `main`. Merge with a merge commit, not squash
   or rebase, so history stays readable.
3. **No unrelated cleanup or refactors.** Do what was asked. If you spot
   something else worth fixing, say so rather than folding it in.
4. **Run the full suite before calling anything done**, and report the actual
   results. A claim of "tests pass" without the output is not a result.
5. **Make the judgement call.** The owner prefers a decision with its
   reasoning stated over a list of options. Ask only when getting it wrong
   would be expensive or hard to undo.
6. **Verify, don't assert.** Where this repo's history says a thing is true,
   it is because someone measured it. Keep that up: run the counterfactual,
   diff the live page, check the number.

## The artifact is a manual deployment

This is the single most common source of confusion, so be explicit about it
whenever it comes up.

`dist/index.html` is a frozen, self-contained snapshot. **It contains zero
GitHub references and never auto-updates.** Merging to `main` changes nothing
that the owner can see. A change becomes visible only after a rebuild and a
republish of the artifact.

Two kinds of data behave differently:

| Data | How it ships | To update |
|---|---|---|
| Price deck, type-curve library (`data/*.json`) | **inlined** into `dist/index.html` by esbuild | rebuild + republish |
| GIS layers (`gis-data/layers/*.geojson`) | **fetched** at runtime from the artifact's own asset store (`/_blob/<id>`) | upload the asset, record the id, rebuild + republish |

The GIS asset procedure is in `utica-deal-model/ARCHITECTURE_GIS.md`
("Publishing a new dataset"). Asset ids are recorded in
`gis-data/manifest.json` via `manifest.mjs set-asset` and read by the build,
never hardcoded.

Before republishing, read the live page and diff it against what you are
about to publish. That check has already caught one silent regression (a
build that reverted the artifact's title).

## Where things are

| Path | What |
|---|---|
| `utica-deal-model/README.md` | structure, commands, how to refresh the price deck |
| `utica-deal-model/ENGINE_VALIDATION_SUMMARY.md` | what reconciliation proves, approved divergences, the two-deck split (section 9) |
| `utica-deal-model/ARCHITECTURE_GIS.md` | layer registry, adding a layer, publishing assets |
| `engine/` | the locked calculation engine; public surface is `engine/index.ts` |
| `ui/` | React; reaches the engine only via `engine/index`, the GIS library only via `gis/index` |
| `gis/` | framework-free GIS library, no React and no engine imports |
| `tests/` | 26 test programs, run in order by `tests/run_all.ts` |

`tests/ui_boundary.test.ts` enforces those import rules. Adding a GIS layer
is a registry entry plus data plus CSS tokens; the map has no per-dataset
logic, so resist adding any.

## Generated vs tracked

Generated files are committed, but never hand-edited. CI rebuilds the price
deck and `dist/index.html` and fails on any diff; it checks the GeoJSON
layers against the digests in `gis-data/manifest.json` rather than rebuilding
them.

| Generated | From | By |
|---|---|---|
| `data/price_file_library.json` | `data/source/price_deck.csv` | `data/scripts/build_price_deck.py build` |
| `gis-data/layers/ODNR_Units_DC_EPSG4326.geojson` | `gis-data/source/unit_dc.csv` | `gis-data/scripts/build_unit_dc.py build` |
| `dist/index.html` | all source | `npm run build` |

The two CSVs are the tracked source of truth, deliberately, so a single new
unit or a single corrected month is a one-line diff rather than a new
spreadsheet.

`data/validation_price_deck.json` is frozen. The reconciliation suite reads
it, not the live deck, so refreshing prices cannot move a validation result.
Its sha256 is pinned in `tests/price_deck.test.ts`. If the Python golden
fixtures are ever regenerated, replace the deck and the hash together.

## Commands

```bash
cd utica-deal-model
npm ci
npm run typecheck
FIXTURE_ROOT=/path/to/utica_fixtures npm test     # full suite, 26 modules
npm run build                                      # writes dist/index.html
```

The golden fixtures ship zipped at `fixtures/utica_fixtures.zip`; unzip them
and point `FIXTURE_ROOT` at the `utica_fixtures` directory inside. The build
is deterministic, so a rebuild that changes `dist/index.html` means source
changed.

## Working habits that have paid off here

- Stage files explicitly. `git add -A` once swept 2,720 `node_modules` files
  into a commit here. Read the whole `git status`, unfiltered, before
  committing.
- Rebuild and commit `dist/index.html` in the same PR as its source. CI
  fails the PR otherwise.
- Raw source values stay in the data; translate at display time
  (`unitStatusLabel`, `operatorOf`, `dcPerFt`, `hearingDate`). The ODNR
  shapefile's spelling of a unit name is authoritative.
- When a test passes, check it could have failed. Several "passing" checks
  here were vacuous until the assertion was tightened.
