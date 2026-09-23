/** GIS module state. Separate from the Deal Model reducer; persisted under its own key. */
import type { LayerDefinition, LayerId, MapView, Position } from "../../../gis/index";

export const GIS_SCHEMA_VERSION = "utica-gis-v1";

export interface SelectionHit { layerId: LayerId; featureId: string }
export interface GisSelection { at: Position; hits: SelectionHit[]; primary: number }

export interface GisState {
  schemaVersion: typeof GIS_SCHEMA_VERSION;
  /** Layer visibility. Label toggles are separate so "Show Township Names" never hides the boundary layer. */
  visible: Record<LayerId, boolean>;
  labels: Record<LayerId, boolean>;
  view: MapView | null;
  /** Canonical operators the ODNR units layer is narrowed to; empty is every operator. */
  unitOperators: string[];
  selection: GisSelection | null;
  detailOpen: boolean;
}

export type GisAction =
  | { type: "SET_VISIBLE"; id: LayerId; visible: boolean }
  | { type: "TOGGLE_VISIBLE"; id: LayerId }
  | { type: "SET_LABELS"; id: LayerId; on: boolean }
  | { type: "SET_VIEW"; view: MapView }
  | { type: "TOGGLE_UNIT_OPERATOR"; operator: string }
  | { type: "SET_UNIT_OPERATORS"; operators: string[] }
  | { type: "SELECT"; at: Position; hits: SelectionHit[] }
  | { type: "SET_PRIMARY"; index: number }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_DETAIL_OPEN"; open: boolean }
  | { type: "RESET"; defs: readonly LayerDefinition[] };

export function initialGisState(defs: readonly LayerDefinition[]): GisState {
  const visible: Record<string, boolean> = {}, labels: Record<string, boolean> = {};
  for (const d of defs) { visible[d.id] = d.defaultVisible; if (d.label) labels[d.id] = d.label.defaultOn; }
  return { schemaVersion: GIS_SCHEMA_VERSION, visible, labels, view: null, unitOperators: [], selection: null, detailOpen: false };
}

export function gisReducer(s: GisState, a: GisAction): GisState {
  switch (a.type) {
    case "SET_VISIBLE": return { ...s, visible: { ...s.visible, [a.id]: a.visible } };
    case "TOGGLE_VISIBLE": return { ...s, visible: { ...s.visible, [a.id]: !s.visible[a.id] } };
    case "SET_LABELS": return { ...s, labels: { ...s.labels, [a.id]: a.on } };
    case "SET_VIEW": return { ...s, view: a.view };
    // Changing the filter drops a selection that the map is about to stop drawing.
    case "TOGGLE_UNIT_OPERATOR": {
      const on = s.unitOperators.includes(a.operator);
      return { ...s, unitOperators: on ? s.unitOperators.filter((o) => o !== a.operator) : [...s.unitOperators, a.operator], selection: null };
    }
    case "SET_UNIT_OPERATORS": return { ...s, unitOperators: a.operators, selection: null };
    case "SELECT": return a.hits.length ? { ...s, selection: { at: a.at, hits: a.hits, primary: 0 }, detailOpen: true } : { ...s, selection: null };
    case "SET_PRIMARY": return s.selection ? { ...s, selection: { ...s.selection, primary: Math.max(0, Math.min(a.index, s.selection.hits.length - 1)) } } : s;
    case "CLEAR_SELECTION": return { ...s, selection: null };
    case "SET_DETAIL_OPEN": return { ...s, detailOpen: a.open };
    case "RESET": return initialGisState(a.defs);
  }
}
