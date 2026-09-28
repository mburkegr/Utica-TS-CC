# GIS / Map module: architecture

Status: GIS v1 (reference geography, Type Curve Areas) plus the ODNR Units layer.

## 1. Master artifact navigation

One published artifact hosts the whole Utica platform. Modules are peers:

```
Deal Model | GIS            (future: Deal Library, Offset Analysis, Production, ...)
```

- `ui/shell/moduleRegistry.ts` lists the modules. `ui/shell/ModuleNav.tsx` is the
  segmented switch that appears in every module's rail, under the brand.
- `ui/shell/AppShell.tsx` mounts both modules and hides the inactive one
  (`.app.hidden`). Nothing is unmounted on a switch, so Deal Model inputs,
  results and sensitivities survive a trip through GIS, and the GIS keeps its
  map instance and loaded layers. The GIS is mounted the first time it is
  opened, so the Deal Model's startup path is unchanged.
- The Deal Model (`ui/App.tsx`) received presentation-only hooks: a
  `moduleNav` slot, a `hidden` flag and brand text. Its reducer, engine calls
  and downloads are untouched. `engine/` is unchanged.
- Adding a module: one entry in `moduleRegistry.ts`, one component, one line in
  `AppShell.tsx`. Module preference persists in `localStorage["utica-master-module"]`.

## 2. GIS module architecture

Two layers, mirroring the engine/ui split:

| Path | Role |
|---|---|
| `gis/` | Framework-free GIS library (no React, no engine). Runs in Node tests. |
| `gis/layers/types.ts` | `LayerDefinition`, style, popup, label and source schema |
| `gis/layers/registry.ts` | The Layer Library: `REFERENCE_LAYERS`, `OPTIONAL_LAYERS`, validation |
| `gis/data/loaders.ts`, `layerStore.ts` | Fetch + index GeoJSON; session cache with a status machine |
| `gis/geo/geometry.ts`, `hitTest.ts` | bbox, point-in-polygon, label anchors, EPSG:4326 validation, click hit test |
| `gis/map/MapAdapter.ts` | The interface the UI talks to |
| `gis/map/leafletAdapter.ts`, `leafletLoader.ts`, `style.ts` | Leaflet 1.9.4 implementation, on-demand script load, token → color resolution |
| `gis/format.ts` | Popup HTML and attribute formatting |
| `gis/search.ts` | Unit lookup: search index + ranked query, and the operator filter |
| `gis/index.ts` | Public surface; `ui/` imports only from here (enforced by `tests/ui_boundary.test.ts`) |
| `ui/gis/` | React: `GisModule` (state + reconciliation), `UticaMap`, `LayerPanel`, `UnitSearch`, `UnitFilter`, `FeaturePanel`, `state/` (reducer, persistence), `gis.css` |
| `gis-data/` | Data: `base/` reference GeoJSON, `layers/` optional datasets (Type Curve Areas, ODNR Units, Unit D&C), `source/` tracked source rows, `manifest.json`, `scripts/` |

Data flow: `LayerStore.loadEager()` on first open → store status changes
re-render `GisModule` → an effect reconciles the `MapAdapter` (`setLayer`,
`setLabels`, `setHighlight`) with `GisState` → map click → `hitTest` across the
visible, loaded polygon layers → `SELECT` (all hits, priority order) → popup
(concise, one section per layer) + detail drawer (tabs, full attributes).

Polygons are drawn non-interactive; hit testing lives in `gis/geo/hitTest.ts`
so one click reports the township, county and phase window together and the
map library does not decide selection. Point and line layers will add a pixel
tolerance rule there when they arrive.

## 3. GeoJSON conventions

- RFC 7946 `FeatureCollection`, **EPSG:4326** (`urn:ogc:def:crs:OGC:1.3:CRS84`),
  coordinates `[lon, lat]`. Shapefiles are converted before they enter the
  repo; the browser never parses shapefiles.
- Every feature must have a stable identity: `feature.id`, or the registry's
  `idField` property. `Id = 0` on every phase-window polygon, so that layer uses
  `Area` as its identity.
- No null geometries. Geometry class per layer is uniform (`polygon`, `line`, `point`).
- Property names are taken as delivered (TIGER fields such as `GEOID`, `NAME`,
  `NAMELSAD`, `ALAND`); the registry maps them to labels and formats. Land acres
  are derived from `ALAND` (m²) at display time; files are not modified.
- Files are tracked as `.geojson`; they are uploaded to the artifact asset store
  as `.json` because the store does not accept the `.geojson` extension.
- `tests/gis_data.test.ts` enforces: file exists, manifest sha256 matches,
  coordinates are lon/lat inside the project region (`OHIO_REGION_BBOX`),
  expected counts and geometry types, unique ids, popup/label attributes present,
  label anchors fall inside their polygons, union bbox covers every layer.

Simplification: assessed in the Milestone 0 spike. Townships (168 features,
56,772 vertices, 1.53 MB) parse in 11 ms and render in 26 ms in SVG. No
simplification is applied; the three files are byte-identical to the delivered
data. Revisit only if a future layer measures poorly, and then simplify a copy
in `gis-data/`, never the source.

## 4. Layer registry schema

```ts
interface LayerDefinition {
  id: "ref.counties";                       // "<group>.<name>"
  name; category; description; attribution;
  tier: "reference" | "optional";           // permanent vs Layer Library
  geometry: "polygon" | "line" | "point";
  source: { kind: "asset"; manifestKey } | { kind: "url"; url } | { kind: "inline"; elementId };
  loading: "eager" | "lazy";                // reference = eager, optional = lazy (validated)
  defaultVisible: boolean;                  // reference = true, optional = false (validated)
  renderer: "svg" | "canvas";               // svg by default; canvas once a layer is dense (ODNR units)
  zIndex: number;                           // draw order; phase 10 < townships 20 < counties 30 < tc 40 < units 50
  idField; nameField; selectable; selectionPriority;   // units 50 > tc 40 > townships 30 > counties 20 > phase 10
  popup: { title(props), fields: [{ key, label, format?, derive? }] };  // fields may be empty: name only
  label?: { field, derive?, defaultOn, toggleLabel?, minZoom?, className,
            avoidCollisions?, priority?, fontPx?, paddingPx? };
  style: { kind: "static", style, legendLabel }
       | { kind: "categorical", field, classify?, classes, fallback, order? };
}
```

Style colors are CSS tokens (`--gis-...`) defined in `ui/gis/gis.css` for
light, system-dark and forced-dark. The adapter resolves them with
`getComputedStyle` at render time and re-resolves on theme change, so map and
legend always agree. `tests/gis_registry.test.ts` fails if a token is missing
from any theme block.

Phase windows draw as an **unfilled white outline**, one static style rather
than six filled classes: the coloured fills made the map too busy once the
unit layers went on top of them. The phase is read from the popup title, which
is the full area name. `phaseOf` and `regionOf` still derive the phase and
region from `Area` (`North Rich Condensate` → `Rich Condensate`, `Core Dry Gas
East` → `Dry Gas`) and `PHASE_ORDER` is still the geological order, for
anything that needs to list or group phases; nothing draws from them today.

White is 17.5:1 against the dark map surface and **1.26:1 against the light
one**, so in the light theme the outline is deliberately faint rather than
absent. That is the intended recession, not an oversight; a light-theme value
with real contrast would have to stop being white.

Counties use a saturated blue (`#1E5FA8` light, `#6BA6E8` dark, 5.1:1 and
6.9:1 against their map surfaces) rather than the near-white `pale-300` the
dark theme used before. Townships stay on the muted sky tokens and are thin
and dashed, so the two read apart by hue and by weight.

**A popup may have no fields.** Townships, counties and phase windows identify
by name alone: a click there is asking "which one is this", and repeating
GEOID, land area or the region and phase the title already spells out only
crowds the answer. `popup.title` is still required and `validateRegistry`
enforces it; the detail drawer's full attribute list carries every raw value,
so nothing is lost. `regionOf` and `phaseOf` remain — they classify the legend
even though no popup row reads them.

## 5. Reference vs optional layers

| | Reference | Optional (Layer Library) |
|---|---|---|
| Examples | Counties, Townships, Phase windows | Type Curve Areas (shipped), ODNR Units (shipped), Unit D&C (shipped), Producing wells, Dale wells, Estimated future units, Evaluation areas, Active opportunities, Ownership, Laterals, Operator datasets |
| Loading | Eager on first GIS open, in parallel | Lazy on first toggle |
| Default | Visible | Off |
| Cache | Session | Session; `LayerStore.evict` available |
| Panel | "Reference layers" | "Layer library" (shows an explainer while empty) |

Labels are separate from layer visibility: `state.labels[id]` never hides the
layer. County names are on by default; "Show Township Names" is off by default
and labels appear only at zoom ≥ 10.

Label collision handling (`gis/geo/labels.ts`, `placeLabels`): a layer whose
LabelSpec sets `avoidCollisions` re-places its labels on every map move.
Candidates are projected to screen space, ordered by `priority` (default:
polygon bbox area, largest first) and kept greedily when the estimated label box
lies inside the viewport and does not overlap a kept label. Readability wins
over completeness: small or overlapping polygons lose their label until the
user zooms in. Anchors are the area-weighted centroid of the largest ring.

**Type Curve Areas** (`opt.tc_areas`, `gis-data/layers/Utica_TC_Areas_09212026_EPSG4326.geojson`,
30 polygons) is the first Layer Library entry: off by default, lazy, labeled by
`TC_NUMBER` in a badge with collision avoidance, `selectionPriority` 40 so a
click opens the TC polygon first with the reference layers as tabs. Popup:
NAME, AOI, TC_NUMBER, SPACING, BASE_LL, OIL_EUR, GAS_EUR, CONFIDENCE; the
drawer shows every attribute (including `Shape_Area`).

**ODNR Units** (`opt.odnr_units`, `gis-data/layers/ODNR_Units_EPSG4326.geojson`,
789 polygons) is the second Layer Library entry: off by default, lazy,
unlabeled, `selectionPriority` 50 and `zIndex` 50 so a unit draws over the type
curve areas and identifies first. It is the one `renderer: "canvas"` layer;
789 interactive SVG paths make panning sluggish, and the units carry no labels,
which is what SVG would otherwise buy. Styled categorically on `STATUS`, so
pending units read differently from effective ones.
Popup: OPERATOR, ORDER_NO, STATUS, FORMATION, ACRES, EDIT_DATE.

**Codes in, names out.** The tracked GeoJSON holds what ODNR filed; the
registry translates at display time, so no lookup is ever baked into the data.

`UNIT_STATUS_LABELS` maps the order status to its official ODNR expansion:
`PEN` Pending, `EFF` Effective, `COI` Chief's Order Issued, `NLE` No Longer
Effective. The legend, popup and drawer show the expansion; `STATUS` keeps the
raw code, which is also what keys the style. Legend order follows an
application through the process. `NLE` has no features in the current extract
but is registered with a style, dashed as well as grey so "no longer
effective" reads as inactive without relying on hue alone, so a refresh that
introduces it renders properly instead of dropping to the fallback. An
unrecognised code shows verbatim rather than being hidden.

`OPERATOR_ALIASES` / `operatorOf` canonicalize the operator name, which ODNR
files free-form. Keys are the filed value, whitespace-collapsed and
lower-cased, so matching tolerates case and spacing:

| Filed | Canonical |
|---|---|
| `Gulfport Energy Transferred to Gulfport Appalachia`, `Gulfport Appalachia`, `Gulfport Energy` | Gulfport Appalachia |
| `INR Onio`, `INR Ohio` | INR Ohio |
| `EOG Ohio`, `EOG Resources`, `Eclipse`, `OG Resources` | EOG Resources |
| `Rice Drilling D` | EQT |

EOG Ohio and EOG Resources are one operator; the Eclipse unit is now EOG's and
`OG Resources` is a dropped leading E. EQT acquired Rice Energy in 2017.

The canonical name is what display, legends and grouping use; `OPERATOR`
itself is never rewritten and the drawer's full attribute list shows it as
filed, so the 20 filed values reduce to 14 for display while the file still
round-trips to the source.

Aliases are added only on explicit approval, never inferred from a name that
merely resembles another. `Tiburon` (1 unit) is deliberately absent: it is an
active operator in its own right, not a short spelling of `Tiburon Oil and Gas
Ohio` (2 units).

Provenance: ODNR Division of Oil and Gas Resources Management `Unitizations`
shapefile, NAD83 / StatePlane Ohio South FIPS 3402 (US survey feet),
reprojected to EPSG:4326 using the CRS in the shapefile's own `.prj` rather
than EPSG:3735, whose false easting differs by ~1.2 m. Conversion notes:

- Two exact duplicate rows in the source (Guthrie HN FRA East, order 2024-149,
  and Guthrie HN FRA West, order 2025-14 — identical attributes and identical
  geometry) are dropped, taking 791 records to 789 features.
- `UNIT_ID` is a slug of the unit name, collision-suffixed. The source has no
  usable key: `OrderNo` is blank for 48 pending units and repeats across 7.
- `OPERATOR` is the source `company` with whitespace collapsed (it embeds CR/LF
  and non-breaking spaces). The name itself is left exactly as filed; variants
  are reconciled at display time by `OPERATOR_ALIASES`, above, never here.
- `FORMATION` is title-cased; the source mixes `Utica`/`UTICA`.
- `ACRES` is the source `Shape_STAr` (projected ft²) over 43,560. `gis_data`
  re-derives area from the reprojected rings and fails if any unit disagrees by
  more than 2%, which is the check that would catch a bad reprojection: wrong
  CRS output can still validate as lon/lat inside the region bbox.
- The ODNR editing fields `create_by` and `edit_by` (internal staff ids) are
  dropped; `create_dat` is empty for every record. `edit_date` is kept as
  `EDIT_DATE`, the data vintage.

### Unit search and operator filter

789 units cannot be picked out by eye, so `gis/search.ts` indexes them and
`ui/gis/UnitSearch.tsx` puts a box at the top of the GIS rail. Search is scoped
to units on purpose: the reference layers are found by looking at the map.

- Matches the three things that identify a unit in conversation: `UNIT_NAME`,
  the operator, and `ORDER_NO`. Both the canonical operator and the name as
  ODNR filed it are indexed, so "Gulfport Energy" finds units the UI labels
  Gulfport Appalachia.
- Queries are folded to lower case with punctuation as a separator, so
  `2016-237` and `2016 237` are the same query. Every term has to match, so
  extra words narrow the result set instead of widening it.
- Ranking: whole-name match, then name prefix, then name substring, then a
  match in another field; ties break alphabetically, so a given query always
  returns the same order. Capped at 20 rows in the UI.
- The units layer is lazy, so the first query asks for it and the box reports
  "Loading units…" rather than "No matching unit" for data it has not fetched.
- Picking a result switches the layer on, then selects the unit exactly as a
  map click would (highlight, popup, detail drawer) and fits the map to its
  bounds. Selecting before the layer has rendered is safe: the reconcile effect
  applies the highlight once the data is on the map.

The **operator filter** (`operatorOptions`, `filterUnitsByOperators`,
`ui/gis/UnitFilter.tsx`) narrows the layer to any number of operators, so two
can be compared side by side. Options are the canonical operators present in
the data with their unit counts, ordered by count, so the Gulfport and EOG
spellings appear once each and the list leads with whoever holds the most
acreage.

- Checkboxes in a collapsed list, not a `<select multiple>`: the rail already
  uses checkboxes for layer visibility, a multi-select hides the choice behind
  a scroll and makes deselecting one of several a modifier-click, and
  collapsing keeps fourteen operators from pushing the layer panel off screen.
- `filterUnitsByOperators` returns the layer re-indexed on the subset, so its
  bbox, `byId` and feature count all describe what is drawn: "zoom to layer"
  frames the selection's acreage and the status line counts its units. An
  empty selection means every operator and returns the original data
  untouched, so the unfiltered case allocates nothing.
- `GisModule.dataFor()` is the single place that decides what a layer renders
  from. The map, the hit test, the selection, the feature count and zoom to
  layer all read through it, so they cannot disagree about what is filtered
  out — a unit hidden by the filter is also unclickable. It reads the filtered
  view through a ref, because `events` is memoized and a handler captured on
  the first render would otherwise hold a stale view.
- Search is narrowed by the same selection, so a result can never be a unit
  the map is hiding.
- Changing the filter clears the selection, rather than leaving the drawer open
  on a unit that is no longer drawn.
- The choice persists with the other GIS preferences under
  `localStorage["utica-gis-v1"]`; a stored operator that no longer exists after
  a data refresh still shows as ticked, reading 0, so it can be unticked rather
  than being stuck. A preference saved while the filter was single-select
  carries `unitOperator` instead of `unitOperators`, and is migrated on load
  rather than dropped.

### Unit D&C

**Unit D&C** (`opt.unit_dc`, `gis-data/layers/ODNR_Units_DC_EPSG4326.geojson`,
363 polygons) is the subset of units that carry a drilling-and-completion cost,
labeled with it. Off by default, lazy, canvas-rendered, `zIndex` and
`selectionPriority` 60 so it draws and identifies above the plain units layer.
Unlike every other layer its **labels are on by default**: seeing the number
without clicking is the point of the layer, and collision avoidance drops the
rest, largest unit first. Popup: D&C, hearing date, wells, average lateral,
operator, status.

The geometry is the unit polygon copied verbatim from the units layer, keyed on
`UNIT_ID`, so the two layers can never disagree about where a unit is;
`gis_data` asserts the polygons are identical rather than re-derived.

**The heatmap.** Units are filled by cost band (`DC_BANDS`, `dcBand`), cheapest
first, with an exclusive upper bound so $600/ft is a 600-700 unit:

| Band | Units |
|---|---:|
| < $500/ft | 0 |
| $500 - 600/ft | 37 |
| $600 - 700/ft | 106 |
| $700 - 800/ft | 140 |
| $800 - 900/ft | 42 |
| $900+/ft | 38 |

The `< $500` band has no units in the current workbook but is registered so a
refresh that introduces one renders with a style instead of the fallback.

The ramp is deliberately multi-hue — dark green through yellow to red — rather
than the single-hue light-to-dark a sequential scale would normally use,
because cheap-to-expensive reads as green-to-red for this audience. That
choice costs the automatic separation a one-hue ramp gives, so the steps were
picked against `scripts/validate_palette.js` from the dataviz skill rather
than by eye: every adjacent pair clears a normal-vision OKLab ΔE of 15 and the
colour-vision-deficient floor, against each theme's own map surface
(`#DCE6F0` light, `#121A24` dark). The dark ramp is its own set of steps, not
a flip of the light one — the darkest green has to lift to stay visible on a
dark map.

Two consequences worth keeping:

- **Every unit is labeled with its exact cost**, so colour is never the only
  encoding. That is also what satisfies the relief requirement for the bands
  whose fill sits under 3:1 against the map.
- **Bands share one outline token** (`--gis-dc-line`) and differ only in fill.
  Six competing stroke colours would muddy the value the fill is carrying.
- The label is a **badge** with its own background, not haloed text: one text
  colour cannot contrast with six different fills beneath it.

**`gis-data/source/unit_dc.csv` is the tracked source of truth** - one row per
unit hearing, sorted by date then name so a diff reads cleanly. The workbook
it came from stays upstream and outside the repo; the CSV is the checked-in
extract, which is what makes the layer reproducible without hunting for a
spreadsheet, and what makes a single new unit a one-line change:

```
hearing_date,unit,wells,avg_lateral_ft,dc_per_ft
2026-11-12,Beardsley South Unit,2,21155,699.6
```

`build_unit_dc.py` has two commands. `build` joins the rows to the units layer
and needs nothing but the standard library; `extract` regenerates the whole
CSV from a full workbook and needs openpyxl.

```
# a new unit: append its row to the CSV, then
python3 gis-data/scripts/build_unit_dc.py build \
    gis-data/source/unit_dc.csv \
    gis-data/layers/ODNR_Units_EPSG4326.geojson \
    gis-data/layers/ODNR_Units_DC_EPSG4326.geojson
node gis-data/scripts/manifest.mjs digest

# a full workbook refresh: regenerate the rows first, then build as above
python3 gis-data/scripts/build_unit_dc.py extract <workbook.xlsx> \
    gis-data/source/unit_dc.csv
```

A row whose unit is not yet in the ODNR shapefile stays in the CSV and shows
up in the script's unmatched list; it joins on its own the next time the
shapefile is refreshed, with no further edit.

- **Matching** is on a normalized name: whitespace collapsed, a trailing
  " Unit" dropped, case folded, punctuation as a separator. That alone joins
  358 of 402 rows, and the script refuses to run if two shapefile units ever
  share a normalized key.
- **`NAME_ALIASES`** adds eight rows where the two files spell one unit
  differently (`Cheetah NSH C` / `Cheetah NHS C`, `Rogue HWS18 A` /
  `Rogue HWS 18A`, and so on). Each was confirmed individually. The
  shapefile's spelling is authoritative, so the output always carries it.
  Everything else is left unmatched rather than guessed: the remaining 36
  workbook rows are units that are genuinely not in the shapefile.
- **Duplicates** keep the latest hearing date, on the basis that a later
  hearing supersedes an earlier one. An alias can also collapse two
  differently named rows onto one unit; the script reports those separately,
  because they are not simple re-hearings and deserve a look. Two do at
  present, both re-hearings of the same well count.

  This is why `Bearcats NB BUF 210H Unit` is deliberately *not* aliased onto
  `Bearcats NB BUF`: it is a later single-well hearing, and aliasing it let
  one well's cost supersede the unit's own three-well row. The unit keeps the
  three-well hearing and the 210H row is left unmatched. `gis_data` asserts
  it, so the decision cannot quietly revert.
- **D&C is dollars per lateral foot** (508 - 1308 across the current file) and
  `LL` is the average lateral per well, which is why it is fractional when
  `Wells` > 1. `dcPerFt`, `lateralFt` and `hearingDate` in the registry format
  them; `hearingDate` parses the ISO string directly rather than through
  `Date`, which would shift the day across a timezone for a date-only value.

## 6. Asset, loading and caching strategy

- All GIS data is served from the artifact's **asset store** (`/_blob/<id>`),
  reference layers included. The page declares `capabilities: {downloads: true,
  assets: {}}`. Declaring `assets` makes the artifact organization-internal,
  which is the intended sharing model for proprietary GIS data.
- `gis-data/manifest.json` maps each layer key to its tracked file, sha256 and
  published asset `{id, url}`. The build imports the manifest, so asset ids are
  never hardcoded in the registry. Publishing a new dataset:
  1. add the `.geojson` under `gis-data/base/` or `gis-data/layers/`;
  2. add a manifest entry and run `node gis-data/scripts/manifest.mjs digest`;
  3. upload the file (as `.json`) to the artifact's asset store and record the
     id with `node gis-data/scripts/manifest.mjs set-asset <key> <id>`;
  4. `npm run build`, publish `dist/index.html`.
  A layer whose manifest url is empty shows "not published" in the panel.
- `LayerStore` holds one in-flight request per layer, caches parsed data for
  the session and exposes `idle | loading | ready | error` with a retry.
  `GisModule` calls `load` the first time an idle layer is switched on; toggling
  it off removes it from the map but keeps the cached data.
- Leaflet (147 KB) is injected from cdnjs (jsdelivr fallback) the first time
  GIS opens; its CSS is inlined by `build.mjs` with the two rules that reference
  remote PNGs removed.

## 7. Map state

`ui/gis/state/gisReducer.ts`: `visible`, `labels`, `view`, `selection`
(`{at, hits[], primary}`), `detailOpen`. Persisted per browser under
`localStorage["utica-gis-v1"]` (visibility, labels, view only, never data), and
restored on top of registry defaults so a newly registered layer gets its
default. The Deal Model draft key and schema are untouched.

## 8. Adding a new GIS dataset

1. Convert to EPSG:4326 GeoJSON outside the repo; confirm a stable id property.
2. Drop it in `gis-data/layers/`, register it in `manifest.json` (step list above).
3. Add one `LayerDefinition` to `OPTIONAL_LAYERS` in `gis/layers/registry.ts`
   (`tier: "optional"`, `loading: "lazy"`, `defaultVisible: false`).
4. Add its style tokens to all three theme blocks in `ui/gis/gis.css`.
5. Add the expected count/geometry to `EXPECTED` in `tests/gis_data.test.ts`.
6. `npm test`. No map code changes are expected. Point layers should set
   `renderer: "canvas"` and will need the point rule in `hitTest`.

## 9. Testing

`npm test` runs the engine reconciliation and UI suites unchanged, then:

| Test | Covers |
|---|---|
| `ui_boundary.test.ts` | ui → engine only via `engine/index`; ui → gis only via `gis/index`; `gis/` free of engine, ui and React; engine free of gis/ui |
| `ui_shell.test.tsx` | peer navigation, both modules stay mounted, Deal Model results survive a switch |
| `gis_registry.test.ts` | registry validation, manifest keys, draw and selection order, legend order, tokens in every theme block, asset resolution |
| `gis_data.test.ts` | the four GeoJSON files (see §3), hit test at a known point, TC_NUMBER 1..30, label placement drops collisions |
| `gis_store.test.ts` | eager vs lazy, in-flight dedupe, cache, error and `not_published`, retry, evict |
| `gis_ui.test.tsx` | jsdom + fake `MapAdapter` + file-backed fetch: eager load, toggles, township-name toggle is labels-only, optional layer lazy-loads on toggle with labels and is primary on click, click → popup and detail panel, highlight, zoom-to-feature/layer, empty click clears, hidden/visible relayout |

Leaflet itself is not run in jsdom; the `MapAdapter` interface is the seam. The
Milestone 0 spike (a disposable artifact) verified the real runtime: Leaflet
dynamic load, `/_blob` fetch, render timing.

## 10. Artifact/runtime limitations discovered

- **CSP**: scripts only from cdnjs / jsdelivr; no remote tiles, images, fonts or
  fetches. Hence vector-only, Leaflet CSS inlined, `circleMarker`/SVG icons
  instead of Leaflet's PNG markers. A basemap, if ever wanted, would be a
  georeferenced raster uploaded as an asset and shown with `L.imageOverlay`.
- **Asset store** accepts `.json` but not `.geojson`; 20 MiB per asset.
- **Declaring `assets`** makes the artifact organization-internal (never public).
- **Capabilities are a full-set declaration**: republishing with a non-empty
  `capabilities` object must restate `downloads: true`.
- **Asset ids are per artifact**: a second artifact (or a re-created one) needs
  its own uploads and manifest values.
- **One JS bundle**: only data is lazy; Leaflet is the one deferred script.
- **Hidden modules do not lay out**: the adapter calls `invalidateSize()` when
  the GIS becomes visible again.
- **Blocked browser dialogs** (already known from the Deal Model): no
  `confirm`/`alert` in the artifact iframe.
- **Sandbox is ephemeral**: the repository is the source of truth; every session
  ends with a commit and a push (or a bundle handed over for pushing).
