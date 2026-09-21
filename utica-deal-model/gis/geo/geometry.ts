/**
 * Pure geometry helpers on EPSG:4326 GeoJSON. No map library here so these run
 * in Node tests and stay reusable when the map adapter changes.
 */
import type { Feature, FeatureCollection, Geometry, Position } from "../layers/geojsonTypes";

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

/** Ohio and its neighbors, generous: anything outside is not EPSG:4326 lon/lat for this project. */
export const OHIO_REGION_BBOX: Bbox = [-85.0, 38.0, -80.0, 42.5];

export function isLonLat(p: Position): boolean { return Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90; }

export function forEachPosition(g: Geometry | null, fn: (p: Position) => void): void {
  if (!g) return;
  switch (g.type) {
    case "Point": fn(g.coordinates); break;
    case "MultiPoint": case "LineString": g.coordinates.forEach(fn); break;
    case "MultiLineString": case "Polygon": g.coordinates.forEach((r) => r.forEach(fn)); break;
    case "MultiPolygon": g.coordinates.forEach((poly) => poly.forEach((r) => r.forEach(fn))); break;
  }
}

export function bboxOfGeometry(g: Geometry | null): Bbox | null {
  let b: Bbox | null = null;
  forEachPosition(g, ([x, y]) => { b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y]; });
  return b;
}
export function bboxOfCollection(fc: FeatureCollection): Bbox | null {
  let b: Bbox | null = null;
  for (const f of fc.features) { const fb = bboxOfGeometry(f.geometry); if (fb) b = b ? unionBbox(b, fb) : fb; }
  return b;
}
export function unionBbox(a: Bbox, b: Bbox): Bbox { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
export function bboxContains(b: Bbox, [x, y]: Position): boolean { return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }
export function bboxWithin(inner: Bbox, outer: Bbox): boolean { return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]; }
/** Pad a bbox by a fraction of its size on each side (for default map extents). */
export function padBbox(b: Bbox, frac: number): Bbox { const dx = (b[2] - b[0]) * frac, dy = (b[3] - b[1]) * frac; return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy]; }

/** Ray-casting point in ring (planar on lon/lat; fine at county scale). */
function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygonRings(p: Position, rings: Position[][]): boolean {
  if (!rings.length || !pointInRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(p, rings[i])) return false; // holes
  return true;
}
export function pointInGeometry(p: Position, g: Geometry | null): boolean {
  if (!g) return false;
  if (g.type === "Polygon") return pointInPolygonRings(p, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((rings) => pointInPolygonRings(p, rings));
  return false;
}

/** Signed planar area of a ring (shoelace) and its centroid. */
function ringAreaCentroid(ring: Position[]): { area: number; cx: number; cy: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j], [x1, y1] = ring[i]; const c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  a *= 0.5;
  return a === 0 ? { area: 0, cx: ring[0]?.[0] ?? 0, cy: ring[0]?.[1] ?? 0 } : { area: a, cx: cx / (6 * a), cy: cy / (6 * a) };
}
/** Label anchor: area-weighted centroid of the largest polygon part (outer ring). Falls back to bbox center. */
export function labelAnchor(g: Geometry | null): Position | null {
  if (!g) return null;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let best: { area: number; cx: number; cy: number } | null = null;
  for (const rings of polys) { if (!rings[0]) continue; const r = ringAreaCentroid(rings[0]); if (!best || Math.abs(r.area) > Math.abs(best.area)) best = r; }
  if (best) return [best.cx, best.cy];
  const b = bboxOfGeometry(g); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

/** Feature identity: `feature.id` when present, else the registered id property, else the index. */
export function featureId(f: Feature, idField: string, index: number): string {
  if (f.id !== undefined && f.id !== null) return String(f.id);
  const v = f.properties?.[idField]; return v === undefined || v === null ? String(index) : String(v);
}

export interface ValidationIssue { feature: number; message: string }
/** Structural validation for a browser-ready layer: EPSG:4326 lon/lat inside the project region, no null geometry, expected geometry class. */
export function validateCollection(fc: FeatureCollection, expected: "polygon" | "line" | "point", region: Bbox = OHIO_REGION_BBOX): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) return [{ feature: -1, message: "not a FeatureCollection" }];
  const ok: Record<typeof expected, string[]> = { polygon: ["Polygon", "MultiPolygon"], line: ["LineString", "MultiLineString"], point: ["Point", "MultiPoint"] };
  fc.features.forEach((f, i) => {
    if (!f.geometry) { issues.push({ feature: i, message: "null geometry" }); return; }
    if (!ok[expected].includes(f.geometry.type)) issues.push({ feature: i, message: `geometry ${f.geometry.type} is not ${expected}` });
    let bad = 0, outside = 0;
    forEachPosition(f.geometry, (p) => { if (!isLonLat(p)) bad++; else if (!bboxContains(region, p)) outside++; });
    if (bad) issues.push({ feature: i, message: `${bad} coordinates are not valid lon/lat` });
    if (outside) issues.push({ feature: i, message: `${outside} coordinates fall outside the project region (is this EPSG:4326?)` });
  });
  return issues;
}
