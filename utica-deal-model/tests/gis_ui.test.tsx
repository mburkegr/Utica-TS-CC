/**
 * GIS module in jsdom with a fake MapAdapter (Leaflet is not exercised here; the
 * adapter interface is the seam) and a fetch that serves the tracked GeoJSON.
 * Covers: eager reference loading, layer toggles, township-name toggle (labels
 * only), click → popup + detail panel, zoom-to-layer / feature, and the shell.
 */
import "global-jsdom/register";
import * as fs from "node:fs"; import * as path from "node:path";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AppShell } from "../ui/shell/AppShell";
import { initialState } from "../ui/state/defaults";
import { deck, lib } from "./adapters";
import { LAYER_REGISTRY, LayerStore, labelAnchor, unitStatusLabel, type MapAdapter, type MapAdapterEvents, type LayerDefinition, type LayerData, type Selection, type Bbox, type Position } from "../gis/index";
import manifest from "../gis-data/manifest.json";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };

/** Serves /_blob/<key> from the tracked files so the UI test exercises the real datasets without a network. */
const testManifest = { layers: Object.fromEntries(Object.entries((manifest as any).layers).map(([k, v]: [string, any]) => [k, { ...v, asset: { id: k, url: `/_blob/${k}` } }])) };
const fetchImpl = async (url: string) => { const key = url.replace("/_blob/", ""); const file = path.join(root, testManifest.layers[key].file); return { ok: true, status: 200, text: async () => fs.readFileSync(file, "utf8") }; };

class FakeAdapter implements MapAdapter {
  calls: string[] = []; layers = new Map<string, LayerData | null>(); labels = new Map<string, LayerData | null>(); highlight: Selection | null = null; popup: string | null = null; fits: Bbox[] = []; events!: MapAdapterEvents; mounted = false;
  async mount(_c: HTMLElement, opts: { events: MapAdapterEvents }) { this.events = opts.events; this.mounted = true; setTimeout(() => opts.events.onReady(), 0); }
  destroy() { this.mounted = false; } invalidateSize() { this.calls.push("invalidateSize"); }
  setLayer(def: LayerDefinition, data: LayerData | null) { if (this.layers.get(def.id) !== data) this.calls.push(`setLayer:${def.id}:${data ? "on" : "off"}`); this.layers.set(def.id, data); }
  setLabels(def: LayerDefinition, data: LayerData | null) { if (this.labels.get(def.id) !== data) this.calls.push(`setLabels:${def.id}:${data ? "on" : "off"}`); this.labels.set(def.id, data); }
  setHighlight(_d: LayerDefinition | null, _data: LayerData | null, sel: Selection | null) { this.highlight = sel; }
  fitBbox(b: Bbox) { this.fits.push(b); } getView() { return null; }
  openPopup(_p: Position, html: string) { this.popup = html; } closePopup() { this.popup = null; } refreshTheme() {}
  click(p: Position) { this.events.onClick(p); }
}

async function main() {
  console.log("\nGIS module (fake map adapter)");
  const adapter = new FakeAdapter();
  const store = new LayerStore(LAYER_REGISTRY, testManifest as any, fetchImpl);
  render(<AppShell data={{ typeCurves: lib, priceDeck: deck }} initial={initialState(deck)} restoreDraft={false} initialModule="deal" gis={{ adapterFactory: () => adapter, store, restorePrefs: false }} />);
  fireEvent.click(screen.getByTestId("module-gis"));
  await waitFor(() => { if (!adapter.mounted) throw new Error("map not mounted"); });
  await waitFor(() => { if (!/3 layers/.test(screen.getByTestId("gis-status").textContent ?? "")) throw new Error("layers not loaded"); }, { timeout: 5000 });
  check("opening GIS loads all three reference layers", /3 layers · 197 features/.test(screen.getByTestId("gis-status").textContent ?? ""), screen.getByTestId("gis-status").textContent ?? "");
  await waitFor(() => { if (adapter.layers.get("ref.counties") == null) throw new Error("not on map"); });
  check("every reference layer is placed on the map", ["ref.counties", "ref.townships", "ref.phase_windows"].every((id) => adapter.layers.get(id) != null));
  check("county labels on by default, township labels off", adapter.labels.get("ref.counties") != null && adapter.labels.get("ref.townships") == null);
  check("map fit to the union of the reference layers once loaded", adapter.fits.length === 1 && adapter.fits[0][0] < -81.72 && adapter.fits[0][2] > -80.52 && adapter.fits[0][1] < 39.54 && adapter.fits[0][3] > 40.98, adapter.fits.map((b) => b.map((v) => v.toFixed(2)).join(",")).join(" | "));
  check("layer panel lists the reference layers, Type Curve Areas and ODNR Units under Layer library", ["ref.counties", "ref.townships", "ref.phase_windows", "opt.tc_areas", "opt.odnr_units"].every((id) => screen.getByTestId(`layer-toggle-${id}`)) && document.querySelector('[data-testid="optional-empty"]') === null);
  check("optional layers are not fetched until toggled", ["opt.tc_areas", "opt.odnr_units"].every((id) => store.get(id).state === "idle" && adapter.layers.get(id) == null));
  check("phase legend shows six classes", screen.getByTestId("legend-ref.phase_windows").querySelectorAll(".gis-legend-row").length === 6);

  // Visibility toggle removes the layer and its labels; toggling back restores both.
  fireEvent.click(screen.getByTestId("layer-toggle-ref.counties"));
  await waitFor(() => { if (adapter.layers.get("ref.counties") != null) throw new Error("still on"); });
  check("unchecking Counties removes the layer and its labels", adapter.layers.get("ref.counties") == null && adapter.labels.get("ref.counties") == null);
  fireEvent.click(screen.getByTestId("layer-toggle-ref.counties"));
  await waitFor(() => { if (adapter.layers.get("ref.counties") == null) throw new Error("still off"); });
  check("re-checking Counties restores the layer and labels", adapter.layers.get("ref.counties") != null && adapter.labels.get("ref.counties") != null);

  // Township names: labels only, never the boundary layer.
  const before = adapter.layers.get("ref.townships");
  fireEvent.click(screen.getByTestId("label-toggle-ref.townships"));
  await waitFor(() => { if (adapter.labels.get("ref.townships") == null) throw new Error("labels off"); });
  check("Show Township Names turns labels on without touching the township layer", adapter.labels.get("ref.townships") != null && adapter.layers.get("ref.townships") === before);
  fireEvent.click(screen.getByTestId("label-toggle-ref.townships"));
  await waitFor(() => { if (adapter.labels.get("ref.townships") != null) throw new Error("labels on"); });
  check("turning township names off keeps the township layer", adapter.labels.get("ref.townships") == null && adapter.layers.get("ref.townships") === before);

  // Optional layer: lazy load on toggle, TC_NUMBER labels on, top of the selection stack; toggling off removes both.
  fireEvent.click(screen.getByTestId("layer-toggle-opt.tc_areas"));
  await waitFor(() => { if (adapter.layers.get("opt.tc_areas") == null) throw new Error("tc not on map"); }, { timeout: 5000 });
  check("toggling Type Curve Areas lazy-loads it and places it with its labels", store.get("opt.tc_areas").state === "ready" && adapter.labels.get("opt.tc_areas") != null && /4 layers · 227 features/.test(screen.getByTestId("gis-status").textContent ?? ""), screen.getByTestId("gis-status").textContent ?? "");
  act(() => adapter.click([-81.0860, 40.5728]));
  await waitFor(() => { if (adapter.highlight?.layerId !== "opt.tc_areas") throw new Error("not primary"); });
  check("clicking a TC polygon opens its full details first, with the reference layers as tabs", /^TC \d+: /.test(screen.getByTestId("selection-title").textContent ?? "") && screen.getByTestId("selection-tab-ref.townships") !== null && /Shape_Area/.test(screen.getByTestId("feature-panel").textContent ?? ""), screen.getByTestId("selection-title").textContent ?? "");
  check("TC popup carries the eight requested fields", ["Name", "AOI", "TC number", "Spacing", "Base LL", "Oil EUR", "Gas EUR", "Confidence"].every((l) => new RegExp(`${l}</dt>`).test(adapter.popup ?? "")));
  fireEvent.click(screen.getByTestId("clear-selection"));
  fireEvent.click(screen.getByTestId("layer-toggle-opt.tc_areas"));
  await waitFor(() => { if (adapter.layers.get("opt.tc_areas") != null) throw new Error("tc still on"); });
  check("toggling Type Curve Areas off removes layer and labels but keeps the session cache", adapter.labels.get("opt.tc_areas") == null && store.get("opt.tc_areas").state === "ready");

  // ODNR Units: the same optional-layer contract, plus a status legend and unit-first identification.
  fireEvent.click(screen.getByTestId("layer-toggle-opt.odnr_units"));
  await waitFor(() => { if (adapter.layers.get("opt.odnr_units") == null) throw new Error("units not on map"); }, { timeout: 10000 });
  check("toggling ODNR Units lazy-loads all 789 units and places them on the map", store.get("opt.odnr_units").state === "ready" && /5 layers · 1,016 features/.test(screen.getByTestId("gis-status").textContent ?? ""), screen.getByTestId("gis-status").textContent ?? "");
  check("ODNR Units draws unlabeled", adapter.labels.get("opt.odnr_units") == null && document.querySelector('[data-testid="label-toggle-opt.odnr_units"]') === null);
  const legendLabels = [...screen.getByTestId("legend-opt.odnr_units").querySelectorAll(".gis-legend-row")].map((r) => r.textContent);
  check("ODNR Units legend shows the four expanded ODNR status names", legendLabels.join("|") === "Pending|Effective|Chief's Order Issued|No Longer Effective", legendLabels.join("|"));
  act(() => adapter.click([-81.1761460636001, 40.43147027485477]));
  await waitFor(() => { if (adapter.highlight?.layerId !== "opt.odnr_units") throw new Error("unit not primary"); });
  check("clicking inside a unit identifies the unit first, with the reference layers as tabs", screen.getByTestId("selection-title").textContent === "Bowerston North" && screen.getByTestId("selection-tab-ref.counties") !== null);
  check("unit popup carries operator, order, status, formation and acreage", ["Operator", "Order no.", "Status", "Formation", "Acres"].every((l) => new RegExp(`${l.replace(".", "\\.")}</dt>`).test(adapter.popup ?? "")) && /Operator<\/dt><dd>EOG Resources</.test(adapter.popup ?? "") && /Acres<\/dt><dd>866/.test(adapter.popup ?? ""), adapter.popup?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 150));
  check("Bowerston North is filed as EOG Ohio and displays as EOG Resources", (store.get("opt.odnr_units") as { state: "ready"; data: LayerData }).data.byId.get("BOWERSTON_NORTH")!.properties!.OPERATOR === "EOG Ohio");
  check("unit popup shows the expanded status, not the raw code", /Status<\/dt><dd>Effective</.test(adapter.popup ?? ""), adapter.popup?.match(/Status<\/dt><dd>[^<]*/)?.[0]);

  // A Gulfport unit: the popup and drawer show the canonical operator, the drawer's raw attribute list keeps the filed value.
  const gulfport = (store.get("opt.odnr_units") as { state: "ready"; data: LayerData }).data.collection.features.find((f) => f.properties!.OPERATOR === "Gulfport Energy Transferred to Gulfport Appalachia")!;
  act(() => adapter.click(labelAnchor(gulfport.geometry)!));
  await waitFor(() => { if (adapter.highlight?.layerId !== "opt.odnr_units") throw new Error("gulfport unit not primary"); });
  check("a Gulfport unit displays the canonical operator", /Operator<\/dt><dd>Gulfport Appalachia</.test(adapter.popup ?? ""), adapter.popup?.match(/Operator<\/dt><dd>[^<]*/)?.[0]);
  const panelText = screen.getByTestId("feature-panel").textContent ?? "";
  check("the detail drawer keeps the operator name as ODNR filed it", panelText.includes("Gulfport Energy Transferred to Gulfport Appalachia") && panelText.includes("Gulfport Appalachia"));
  const rawStatus = String(gulfport.properties!.STATUS);
  check("the detail drawer keeps the raw status code alongside the expanded name", panelText.includes(`STATUS${rawStatus}`) && panelText.includes(`Status${unitStatusLabel(rawStatus)}`), `raw ${rawStatus} / shown ${unitStatusLabel(rawStatus)}`);
  fireEvent.click(screen.getByTestId("clear-selection"));
  fireEvent.click(screen.getByTestId("layer-toggle-opt.odnr_units"));
  await waitFor(() => { if (adapter.layers.get("opt.odnr_units") != null) throw new Error("units still on"); });
  check("toggling ODNR Units off removes the layer but keeps the session cache", store.get("opt.odnr_units").state === "ready");

  // Unit search: typing pulls in the lazy layer, picking a result switches it on,
  // highlights the unit, opens its details and flies to it.
  check("the unit search box is in the rail", screen.getByTestId("unit-search-input") !== null);
  check("no results before a query", document.querySelector('[data-testid="unit-search-results"]') === null);
  fireEvent.change(screen.getByTestId("unit-search-input"), { target: { value: "bowerston nor" } });
  await waitFor(() => { if (document.querySelector('[data-testid="unit-search-results"]') === null) throw new Error("no results"); }, { timeout: 10000 });
  const rows = [...screen.getByTestId("unit-search-results").querySelectorAll(".gis-search-result")];
  check("searching finds the unit and shows operator, order and acreage", /Bowerston North/.test(rows[0].textContent ?? "") && /EOG Resources/.test(rows[0].textContent ?? "") && /2016-237/.test(rows[0].textContent ?? "") && /866 ac/.test(rows[0].textContent ?? ""), rows[0].textContent ?? "");
  const fitsBeforePick = adapter.fits.length;
  fireEvent.click(screen.getByTestId("unit-search-result-BOWERSTON_NORTH"));
  await waitFor(() => { if (adapter.highlight?.featureId !== "BOWERSTON_NORTH") throw new Error("not highlighted"); });
  check("picking a result highlights that unit", adapter.highlight?.layerId === "opt.odnr_units" && adapter.highlight?.featureId === "BOWERSTON_NORTH");
  check("picking a result switches the units layer back on", adapter.layers.get("opt.odnr_units") != null && (screen.getByTestId("layer-toggle-opt.odnr_units") as HTMLInputElement).checked);
  check("picking a result opens the unit's details", screen.getByTestId("selection-title").textContent === "Bowerston North" && /Bowerston North/.test(adapter.popup ?? ""));
  const flown = adapter.fits[adapter.fits.length - 1];
  check("picking a result flies to the unit's bounds", adapter.fits.length === fitsBeforePick + 1 && flown[0] < -81.17 && flown[2] > -81.17 && flown[1] < 40.43 && flown[3] > 40.43, flown?.map((v) => v.toFixed(3)).join(","));
  check("the query clears after picking", (screen.getByTestId("unit-search-input") as HTMLInputElement).value === "" && document.querySelector('[data-testid="unit-search-results"]') === null);
  fireEvent.change(screen.getByTestId("unit-search-input"), { target: { value: "zzzznotaunit" } });
  await waitFor(() => { if (document.querySelector('[data-testid="unit-search-note"]') === null) throw new Error("no note"); });
  check("a query matching nothing says so", screen.getByTestId("unit-search-note").textContent === "No matching unit");
  fireEvent.change(screen.getByTestId("unit-search-input"), { target: { value: "" } });
  fireEvent.click(screen.getByTestId("clear-selection"));
  fireEvent.click(screen.getByTestId("layer-toggle-opt.odnr_units"));
  await waitFor(() => { if (adapter.layers.get("opt.odnr_units") != null) throw new Error("units still on"); });

  // Click → popup with concise attributes for every layer under the point, detail panel with tabs.
  act(() => adapter.click([-81.0860, 40.5728]));
  await waitFor(() => screen.getByTestId("feature-panel"));
  check("popup lists township, county and phase window", adapter.popup !== null && /Center township/.test(adapter.popup) && /Carroll County/.test(adapter.popup) && /North Lean Condensate/.test(adapter.popup), adapter.popup?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160));
  check("county popup is concise: GEOID and land acres", /GEOID<\/dt><dd>39019/.test(adapter.popup ?? "") && /Land acres<\/dt><dd>[\d,]+/.test(adapter.popup ?? ""));
  check("township popup carries its county", /County<\/dt><dd>Carroll County/.test(adapter.popup ?? ""));
  check("phase popup shows region and phase", /Region<\/dt><dd>North/.test(adapter.popup ?? "") && /Phase<\/dt><dd>Lean Condensate/.test(adapter.popup ?? ""));
  check("detail panel opens on the township with county and phase tabs", screen.getByTestId("selection-title").textContent === "Center township" && screen.getByTestId("selection-tab-ref.counties") !== null && screen.getByTestId("selection-tab-ref.phase_windows") !== null);
  check("township is highlighted", adapter.highlight?.layerId === "ref.townships" && adapter.highlight?.featureId === "3901912896");
  fireEvent.click(screen.getByTestId("selection-tab-ref.counties"));
  await waitFor(() => { if (adapter.highlight?.layerId !== "ref.counties") throw new Error("not switched"); });
  check("choosing the county tab moves the highlight and shows the full attribute set", adapter.highlight?.featureId === "39019" && screen.getByTestId("selection-title").textContent === "Carroll County" && /ALAND/.test(screen.getByTestId("feature-panel").textContent ?? ""));
  const fitsBefore = adapter.fits.length;
  fireEvent.click(screen.getByTestId("zoom-to-feature"));
  check("zoom to feature fits the county bbox", adapter.fits.length === fitsBefore + 1 && adapter.fits[adapter.fits.length - 1][0] > -81.4 && adapter.fits[adapter.fits.length - 1][2] < -80.7);
  fireEvent.click(screen.getByTestId("layer-zoom-ref.phase_windows"));
  check("zoom to layer fits the phase-window bbox", adapter.fits.length === fitsBefore + 2 && adapter.fits[adapter.fits.length - 1][1] < 39.62 && adapter.fits[adapter.fits.length - 1][3] > 40.86);
  act(() => adapter.click([-84.5, 39.1]));
  await waitFor(() => { if (adapter.popup !== null) throw new Error("popup open"); });
  check("clicking empty map clears selection, popup and highlight", adapter.popup === null && adapter.highlight === null && document.querySelector('[data-testid="feature-panel"]') === null);

  // Hidden/visible round trip keeps the map alive and relayouts it.
  fireEvent.click(screen.getAllByTestId("module-deal")[0]);
  const n = adapter.calls.filter((c) => c === "invalidateSize").length;
  fireEvent.click(screen.getAllByTestId("module-gis")[0]);
  check("returning to GIS keeps the mounted map and calls invalidateSize", adapter.mounted && adapter.calls.filter((c) => c === "invalidateSize").length > n);

  console.log(failures ? `\n${failures} GIS UI check(s) FAILED` : "\nGIS UI: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
