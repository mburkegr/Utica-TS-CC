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
  // EOG Ohio and EOG Resources are the same operator; the Eclipse unit is now
  // EOG's, and "OG Resources" is a dropped leading E.
  "eog ohio": "EOG Resources",
  "eog resources": "EOG Resources",
  "eclipse": "EOG Resources",
  "og resources": "EOG Resources",
  // EQT acquired Rice Energy in 2017.
  "rice drilling d": "EQT",
  // "Tiburon" is deliberately absent: it is an active operator in its own
  // right, not a short spelling of "Tiburon Oil and Gas Ohio".
};
/** Canonical operator name for display and grouping; an unaliased name passes through as filed. */
export function operatorOf(value: unknown): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  return OPERATOR_ALIASES[raw.toLowerCase()] ?? raw;
}

// ---------------------------------------------------------------------------
// D&C display
// ---------------------------------------------------------------------------

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/** Drilling and completion cost, dollars per lateral foot: the map label and the popup both read this. */
export function dcPerFt(value: unknown): string { return typeof value === "number" ? `$${whole.format(value)}/ft` : "n/a"; }
/** Lateral length with its unit, so the popup row is readable without a column header. */
export function lateralFt(value: unknown): string { return typeof value === "number" ? `${whole.format(value)} ft` : "n/a"; }

/**
 * D&C cost bands, cheapest first: the heatmap ramp runs dark green through
 * yellow to red. `max` is exclusive, so $600/ft falls in the 600-700 band.
 *
 * The ramp is deliberately multi-hue rather than one-hue light-to-dark,
 * because cheap-to-expensive is read as green-to-red here. The values were
 * stepped so that every adjacent pair clears a normal-vision OKLab ΔE of 15
 * and the colour-vision-deficient floor, in both themes; each unit also
 * carries its exact cost as a label, so colour is never the only encoding.
 */
export const DC_BANDS = [
  { key: "u500", label: "< $500/ft", max: 500 },
  { key: "d500", label: "$500 - 600/ft", max: 600 },
  { key: "d600", label: "$600 - 700/ft", max: 700 },
  { key: "d700", label: "$700 - 800/ft", max: 800 },
  { key: "d800", label: "$800 - 900/ft", max: 900 },
  { key: "d900", label: "$900+/ft", max: Infinity },
] as const;

/** Band key for a cost; a non-numeric cost falls to the registry's fallback style. */
export function dcBand(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  for (const b of DC_BANDS) if (value < b.max) return b.key;
  return "d900";
}

const dcClass = (key: string, label: string): PathStyle & { label: string } => ({
  // One shared outline for every band: the fill carries the value, and six
  // competing stroke colours would only muddy it.
  label, stroke: "--gis-dc-line", weight: 1.2, opacity: 0.9,
  fill: `--gis-dc-${key}-fill` as StyleToken, fillOpacity: 0.62,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * "2026-10-21" → "21 Oct 2026". Parsed from the string rather than through
 * Date, which would shift the day across a timezone for a date-only value.
 */
export function hearingDate(value: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(value ?? "") || "n/a";
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
  {
    id: "opt.unit_dc", name: "Unit D&C", category: "units", tier: "optional", geometry: "polygon",
    source: { kind: "asset", manifestKey: "unit_dc" }, loading: "lazy", defaultVisible: false, renderer: "canvas",
    zIndex: 60, idField: "UNIT_ID", nameField: "UNIT_NAME", selectable: true, selectionPriority: 60,
    description: "The 363 ODNR units that carry a drilling-and-completion cost, labeled with D&C in dollars per lateral foot. Geometry is the unit polygon; D&C, hearing date, well count and average lateral come from the internal workbook.",
    attribution: "ODNR Unitizations geometry joined to the internal D&C workbook (see gis-data/scripts/build_unit_dc.py)",
    popup: {
      title: (p) => String(p.UNIT_NAME ?? "Unit"),
      fields: [
        { key: "DC_PER_FT", label: "D&C", derive: (p) => dcPerFt(p.DC_PER_FT) },
        { key: "HEARING_DATE", label: "Hearing date", derive: (p) => hearingDate(p.HEARING_DATE) },
        { key: "WELLS", label: "Wells", format: "integer" },
        { key: "AVG_LATERAL_FT", label: "Avg lateral", derive: (p) => lateralFt(p.AVG_LATERAL_FT) },
        { key: "OPERATOR", label: "Operator", derive: (p) => operatorOf(p.OPERATOR) },
        { key: "STATUS", label: "Status", derive: (p) => unitStatusLabel(p.STATUS) },
      ],
    },
    // Labels on by default: seeing the number without clicking is the point of
    // the layer. Collision avoidance drops the rest, largest unit first.
    label: { field: "DC_PER_FT", derive: (p) => dcPerFt(p.DC_PER_FT), defaultOn: true, className: "gis-label gis-label-dc", avoidCollisions: true, fontPx: 11, paddingPx: 3 },
    style: {
      kind: "categorical", field: "DC_PER_FT", classify: (v) => dcBand(v), order: DC_BANDS.map((b) => b.key),
      classes: Object.fromEntries(DC_BANDS.map((b) => [b.key, dcClass(b.key, b.label)])) as Record<string, PathStyle & { label: string }>,
      fallback: { label: "No cost", stroke: "--gis-dc-line", weight: 1.2, fill: "--gis-unit-other-fill", fillOpacity: 0.2 },
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
