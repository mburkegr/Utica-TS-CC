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
| `gis/search.ts` | Unit search: index + ranked query over the ODNR layer |
| `gis/index.ts` | Public surface; `ui/` imports only from here (enforced by `tests/ui_boundary.test.ts`) |
| `ui/gis/` | React: `GisModule` (state + reconciliation), `UticaMap`, `LayerPanel`, `UnitSearch`, `FeaturePanel`, `state/` (reducer, persistence), `gis.css` |
| `gis-data/` | Data: `base/` reference GeoJSON, `layers/` optional datasets (Type Curve Areas, ODNR Units), `manifest.json`, `scripts/manifest.mjs` |

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
  popup: { title(props), fields: [{ key, label, format?, derive? }] };
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

Phase windows use a categorical style keyed on `Area` with the region prefix
stripped (`North Rich Condensate` → `Rich Condensate`, `Core Dry Gas East` →
`Dry Gas`). Legend order is geological (Oil → Dry Gas); the palette is muted
and categorical and does not encode quality or risk.

## 5. Reference vs optional layers

| | Reference | Optional (Layer Library) |
|---|---|---|
| Examples | Counties, Townships, Phase windows | Type Curve Areas (shipped), ODNR Units (shipped), Producing wells, Dale wells, Estimated future units, Evaluation areas, Active opportunities, Ownership, Laterals, Operator datasets |
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

### Unit search

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
