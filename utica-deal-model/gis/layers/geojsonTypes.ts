/** Minimal RFC 7946 types (no dependency on @types/geojson). Coordinates are [lon, lat] in EPSG:4326. */
export type Position = [number, number] | [number, number, number];
export interface Point { type: "Point"; coordinates: Position }
export interface MultiPoint { type: "MultiPoint"; coordinates: Position[] }
export interface LineString { type: "LineString"; coordinates: Position[] }
export interface MultiLineString { type: "MultiLineString"; coordinates: Position[][] }
export interface Polygon { type: "Polygon"; coordinates: Position[][] }
export interface MultiPolygon { type: "MultiPolygon"; coordinates: Position[][][] }
export type Geometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon;
export interface Feature { type: "Feature"; id?: string | number; geometry: Geometry | null; properties: Record<string, unknown> | null; bbox?: number[] }
export interface FeatureCollection { type: "FeatureCollection"; features: Feature[]; bbox?: number[]; crs?: unknown }
