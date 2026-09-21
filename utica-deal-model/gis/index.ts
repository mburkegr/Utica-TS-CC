/** Public surface of the GIS library (framework-free). UI code imports only from here. */
export type * from "./layers/types";
export type { Feature, FeatureCollection, Geometry, Position } from "./layers/geojsonTypes";
export { LAYER_REGISTRY, REFERENCE_LAYERS, OPTIONAL_LAYERS, PHASE_ORDER, UNIT_STATUS_ORDER, getLayer, layersInDrawOrder, styleTokens, validateRegistry, phaseOf, regionOf, type ManifestLike } from "./layers/registry";
export { LayerStore, type LayerStatus, type StoreListener } from "./data/layerStore";
export { loadLayer, indexCollection, resolveSourceUrl, LayerLoadError, type FetchLike } from "./data/loaders";
export { bboxOfCollection, bboxOfGeometry, unionBbox, padBbox, bboxWithin, labelAnchor, pointInGeometry, validateCollection, featureId, OHIO_REGION_BBOX, type Bbox, type ValidationIssue } from "./geo/geometry";
export { hitTest, type Hit } from "./geo/hitTest";
export { placeLabels, estimateLabelSize, type LabelCandidate, type Viewport } from "./geo/labels";
export type { MapAdapter, MapAdapterEvents, MapAdapterFactory, MapView, Selection } from "./map/MapAdapter";
export { createLeafletAdapter, LeafletAdapter, escapeHtml } from "./map/leafletAdapter";
export { ensureLeaflet, LEAFLET_VERSION, LEAFLET_SCRIPT_URLS } from "./map/leafletLoader";
export { legendFor, styleForFeature, classKey, cssTokenResolver, type LegendEntry, type TokenResolver } from "./map/style";
export { formatValue, fieldValue, popupSection, popupHtml, type PopupSection } from "./format";
