/**
 * Leaflet is loaded on demand from an allowed script host the first time the
 * GIS opens, so the Deal Model's startup path is unchanged. The stylesheet is
 * inlined at build time (external CSS is blocked in the artifact).
 */
import type * as LeafletNs from "leaflet";
export type Leaflet = typeof LeafletNs;

export const LEAFLET_VERSION = "1.9.4";
export const LEAFLET_SCRIPT_URLS = [
  `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`,
  `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
];

let pending: Promise<Leaflet> | null = null;

function inject(src: string, doc: Document): Promise<void> {
  return new Promise((res, rej) => {
    const s = doc.createElement("script"); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error(`failed to load ${src}`));
    doc.head.appendChild(s);
  });
}

export function ensureLeaflet(win: any = globalThis): Promise<Leaflet> {
  if (win.L && typeof win.L.map === "function") return Promise.resolve(win.L as Leaflet);
  if (pending) return pending;
  pending = (async () => {
    let lastErr: Error | null = null;
    for (const url of LEAFLET_SCRIPT_URLS) {
      try { await inject(url, win.document); if (win.L) return win.L as Leaflet; } catch (e) { lastErr = e as Error; }
    }
    pending = null;
    throw lastErr ?? new Error("Leaflet did not load");
  })();
  return pending;
}
