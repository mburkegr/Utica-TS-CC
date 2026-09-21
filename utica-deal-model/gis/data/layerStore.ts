/**
 * Session cache of loaded layers with a small status machine. One in-flight
 * request per layer; loaded data is kept for the session (reference layers are
 * small; optional layers can be evicted with `evict`).
 */
import type { LayerData, LayerDefinition, LayerId } from "../layers/types";
import type { ManifestLike } from "../layers/registry";
import { loadLayer, type FetchLike, LayerLoadError } from "./loaders";

export type LayerStatus =
  | { state: "idle" }
  | { state: "loading"; startedAt: number }
  | { state: "ready"; data: LayerData; loadedAt: number; ms: number }
  | { state: "error"; message: string; code: LayerLoadError["code"] | "unknown" };

export type StoreListener = (id: LayerId, status: LayerStatus) => void;

export class LayerStore {
  private status = new Map<LayerId, LayerStatus>();
  private inflight = new Map<LayerId, Promise<LayerData>>();
  private listeners = new Set<StoreListener>();
  constructor(private defs: readonly LayerDefinition[], private manifest: ManifestLike, private fetchImpl: FetchLike, private now: () => number = () => Date.now()) {}

  get(id: LayerId): LayerStatus { return this.status.get(id) ?? { state: "idle" }; }
  data(id: LayerId): LayerData | null { const s = this.get(id); return s.state === "ready" ? s.data : null; }
  subscribe(fn: StoreListener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(id: LayerId, s: LayerStatus) { this.status.set(id, s); this.listeners.forEach((l) => l(id, s)); }

  /** Idempotent: a ready layer resolves immediately, an in-flight load is shared. */
  load(id: LayerId): Promise<LayerData> {
    const s = this.get(id);
    if (s.state === "ready") return Promise.resolve(s.data);
    const f = this.inflight.get(id); if (f) return f;
    const def = this.defs.find((d) => d.id === id); if (!def) return Promise.reject(new Error(`unknown layer ${id}`));
    const t0 = this.now(); this.set(id, { state: "loading", startedAt: t0 });
    const p = loadLayer(def, this.manifest, this.fetchImpl, (globalThis as any).document)
      .then((data) => { this.set(id, { state: "ready", data, loadedAt: this.now(), ms: this.now() - t0 }); return data; })
      .catch((e) => { this.set(id, { state: "error", message: e instanceof Error ? e.message : String(e), code: e instanceof LayerLoadError ? e.code : "unknown" }); throw e; })
      .finally(() => { this.inflight.delete(id); });
    this.inflight.set(id, p);
    return p;
  }
  /** Load every eager layer in parallel; individual failures are recorded, not thrown. */
  loadEager(): Promise<void> { return Promise.all(this.defs.filter((d) => d.loading === "eager").map((d) => this.load(d.id).catch(() => undefined))).then(() => undefined); }
  evict(id: LayerId): void { if (!this.inflight.has(id)) this.set(id, { state: "idle" }); }
  retry(id: LayerId): Promise<LayerData> { if (this.get(id).state === "error") this.status.delete(id); return this.load(id); }
}
