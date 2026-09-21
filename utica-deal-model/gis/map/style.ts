/** Resolves registry style specs (theme tokens) into concrete path options for the current theme. */
import type { Feature } from "../layers/geojsonTypes";
import type { LayerDefinition, PathStyle, StyleSpec } from "../layers/types";

export interface ResolvedPath { color: string; weight: number; opacity: number; dashArray?: string; fill: boolean; fillColor?: string; fillOpacity: number }

export type TokenResolver = (token: string) => string;

/** Reads a CSS custom property from :root; "currentColor" when the token is undefined so a missing token is visible, not invisible. */
export function cssTokenResolver(doc: Document | undefined = (globalThis as any).document): TokenResolver {
  return (token) => {
    if (!doc || typeof (globalThis as any).getComputedStyle !== "function") return "currentColor";
    const v = (globalThis as any).getComputedStyle(doc.documentElement).getPropertyValue(token).trim();
    return v || "currentColor";
  };
}

export function resolvePath(s: PathStyle, resolve: TokenResolver): ResolvedPath {
  return { color: resolve(s.stroke), weight: s.weight, opacity: s.opacity ?? 1, dashArray: s.dashArray, fill: s.fill !== undefined, fillColor: s.fill ? resolve(s.fill) : undefined, fillOpacity: s.fillOpacity ?? 0 };
}

/** Class key of a feature under a categorical style, or null for static styles. */
export function classKey(spec: StyleSpec, f: Feature): string | null {
  if (spec.kind !== "categorical") return null;
  const raw = f.properties?.[spec.field];
  return spec.classify ? spec.classify(raw, f) : String(raw ?? "");
}

export function styleForFeature(def: LayerDefinition, f: Feature, resolve: TokenResolver): ResolvedPath {
  const spec = def.style;
  if (spec.kind === "static") return resolvePath(spec.style, resolve);
  const k = classKey(spec, f); const cls = (k !== null && spec.classes[k]) || spec.fallback;
  return resolvePath(cls, resolve);
}

export interface LegendEntry { key: string; label: string; style: PathStyle; kind: "fill" | "line" }
/** Legend rows for a layer, in registry order. */
export function legendFor(def: LayerDefinition): LegendEntry[] {
  const spec = def.style;
  const kind = (s: PathStyle): "fill" | "line" => (s.fill && (s.fillOpacity ?? 0) > 0 ? "fill" : "line");
  if (spec.kind === "static") return [{ key: "static", label: spec.legendLabel, style: spec.style, kind: kind(spec.style) }];
  const keys = [...(spec.order ?? []), ...Object.keys(spec.classes).filter((k) => !(spec.order ?? []).includes(k))];
  return keys.map((k) => ({ key: k, label: spec.classes[k].label, style: spec.classes[k], kind: kind(spec.classes[k]) }));
}
