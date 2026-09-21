/**
 * Fetches a layer's GeoJSON from its registered source and indexes it.
 * Asset-hosted layers resolve through the manifest (url filled at publish).
 */
import type { FeatureCollection } from "../layers/geojsonTypes";
import type { LayerData, LayerDefinition } from "../layers/types";
import type { ManifestLike } from "../layers/registry";
import { bboxOfCollection, featureId } from "../geo/geometry";

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function resolveSourceUrl(def: LayerDefinition, manifest: ManifestLike): string | null {
  switch (def.source.kind) {
    case "url": return def.source.url;
    case "asset": { const e = manifest.layers[def.source.manifestKey]; return e && e.asset.url ? e.asset.url : null; }
    case "inline": return null;
  }
}

export function indexCollection(def: LayerDefinition, fc: FeatureCollection): LayerData {
  const byId = new Map<string, FeatureCollection["features"][number]>();
  fc.features.forEach((f, i) => { const id = featureId(f, def.idField, i); if (f.id === undefined) f.id = id; byId.set(id, f); });
  const bbox = bboxOfCollection(fc);
  if (!bbox) throw new Error(`${def.id}: layer has no geometry`);
  return { collection: fc, bbox, featureCount: fc.features.length, byId };
}

export class LayerLoadError extends Error { constructor(public layerId: string, message: string, public code: "not_published" | "http" | "parse" | "inline_missing") { super(message); } }

export async function loadLayer(def: LayerDefinition, manifest: ManifestLike, fetchImpl: FetchLike, doc?: { getElementById(id: string): { textContent: string | null } | null }): Promise<LayerData> {
  let text: string;
  if (def.source.kind === "inline") {
    const el = doc?.getElementById(def.source.elementId);
    if (!el || !el.textContent) throw new LayerLoadError(def.id, `inline data element ${def.source.elementId} missing`, "inline_missing");
    text = el.textContent;
  } else {
    const url = resolveSourceUrl(def, manifest);
    if (!url) throw new LayerLoadError(def.id, `${def.name} is not published to the artifact asset store yet`, "not_published");
    const r = await fetchImpl(url);
    if (!r.ok) throw new LayerLoadError(def.id, `${def.name}: HTTP ${r.status} fetching ${url}`, "http");
    text = await r.text();
  }
  let fc: FeatureCollection;
  try { fc = JSON.parse(text) as FeatureCollection; } catch (e) { throw new LayerLoadError(def.id, `${def.name}: invalid JSON`, "parse"); }
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new LayerLoadError(def.id, `${def.name}: not a FeatureCollection`, "parse");
  return indexCollection(def, fc);
}
