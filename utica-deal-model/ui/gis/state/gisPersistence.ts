/** Per-browser GIS preferences: layer and label visibility plus the last map view. Never feature data. */
import type { LayerDefinition } from "../../../gis/index";
import { GIS_SCHEMA_VERSION, initialGisState, type GisState } from "./gisReducer";

export const GIS_STORAGE_KEY = "utica-gis-v1";
export const GIS_SAVE_DEBOUNCE_MS = 400;

interface Saved { schemaVersion: string; savedAt: string; visible: GisState["visible"]; labels: GisState["labels"]; view: GisState["view"] }

export function saveGisState(s: GisState): void {
  try { const d: Saved = { schemaVersion: GIS_SCHEMA_VERSION, savedAt: new Date().toISOString(), visible: s.visible, labels: s.labels, view: s.view }; globalThis.localStorage?.setItem(GIS_STORAGE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

/** Restore on top of registry defaults so newly registered layers get their default visibility. */
export function loadGisState(defs: readonly LayerDefinition[]): GisState {
  const base = initialGisState(defs);
  try {
    const raw = globalThis.localStorage?.getItem(GIS_STORAGE_KEY); if (!raw) return base;
    const d = JSON.parse(raw) as Saved; if (d.schemaVersion !== GIS_SCHEMA_VERSION) return base;
    const visible = { ...base.visible }, labels = { ...base.labels };
    for (const k of Object.keys(visible)) if (typeof d.visible?.[k] === "boolean") visible[k] = d.visible[k];
    for (const k of Object.keys(labels)) if (typeof d.labels?.[k] === "boolean") labels[k] = d.labels[k];
    const view = d.view && Array.isArray(d.view.center) && typeof d.view.zoom === "number" ? d.view : null;
    return { ...base, visible, labels, view };
  } catch { return base; }
}
export function clearGisState(): void { try { globalThis.localStorage?.removeItem(GIS_STORAGE_KEY); } catch { /* ignore */ } }
