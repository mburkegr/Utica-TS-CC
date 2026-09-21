/**
 * Layer Library schema. Every dataset the map can show is described by one
 * LayerDefinition; the map renders from these definitions and contains no
 * per-dataset logic. Adding a dataset means: put the GeoJSON in gis-data/,
 * register it in gis-data/manifest.json, and add one definition here.
 *
 * Colors are CSS token names (e.g. "--gis-county-line"), never literal colors,
 * so the map follows the light/dark theme like the rest of the application.
 */
import type { Feature, FeatureCollection, Geometry } from "./geojsonTypes";

export type LayerId = string;
export type LayerTier = "reference" | "optional";
export type LayerCategory = "reference" | "wells" | "units" | "opportunities" | "ownership" | "operator";
export type GeometryClass = "polygon" | "line" | "point";
export type LoadingStrategy = "eager" | "lazy";
export type RendererKind = "svg" | "canvas";

/** Where the browser gets the GeoJSON. Asset-hosted layers are resolved through the manifest at build time. */
export type LayerSource =
  | { kind: "asset"; manifestKey: string }
  | { kind: "url"; url: string }
  | { kind: "inline"; elementId: string };

export type StyleToken = `--gis-${string}`;

export interface PathStyle {
  stroke: StyleToken; weight: number; dashArray?: string; opacity?: number;
  fill?: StyleToken; fillOpacity?: number;
}

/** Categorical class: `field` value → class key; each class carries its own stroke/fill tokens and legend label. */
export interface CategoricalStyle {
  kind: "categorical";
  field: string;
  /** Optional transform from raw field value to class key (e.g. strip a region prefix). Pure and total. */
  classify?: (value: unknown, feature: Feature) => string;
  classes: Record<string, PathStyle & { label: string }>;
  fallback: PathStyle & { label: string };
  /** Legend order; classes not listed follow in insertion order. */
  order?: string[];
}
export interface StaticStyle { kind: "static"; style: PathStyle; legendLabel: string }
export type StyleSpec = StaticStyle | CategoricalStyle;

export type FieldFormat = "text" | "integer" | "number" | "acres_from_m2" | "date" | "percent";
export interface PopupField { key: string; label: string; format?: FieldFormat; /** derive a display value instead of reading `key` */ derive?: (props: Record<string, unknown>) => unknown }
export interface PopupSpec { title: (props: Record<string, unknown>) => string; fields: PopupField[] }

export interface LabelSpec {
  /** Property used for the label text (or `derive`). */
  field: string;
  derive?: (props: Record<string, unknown>) => string;
  /** Labels on when the layer is visible, or behind a user toggle ("Show <toggleLabel>"). */
  defaultOn: boolean;
  toggleLabel?: string;
  /** Hide labels below this zoom. */
  minZoom?: number;
  /** CSS class applied to each label. */
  className: string;
  /** Drop labels that would overlap or fall off-screen at the current zoom (greedy, highest priority first). */
  avoidCollisions?: boolean;
  /** Placement priority when colliding; default is polygon area (largest wins). */
  priority?: (feature: Feature) => number;
  /** Font size used to estimate the label box for collision tests (px). */
  fontPx?: number;
  /** Extra padding of the label box (px), e.g. for a badge background. */
  paddingPx?: number;
}

export interface LayerDefinition {
  id: LayerId;
  name: string;
  category: LayerCategory;
  tier: LayerTier;
  geometry: GeometryClass;
  source: LayerSource;
  loading: LoadingStrategy;
  defaultVisible: boolean;
  renderer: RendererKind;
  /** Drawing order: larger draws on top. Reference fills sit below reference lines. */
  zIndex: number;
  /** Stable feature identity. */
  idField: string;
  /** Short display name of a feature. */
  nameField: string;
  selectable: boolean;
  /** Higher wins when several layers contain the clicked point. */
  selectionPriority: number;
  popup: PopupSpec;
  label?: LabelSpec;
  style: StyleSpec;
  description?: string;
  /** Provenance for the layer panel and ARCHITECTURE_GIS.md. */
  attribution?: string;
}

export interface LayerData { collection: FeatureCollection; bbox: [number, number, number, number]; featureCount: number; byId: Map<string, Feature> }

export type { Feature, FeatureCollection, Geometry };
