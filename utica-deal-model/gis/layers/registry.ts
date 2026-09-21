/**
 * Layer Library. Reference layers are permanent and load when the GIS opens;
 * optional layers (none yet) are off by default and lazy-load on first toggle.
 * The map draws whatever is registered here; it has no dataset-specific code.
 */
import type { LayerDefinition, PathStyle, StyleToken } from "./types";

const REGION_PREFIX = /^(Core|North|South)\s+/;
/** "North Rich Condensate" → "Rich Condensate"; "Core Dry Gas East" → "Dry Gas". */
export function phaseOf(area: unknown): string { return String(area ?? "").replace(REGION_PREFIX, "").replace(/^Dry Gas (East|West)$/, "Dry Gas"); }
export function regionOf(area: unknown): string { const m = REGION_PREFIX.exec(String(area ?? "")); return m ? m[1] : ""; }

/** Geologically ordered from oil to dry gas. Colors are muted categorical tokens; none implies quality. */
export const PHASE_ORDER = ["Oil", "Rich Condensate", "Condensate", "Lean Condensate", "Wet Gas", "Dry Gas"] as const;
const phaseClass = (key: string, token: string): PathStyle & { label: string } => ({
  label: key, stroke: `--gis-phase-${token}-line` as StyleToken, weight: 1.8, opacity: 1, fill: `--gis-phase-${token}-fill` as StyleToken, fillOpacity: 0.28,
});

export const REFERENCE_LAYERS: LayerDefinition[] = [
  {
    id: "ref.phase_windows", name: "Utica Phase Windows", category: "reference", tier: "reference", geometry: "polygon",
    source: { kind: "asset", manifestKey: "phase_windows" }, loading: "eager", defaultVisible: true, renderer: "svg",
    zIndex: 10, idField: "Area", nameField: "Area", selectable: true, selectionPriority: 10,
    description: "Interpreted Utica/Point Pleasant fluid windows by region (Core, North, South). Drawn beneath county and township lines. The source `Id` attribute is 0 for every polygon, so `Area` is the feature identity.",
    attribution: "Internal interpretation (OH_TC_Areas)",
    popup: {
      title: (p) => String(p.Area ?? "Phase window"),
      fields: [
        { key: "Area", label: "Region", derive: (p) => regionOf(p.Area) || "n/a" },
        { key: "Area", label: "Phase", derive: (p) => phaseOf(p.Area) },
      ],
    },
    style: {
      kind: "categorical", field: "Area", classify: (v) => phaseOf(v), order: [...PHASE_ORDER],
      classes: {
        "Oil": phaseClass("Oil", "oil"),
        "Rich Condensate": phaseClass("Rich Condensate", "rich"),
        "Condensate": phaseClass("Condensate", "cond"),
        "Lean Condensate": phaseClass("Lean Condensate", "lean"),
        "Wet Gas": phaseClass("Wet Gas", "wet"),
        "Dry Gas": phaseClass("Dry Gas", "dry"),
      },
      fallback: { label: "Other", stroke: "--gis-phase-other-line", weight: 1, fill: "--gis-phase-other-fill", fillOpacity: 0.2 },
    },
  },
  {
    id: "ref.townships", name: "Townships", category: "reference", tier: "reference", geometry: "polygon",
    source: { kind: "asset", manifestKey: "townships" }, loading: "eager", defaultVisible: true, renderer: "svg",
    zIndex: 20, idField: "GEOID", nameField: "NAME", selectable: true, selectionPriority: 30,
    description: "Civil township boundaries for the ten Utica-area counties.", attribution: "US Census TIGER/Line 2025 (county subdivisions)",
    popup: {
      title: (p) => String(p.NAMELSAD ?? p.NAME ?? "Township"),
      fields: [
        { key: "COUNTY_NAME", label: "County", derive: (p) => `${p.COUNTY_NAME ?? ""} County` },
        { key: "GEOID", label: "GEOID", format: "text" },
        { key: "ALAND", label: "Land acres", format: "acres_from_m2" },
      ],
    },
    label: { field: "NAME", defaultOn: false, toggleLabel: "Township Names", minZoom: 10, className: "gis-label gis-label-township" },
    style: { kind: "static", legendLabel: "Township boundary", style: { stroke: "--gis-township-line", weight: 0.9, dashArray: "4 3", opacity: 0.95, fill: "--gis-township-fill", fillOpacity: 0 } },
  },
  {
    id: "ref.counties", name: "Counties", category: "reference", tier: "reference", geometry: "polygon",
    source: { kind: "asset", manifestKey: "counties" }, loading: "eager", defaultVisible: true, renderer: "svg",
    zIndex: 30, idField: "GEOID", nameField: "NAME", selectable: true, selectionPriority: 20,
    description: "County boundaries: Belmont, Carroll, Columbiana, Guernsey, Harrison, Jefferson, Monroe, Noble, Stark, Tuscarawas.", attribution: "US Census TIGER/Line 2025 (counties)",
    popup: {
      title: (p) => String(p.NAMELSAD ?? p.NAME ?? "County"),
      fields: [
        { key: "GEOID", label: "GEOID", format: "text" },
        { key: "ALAND", label: "Land acres", format: "acres_from_m2" },
      ],
    },
    label: { field: "NAME", defaultOn: true, className: "gis-label gis-label-county" },
    style: { kind: "static", legendLabel: "County boundary", style: { stroke: "--gis-county-line", weight: 2, opacity: 1, fill: "--gis-county-fill", fillOpacity: 0.05 } },
  },
];

/**
 * ODNR unitization order status. The raw code is what the source files and what
 * stays in the feature's STATUS property; these are the official ODNR expansions,
 * used wherever a status is shown to a reader (legend, popup, detail drawer).
 * NLE does not occur in the current extract but is registered so a data refresh
 * that introduces it renders with a style and a label instead of the fallback.
 */
export const UNIT_STATUS_LABELS: Record<string, string> = {
  PEN: "Pending",
  EFF: "Effective",
  COI: "Chief's Order Issued",
  NLE: "No Longer Effective",
};
/** Legend order: the order of an application through the process. */
export const UNIT_STATUS_ORDER = ["PEN", "EFF", "COI", "NLE"] as const;
/** Expanded status name for display; unknown codes show verbatim rather than being hidden. */
export function unitStatusLabel(code: unknown): string {
  const k = String(code ?? "").trim().toUpperCase();
  return UNIT_STATUS_LABELS[k] ?? (k || "Unknown");
}
const unitStatusClass = (code: string, token: string, dashArray?: string): PathStyle & { label: string } => ({
  label: UNIT_STATUS_LABELS[code], stroke: `--gis-unit-${token}-line` as StyleToken, weight: 1.6, opacity: 1, dashArray,
  fill: `--gis-unit-${token}-fill` as StyleToken, fillOpacity: 0.18,
});

/**
 * Operator canonicalization. ODNR files an operator name free-form, so one
 * company arrives under several spellings. Display, legends and grouping use
 * the canonical name; the filed value is never rewritten — it stays in the
 * feature's OPERATOR property and shows in the detail drawer's full attribute
 * list. Keys are the filed value, whitespace-collapsed and lower-cased.
 *
 * Entries are added only on explicit approval, never inferred from a name that
 * merely looks like a variant of another.
 */
export const OPERATOR_ALIASES: Record<string, string> = {
  "gulfport energy transferred to gulfport appalachia": "Gulfport Appalachia",
  "gulfport appalachia": "Gulfport Appalachia",
  "gulfport energy": "Gulfport Appalachia",
  "inr onio": "INR Ohio",
  "inr ohio": "INR Ohio",
};
/** Canonical operator name for display and grouping; an unaliased name passes through as filed. */
export function operatorOf(value: unknown): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  return OPERATOR_ALIASES[raw.toLowerCase()] ?? raw;
}

/** Optional layers (Layer Library). Off by default, lazy-loaded on first toggle, cached for the session. */
export const OPTIONAL_LAYERS: LayerDefinition[] = [
  {
    id: "opt.tc_areas", name: "Type Curve Areas", category: "reference", tier: "optional", geometry: "polygon",
    source: { kind: "asset", manifestKey: "tc_areas" }, loading: "lazy", defaultVisible: false, renderer: "svg",
    zIndex: 40, idField: "TC_NUMBER", nameField: "NAME", selectable: true, selectionPriority: 40,
    description: "Type-curve areas (30 polygons) with spacing, base lateral length, EUR and confidence attributes. Labeled by TC number when enabled.",
    attribution: "Internal interpretation (Utica_TC_Areas, 2026-09-21)",
    popup: {
      title: (p) => `TC ${p.TC_NUMBER ?? "?"}: ${p.NAME ?? ""}`,
      fields: [
        { key: "NAME", label: "Name", format: "text" },
        { key: "AOI", label: "AOI", format: "text" },
        { key: "TC_NUMBER", label: "TC number", format: "integer" },
        { key: "SPACING", label: "Spacing", format: "integer" },
        { key: "BASE_LL", label: "Base LL", format: "integer" },
        { key: "OIL_EUR", label: "Oil EUR", format: "integer" },
        { key: "GAS_EUR", label: "Gas EUR", format: "integer" },
        { key: "CONFIDENCE", label: "Confidence", format: "text" },
      ],
    },
    label: { field: "TC_NUMBER", defaultOn: true, className: "gis-label gis-label-tc", avoidCollisions: true, fontPx: 12, paddingPx: 4 },
    style: { kind: "static", legendLabel: "Type curve area", style: { stroke: "--gis-tc-line", weight: 1.6, opacity: 1, dashArray: "6 3", fill: "--gis-tc-fill", fillOpacity: 0.12 } },
  },
  {
    id: "opt.odnr_units", name: "ODNR Units", category: "units", tier: "optional", geometry: "polygon",
    source: { kind: "asset", manifestKey: "odnr_units" }, loading: "lazy", defaultVisible: false, renderer: "canvas",
    zIndex: 50, idField: "UNIT_ID", nameField: "UNIT_NAME", selectable: true, selectionPriority: 50,
    description: "Ohio unitization units ordered under ORC 1509.28 (789 polygons), colored by order status: Pending, Effective, Chief's Order Issued, No Longer Effective. Canvas-rendered: at this feature count SVG paths make panning sluggish.",
    attribution: "ODNR Division of Oil and Gas Resources Management, Unitizations shapefile (NAD83 Ohio South ftUS, reprojected to EPSG:4326)",
    popup: {
      title: (p) => String(p.UNIT_NAME ?? "Unit"),
      fields: [
        { key: "OPERATOR", label: "Operator", derive: (p) => operatorOf(p.OPERATOR) },
        { key: "ORDER_NO", label: "Order no.", format: "text" },
        { key: "STATUS", label: "Status", derive: (p) => unitStatusLabel(p.STATUS) },
        { key: "FORMATION", label: "Formation", format: "text" },
        { key: "ACRES", label: "Acres", format: "integer" },
        { key: "EDIT_DATE", label: "ODNR updated", format: "date" },
      ],
    },
    style: {
      kind: "categorical", field: "STATUS", order: [...UNIT_STATUS_ORDER],
      classes: {
        PEN: unitStatusClass("PEN", "pen"),
        EFF: unitStatusClass("EFF", "eff"),
        COI: unitStatusClass("COI", "coi"),
        // Dashed as well as grey: "no longer effective" should read as inactive without relying on hue alone.
        NLE: unitStatusClass("NLE", "nle", "5 3"),
      },
      fallback: { label: "Other", stroke: "--gis-unit-other-line", weight: 1.4, fill: "--gis-unit-other-fill", fillOpacity: 0.15 },
    },
  },
];

export const LAYER_REGISTRY: readonly LayerDefinition[] = [...REFERENCE_LAYERS, ...OPTIONAL_LAYERS];

export function getLayer(id: string): LayerDefinition { const l = LAYER_REGISTRY.find((x) => x.id === id); if (!l) throw new Error(`unknown layer ${id}`); return l; }

/** Draw order: ascending zIndex. */
export function layersInDrawOrder(defs: readonly LayerDefinition[] = LAYER_REGISTRY): LayerDefinition[] { return [...defs].sort((a, b) => a.zIndex - b.zIndex); }

/** Style tokens a stylesheet must define for every registered layer. */
export function styleTokens(defs: readonly LayerDefinition[] = LAYER_REGISTRY): string[] {
  const out = new Set<string>();
  const add = (s: PathStyle) => { out.add(s.stroke); if (s.fill) out.add(s.fill); };
  for (const d of defs) { if (d.style.kind === "static") add(d.style.style); else { Object.values(d.style.classes).forEach(add); add(d.style.fallback); } }
  return [...out].sort();
}

export interface ManifestLike { layers: Record<string, { file: string; sha256: string; asset: { id: string; url: string } }> }

/** Static consistency checks, run in tests and at GIS startup (dev builds). */
export function validateRegistry(defs: readonly LayerDefinition[], manifest: ManifestLike): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) issues.push(`${d.id}: duplicate id`); ids.add(d.id);
    if (!/^[a-z]+\.[a-z0-9_]+$/.test(d.id)) issues.push(`${d.id}: id must look like "<group>.<name>"`);
    if (d.tier === "reference" && (d.loading !== "eager" || !d.defaultVisible)) issues.push(`${d.id}: reference layers are eager and visible by default`);
    if (d.tier === "optional" && (d.loading !== "lazy" || d.defaultVisible)) issues.push(`${d.id}: optional layers are lazy and off by default`);
    if (d.source.kind === "asset" && !manifest.layers[d.source.manifestKey]) issues.push(`${d.id}: manifest key "${d.source.manifestKey}" is not in gis-data/manifest.json`);
    if (d.style.kind === "categorical" && d.style.order) for (const k of d.style.order) if (!d.style.classes[k]) issues.push(`${d.id}: legend order names unknown class "${k}"`);
    if (d.label && d.label.defaultOn === false && !d.label.toggleLabel) issues.push(`${d.id}: labels that are off by default need a toggleLabel`);
    if (!d.popup.fields.length) issues.push(`${d.id}: popup has no fields`);
  }
  return issues;
}
