/**
 * Greedy screen-space label placement. Candidates are considered in priority
 * order (largest polygon first by default); a label is kept only if its box
 * lies inside the viewport and does not overlap an already-kept label.
 * Framework-free: callers project anchors to pixels and pass estimated sizes.
 */
export interface LabelCandidate { id: string; x: number; y: number; width: number; height: number; priority: number }
export interface Viewport { width: number; height: number }

const overlaps = (a: LabelCandidate, b: LabelCandidate, pad: number) =>
  Math.abs(a.x - b.x) * 2 < a.width + b.width + pad && Math.abs(a.y - b.y) * 2 < a.height + b.height + pad;

/** Ids of the candidates to show. Boxes are centered on (x, y). */
export function placeLabels(cands: LabelCandidate[], vp: Viewport, pad = 4): Set<string> {
  const kept: LabelCandidate[] = [];
  for (const c of [...cands].sort((a, b) => b.priority - a.priority)) {
    const inside = c.x - c.width / 2 >= 0 && c.y - c.height / 2 >= 0 && c.x + c.width / 2 <= vp.width && c.y + c.height / 2 <= vp.height;
    if (!inside) continue;
    if (kept.some((k) => overlaps(k, c, pad))) continue;
    kept.push(c);
  }
  return new Set(kept.map((k) => k.id));
}

/** Rough pixel size of a label from its text; callers can override per LabelSpec. */
export function estimateLabelSize(text: string, fontPx: number, paddingPx = 0): { width: number; height: number } {
  return { width: Math.ceil(text.length * fontPx * 0.62) + paddingPx * 2, height: Math.ceil(fontPx * 1.3) + paddingPx * 2 };
}
