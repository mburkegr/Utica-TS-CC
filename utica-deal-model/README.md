# Utica platform

One self-contained HTML artifact hosting peer modules: the **Deal Model** (a
deterministic TypeScript engine reconciled against the original Python/Streamlit
model, plus its React interface) and **GIS** (Leaflet map over EPSG:4326
reference geography with a registry-driven Layer Library). See
`ARCHITECTURE_GIS.md` for the GIS design.

## Layout

| Path | Contents |
|---|---|
| `engine/` | The calculation engine (17 modules). No UI imports. Public surface is `engine/index.ts`. |
| `ui/` | React interface. Imports the engine only through `engine/index`. `ui/shell/` is the master `Deal Model | GIS` navigation; `ui/gis/` the GIS module. |
| `gis/` | Framework-free GIS library: layer registry, loaders, geometry, map adapter. No engine or React imports. |
| `gis-data/` | Browser-ready GeoJSON (`base/` reference layers, `layers/` optional datasets), `manifest.json` with published asset ids, maintenance script. |
| `tests/` | 25 test programs: Python-fixture reconciliation, regressions, UI integration, master shell, GIS data/registry/store/UI. |
| `data/` | Type-curve library and price deck exported from the source workbooks as JSON. |
| `diagnostics/` | `compare_inputs.ts`: runs a deal in full-life and 360-month parity mode and diffs the monthly cash flows against a Python audit export. |
| `harness/` | Python harness that generated the golden fixtures from the pinned reference model. |
| `fixtures/` | `utica_fixtures.zip`: the golden fixture set (14 cases, L00-L12 exports, manifests). |
| `dist/` | The built artifact (`index.html`), published with `capabilities: {downloads: true, assets: {}}`. |

## Commands

```bash
npm install
npm run typecheck     # tsc
npm test              # full suite: engine reconciliation + UI tests
npm run build         # writes dist/index.html
```

`npm test` expects the fixtures unzipped; point it at them with
`FIXTURE_ROOT=/path/to/utica_fixtures`.

## Provenance and validation

The engine is reconciled to the Python reference at commit `92cad9a5` of
`Utica-Model-V7`. Every module matches within documented tolerances; see
`ENGINE_VALIDATION_SUMMARY.md` for the case-by-case results, the intentional
divergences (no 360-month calendar cutoff, acquisition override removed,
explicit `flowbackDelay = 0` handling, per-slot NGL profiles) and the
reference-model bugs found along the way.

## Rules of the road

* The engine is locked. Economic changes need explicit approval and a fixture
  reconciliation; presentation changes do not.
* No economic formulas in `ui/`. A boundary test enforces the import rule.
* Keep `npm test` green before publishing a new artifact build.
