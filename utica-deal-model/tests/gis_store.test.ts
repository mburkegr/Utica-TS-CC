/** LayerStore: eager vs lazy loading, one in-flight request per layer, session caching, error surfacing and retry. */
import { LayerStore, REFERENCE_LAYERS, type LayerStatus } from "../gis/index";
import type { LayerDefinition } from "../gis/index";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
console.log("\nGIS layer store");

const fc = (n: number) => JSON.stringify({ type: "FeatureCollection", features: Array.from({ length: n }, (_, i) => ({ type: "Feature", id: `f${i}`, properties: { NAME: `F${i}` }, geometry: { type: "Polygon", coordinates: [[[-81 + i * 0.01, 40], [-80.99 + i * 0.01, 40], [-80.99 + i * 0.01, 40.01], [-81 + i * 0.01, 40]]] } })) });
const optional: LayerDefinition = { ...REFERENCE_LAYERS[0], id: "test.optional", name: "Optional test", tier: "optional", loading: "lazy", defaultVisible: false, source: { kind: "asset", manifestKey: "opt" } };
const broken: LayerDefinition = { ...optional, id: "test.broken", source: { kind: "asset", manifestKey: "broken" } };
const unpublished: LayerDefinition = { ...optional, id: "test.unpublished", source: { kind: "asset", manifestKey: "unpub" } };
const defs = [...REFERENCE_LAYERS, optional, broken, unpublished];
const manifest = { layers: { counties: { file: "", sha256: "", asset: { id: "c", url: "/_blob/c" } }, townships: { file: "", sha256: "", asset: { id: "t", url: "/_blob/t" } }, phase_windows: { file: "", sha256: "", asset: { id: "p", url: "/_blob/p" } }, opt: { file: "", sha256: "", asset: { id: "o", url: "/_blob/o" } }, broken: { file: "", sha256: "", asset: { id: "b", url: "/_blob/b" } }, unpub: { file: "", sha256: "", asset: { id: "", url: "" } } } };
const calls: string[] = [];
const fetchImpl = async (url: string) => { calls.push(url); await new Promise((r) => setTimeout(r, 5)); if (url === "/_blob/b") return { ok: false, status: 404, text: async () => "" }; return { ok: true, status: 200, text: async () => fc(url === "/_blob/t" ? 168 : 3) }; };

async function main() {
  const store = new LayerStore(defs, manifest, fetchImpl);
  const events: string[] = []; store.subscribe((id, s: LayerStatus) => events.push(`${id}:${s.state}`));
  await store.loadEager();
  check("eager load fetches every reference layer once and nothing else", calls.sort().join(",") === "/_blob/c,/_blob/p,/_blob/t", calls.join(","));
  check("reference layers ready with indexed data", REFERENCE_LAYERS.every((d) => store.get(d.id).state === "ready") && store.data("ref.townships")!.featureCount === 168);
  check("optional layer untouched by eager load", store.get("test.optional").state === "idle");
  const p1 = store.load("test.optional"), p2 = store.load("test.optional");
  check("concurrent loads share one in-flight request", p1 === p2 && store.get("test.optional").state === "loading");
  await p1;
  const n = calls.length; await store.load("test.optional");
  check("ready layer is served from the session cache (no refetch)", calls.length === n);
  let err = ""; await store.load("test.broken").catch((e) => { err = e.message; });
  check("HTTP failure recorded as error status", store.get("test.broken").state === "error" && /404/.test(err), err);
  await store.load("test.unpublished").catch(() => undefined);
  check("unpublished asset reports not_published", store.get("test.unpublished").state === "error" && (store.get("test.unpublished") as any).code === "not_published");
  check("listeners saw loading then ready for a reference layer", events.indexOf("ref.counties:loading") < events.indexOf("ref.counties:ready"));
  store.evict("test.optional");
  check("evict returns an optional layer to idle", store.get("test.optional").state === "idle");
  console.log(failures ? `\n${failures} store check(s) FAILED` : "\nGIS store: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
