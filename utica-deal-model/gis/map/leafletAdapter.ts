/**
 * Leaflet 1.9 implementation of MapAdapter. This is the only file that touches
 * Leaflet. Polygons are drawn non-interactive; hit-testing is done in
 * gis/geo/hitTest so one click can report every layer under the cursor.
 */
import type * as LT from "leaflet";
import type { Feature, Position } from "../layers/geojsonTypes";
import type { LayerData, LayerDefinition } from "../layers/types";
import type { Bbox } from "../geo/geometry";
import { labelAnchor, bboxOfGeometry } from "../geo/geometry";
import { placeLabels, estimateLabelSize, type LabelCandidate } from "../geo/labels";
import type { MapAdapter, MapAdapterEvents, MapView, Selection } from "./MapAdapter";
import { ensureLeaflet, type Leaflet } from "./leafletLoader";
import { cssTokenResolver, styleForFeature, type TokenResolver } from "./style";

const PANE_BASE = 400;       // Leaflet overlayPane
const PANE_HIGHLIGHT = 499;
const PANE_LABELS = 560;     // above overlays, below markerPane (600) and popups (700)
const HIGHLIGHT_STYLE = { color: "--gis-highlight-line", weight: 3, fill: "--gis-highlight-fill", fillOpacity: 0.18 } as const;

interface LayerEntry { def: LayerDefinition; data: LayerData; layer: LT.GeoJSON }
interface LabelItem { id: string; marker: LT.Marker; lonLat: Position; width: number; height: number; priority: number }
interface LabelEntry { def: LayerDefinition; data: LayerData; group: LT.LayerGroup; items: LabelItem[] }

export class LeafletAdapter implements MapAdapter {
  private L: Leaflet | null = null;
  private map: LT.Map | null = null;
  private layers = new Map<string, LayerEntry>();
  private labels = new Map<string, LabelEntry>();
  private highlight: LT.GeoJSON | null = null;
  private popup: LT.Popup | null = null;
  private events: MapAdapterEvents | null = null;
  private resolve: TokenResolver = cssTokenResolver();
  private themeCleanup: (() => void) | null = null;
  constructor(private loader: () => Promise<Leaflet> = () => ensureLeaflet()) {}

  async mount(container: HTMLElement, opts: { view: MapView; events: MapAdapterEvents }): Promise<void> {
    this.events = opts.events;
    try { this.L = await this.loader(); } catch (e) { opts.events.onError(e instanceof Error ? e.message : String(e)); throw e; }
    const L = this.L;
    const map = L.map(container, { zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, attributionControl: false, preferCanvas: false });
    map.setView([opts.view.center[1], opts.view.center[0]], opts.view.zoom);
    L.control.scale({ imperial: true, metric: false, position: "bottomright" }).addTo(map);
    map.createPane("gis-highlight").style.zIndex = String(PANE_HIGHLIGHT);
    map.createPane("gis-labels").style.zIndex = String(PANE_LABELS);
    map.on("click", (e: LT.LeafletMouseEvent) => this.events?.onClick([e.latlng.lng, e.latlng.lat]));
    map.on("moveend zoomend", () => { const v = this.getView(); if (v) this.events?.onViewChange(v); this.applyLabelZoom(); });
    this.map = map;
    this.watchTheme();
    opts.events.onReady();
  }

  destroy(): void { this.themeCleanup?.(); this.themeCleanup = null; this.map?.remove(); this.map = null; this.layers.clear(); this.labels.clear(); this.highlight = null; this.popup = null; }
  invalidateSize(): void { this.map?.invalidateSize({ animate: false }); }

  private paneFor(def: LayerDefinition): string {
    const name = `gis-layer-${def.id}`;
    if (this.map && !this.map.getPane(name)) this.map.createPane(name).style.zIndex = String(PANE_BASE + def.zIndex);
    return name;
  }

  private pathOptions(def: LayerDefinition, f: Feature, pane: string): LT.PathOptions {
    const s = styleForFeature(def, f, this.resolve);
    return { pane, interactive: false, color: s.color, weight: s.weight, opacity: s.opacity, dashArray: s.dashArray, fill: s.fill, fillColor: s.fillColor, fillOpacity: s.fillOpacity, lineJoin: "round" };
  }

  setLayer(def: LayerDefinition, data: LayerData | null): void {
    if (!this.map || !this.L) return;
    const cur = this.layers.get(def.id);
    if (!data) { if (cur) { this.map.removeLayer(cur.layer); this.layers.delete(def.id); } return; }
    if (cur && cur.data === data) return;
    if (cur) this.map.removeLayer(cur.layer);
    const pane = this.paneFor(def);
    const renderer = def.renderer === "canvas" ? this.L.canvas({ pane, padding: 0.5 }) : this.L.svg({ pane, padding: 0.5 });
    const layer = this.L.geoJSON(data.collection as any, { pane, renderer, interactive: false, style: (f: any) => this.pathOptions(def, f as Feature, pane) } as any);
    layer.addTo(this.map);
    this.layers.set(def.id, { def, data, layer });
  }

  setLabels(def: LayerDefinition, data: LayerData | null): void {
    if (!this.map || !this.L || !def.label) return;
    const cur = this.labels.get(def.id);
    if (!data) { if (cur) { this.map.removeLayer(cur.group); this.labels.delete(def.id); } return; }
    if (cur && cur.data === data) return;
    if (cur) this.map.removeLayer(cur.group);
    const L = this.L, spec = def.label, group = L.layerGroup(), items: LabelItem[] = [];
    data.collection.features.forEach((f, i) => {
      const p = f.properties ?? {}; const text = spec.derive ? spec.derive(p) : String(p[spec.field] ?? "");
      const a = labelAnchor(f.geometry); if (!a || !text) return;
      const icon = L.divIcon({ className: spec.className, html: `<span>${escapeHtml(text)}</span>`, iconSize: undefined as any });
      const marker = L.marker([a[1], a[0]], { icon, interactive: false, keyboard: false, pane: "gis-labels" });
      const size = estimateLabelSize(text, spec.fontPx ?? 12, spec.paddingPx ?? 0);
      const b = bboxOfGeometry(f.geometry); const area = b ? (b[2] - b[0]) * (b[3] - b[1]) : 0;
      items.push({ id: String(f.id ?? i), marker, lonLat: a, width: size.width, height: size.height, priority: spec.priority ? spec.priority(f) : area });
      if (!spec.avoidCollisions) marker.addTo(group);
    });
    this.labels.set(def.id, { def, data, group, items });
    this.applyLabelZoom();
  }

  /**
   * Labels with a minZoom attach only when zoomed in far enough. Layers that
   * avoid collisions re-place their labels on every move: highest priority
   * first, dropping any label that would overlap or leave the viewport.
   */
  private applyLabelZoom(): void {
    if (!this.map) return;
    const map = this.map, z = map.getZoom(), size = map.getSize();
    for (const e of this.labels.values()) {
      const show = e.def.label?.minZoom === undefined || z >= e.def.label.minZoom;
      if (show && !map.hasLayer(e.group)) e.group.addTo(map);
      if (!show && map.hasLayer(e.group)) map.removeLayer(e.group);
      if (!show || !e.def.label?.avoidCollisions) continue;
      const cands: LabelCandidate[] = e.items.map((it) => { const pt = map.latLngToContainerPoint([it.lonLat[1], it.lonLat[0]]); return { id: it.id, x: pt.x, y: pt.y, width: it.width, height: it.height, priority: it.priority }; });
      const keep = placeLabels(cands, { width: size.x, height: size.y });
      for (const it of e.items) { const on = e.group.hasLayer(it.marker); if (keep.has(it.id) && !on) it.marker.addTo(e.group); if (!keep.has(it.id) && on) e.group.removeLayer(it.marker); }
    }
  }

  setHighlight(def: LayerDefinition | null, data: LayerData | null, sel: Selection | null): void {
    if (!this.map || !this.L) return;
    if (this.highlight) { this.map.removeLayer(this.highlight); this.highlight = null; }
    if (!def || !data || !sel) return;
    const f = data.byId.get(sel.featureId); if (!f) return;
    this.highlight = this.L.geoJSON(f as any, { pane: "gis-highlight", interactive: false, style: () => ({ pane: "gis-highlight", interactive: false, color: this.resolve(HIGHLIGHT_STYLE.color), weight: HIGHLIGHT_STYLE.weight, fill: true, fillColor: this.resolve(HIGHLIGHT_STYLE.fill), fillOpacity: HIGHLIGHT_STYLE.fillOpacity }) } as any).addTo(this.map);
  }

  fitBbox(b: Bbox, paddingPx = 16): void { this.map?.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [paddingPx, paddingPx], animate: false }); }
  getView(): MapView | null { if (!this.map) return null; const c = this.map.getCenter(); return { center: [c.lng, c.lat], zoom: this.map.getZoom() }; }

  openPopup(lonLat: Position, html: string): void {
    if (!this.map || !this.L) return;
    this.closePopup();
    this.popup = this.L.popup({ maxWidth: 320, className: "gis-popup", closeButton: true, autoPan: true }).setLatLng([lonLat[1], lonLat[0]]).setContent(html).openOn(this.map);
  }
  closePopup(): void { if (this.popup && this.map) { this.map.closePopup(this.popup); this.popup = null; } }

  refreshTheme(): void {
    if (!this.map) return;
    this.resolve = cssTokenResolver();
    for (const e of this.layers.values()) { const pane = this.paneFor(e.def); e.layer.setStyle((f) => this.pathOptions(e.def, f as Feature, pane)); }
  }

  private watchTheme(): void {
    const w = globalThis as any;
    const mq: MediaQueryList | null = typeof w.matchMedia === "function" ? w.matchMedia("(prefers-color-scheme: dark)") : null;
    const onChange = () => this.refreshTheme();
    mq?.addEventListener?.("change", onChange);
    const mo = typeof w.MutationObserver === "function" && w.document ? new w.MutationObserver(onChange) : null;
    mo?.observe(w.document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.themeCleanup = () => { mq?.removeEventListener?.("change", onChange); mo?.disconnect(); };
  }
}

export function escapeHtml(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string); }

export const createLeafletAdapter = (): MapAdapter => new LeafletAdapter();
