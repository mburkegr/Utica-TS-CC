/** Attribute formatting for popups and the detail panel (framework-free). */
import type { FieldFormat, LayerDefinition, PopupField } from "./layers/types";
import { escapeHtml } from "./map/leafletAdapter";

const SQM_PER_ACRE = 4046.8564224;
const nf = (d: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

export function formatValue(v: unknown, format: FieldFormat = "text"): string {
  if (v === null || v === undefined || v === "") return "n/a";
  switch (format) {
    case "integer": return typeof v === "number" ? nf(0).format(v) : String(v);
    case "number": return typeof v === "number" ? nf(2).format(v) : String(v);
    case "acres_from_m2": return typeof v === "number" ? nf(0).format(v / SQM_PER_ACRE) : String(v);
    case "percent": return typeof v === "number" ? `${nf(1).format(v * 100)}%` : String(v);
    case "date": return String(v);
    default: return String(v);
  }
}

export function fieldValue(f: PopupField, props: Record<string, unknown>): string { return formatValue(f.derive ? f.derive(props) : props[f.key], f.format); }

export interface PopupSection { layerId: string; layerName: string; title: string; rows: { label: string; value: string }[] }

export function popupSection(def: LayerDefinition, props: Record<string, unknown>): PopupSection {
  return { layerId: def.id, layerName: def.name, title: def.popup.title(props), rows: def.popup.fields.map((f) => ({ label: f.label, value: fieldValue(f, props) })) };
}

/** Concise popup: one section per layer under the click, top priority first. */
export function popupHtml(sections: PopupSection[]): string {
  return `<div class="gis-popup-body">${sections.map((s) => `<section data-layer="${escapeHtml(s.layerId)}"><div class="gis-popup-layer">${escapeHtml(s.layerName)}</div><div class="gis-popup-title">${escapeHtml(s.title)}</div><dl>${s.rows.map((r) => `<dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd>`).join("")}</dl></section>`).join("")}</div>`;
}
