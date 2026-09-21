/**
 * The seam between GIS state and the map library. The React layer talks only
 * to this interface; `leafletAdapter` implements it and tests use a fake.
 * Coordinates crossing this boundary are GeoJSON order: [lon, lat].
 */
import type { Position } from "../layers/geojsonTypes";
import type { LayerData, LayerDefinition, LayerId } from "../layers/types";
import type { Bbox } from "../geo/geometry";

export interface MapView { center: Position; zoom: number }
export interface Selection { layerId: LayerId; featureId: string }

export interface MapAdapterEvents {
  onClick(lonLat: Position): void;
  onViewChange(view: MapView): void;
  onReady(): void;
  onError(message: string): void;
}

export interface MapAdapter {
  /** Attach to a container. Resolves once the map library is available and the map exists. */
  mount(container: HTMLElement, opts: { view: MapView; events: MapAdapterEvents }): Promise<void>;
  destroy(): void;
  /** Call after the container becomes visible again (hidden modules do not lay out). */
  invalidateSize(): void;
  /** Show `data` for `def` (or remove the layer when `data` is null). Idempotent. */
  setLayer(def: LayerDefinition, data: LayerData | null): void;
  /** Show or hide feature labels for a layer that has a LabelSpec. Idempotent. */
  setLabels(def: LayerDefinition, data: LayerData | null): void;
  setHighlight(def: LayerDefinition | null, data: LayerData | null, sel: Selection | null): void;
  fitBbox(bbox: Bbox, paddingPx?: number): void;
  getView(): MapView | null;
  openPopup(lonLat: Position, html: string): void;
  closePopup(): void;
  /** Re-resolve theme tokens (light/dark switch). */
  refreshTheme(): void;
}

export type MapAdapterFactory = () => MapAdapter;
