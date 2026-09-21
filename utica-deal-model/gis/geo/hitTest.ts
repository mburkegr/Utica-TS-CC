/** Which features of which visible layers contain a clicked point. Independent of the map library. */
import type { Feature, Position } from "../layers/geojsonTypes";
import type { LayerData, LayerDefinition } from "../layers/types";
import { bboxContains, bboxOfGeometry, pointInGeometry, featureId } from "./geometry";

export interface Hit { def: LayerDefinition; featureId: string; feature: Feature }

/** Hits ordered by selectionPriority (desc), then registry order. Polygon layers only for now; point/line layers get a pixel-tolerance rule when they arrive. */
export function hitTest(p: Position, layers: { def: LayerDefinition; data: LayerData }[]): Hit[] {
  const hits: Hit[] = [];
  for (const { def, data } of layers) {
    if (!def.selectable || def.geometry !== "polygon") continue;
    if (!bboxContains(data.bbox, p)) continue;
    data.collection.features.forEach((f, i) => {
      const fb = f.bbox as [number, number, number, number] | undefined ?? bboxOfGeometry(f.geometry);
      if (!fb || !bboxContains(fb, p)) return;
      if (pointInGeometry(p, f.geometry)) hits.push({ def, featureId: featureId(f, def.idField, i), feature: f });
    });
  }
  return hits.sort((a, b) => b.def.selectionPriority - a.def.selectionPriority);
}
