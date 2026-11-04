import React from "react";
import { Logo } from "../components/Logo";
import { Banner } from "../components/fields";
import {
  LAYER_REGISTRY, LayerStore, createLeafletAdapter, hitTest, popupHtml, popupSection, bboxOfGeometry, labelAnchor, unionBbox, padBbox, layersInDrawOrder, filterUnitsByOperators,
  toggleUnitId, unitAnalysisRows, type UnitAnalysisRow, type Feature,
  type LayerDefinition, type LayerData, type LayerStatus, type MapAdapterFactory, type MapView, type ManifestLike, type FetchLike, type Bbox, type Position,
} from "../../gis/index";
import manifestJson from "../../gis-data/manifest.json";
import { gisReducer, initialGisState, type GisState } from "./state/gisReducer";
import { loadGisState, saveGisState, GIS_SAVE_DEBOUNCE_MS } from "./state/gisPersistence";
import { LayerPanel } from "./LayerPanel";
import { FeaturePanel, type ResolvedHit } from "./FeaturePanel";
import { UnitSearch } from "./UnitSearch";
import { UnitFilter } from "./UnitFilter";
import { UticaMap } from "./UticaMap";

/** The searchable layer. Search is scoped to units; see gis/search.ts. */
const UNITS_LAYER = "opt.odnr_units";

export interface GisModuleProps {
  moduleNav?: React.ReactNode;
  hidden?: boolean;
  /** Test seams: a fake map adapter and a store with an injected fetch. */
  adapterFactory?: MapAdapterFactory;
  store?: LayerStore;
  defs?: readonly LayerDefinition[];
  restorePrefs?: boolean;
  /**
   * Units picked for analysis, by unit id. The shell owns the list so the Deal
   * Model's Unit Analysis tab can show and edit it; without these props the
   * module keeps its own list (standalone use and tests).
   */
  selectedUnits?: readonly string[];
  onSelectedUnitsChange?: (ids: string[]) => void;
  /** The picked units joined across the unit layers, re-sent whenever the picks or the loaded layers change. */
  onUnitRows?: (rows: UnitAnalysisRow[]) => void;
  /** Shown as "Open in Deal Model" when provided. */
  onOpenUnitAnalysis?: () => void;
}

/** Center of the Utica-area reference geography; replaced by a data-driven fit once reference layers load. */
const FALLBACK_VIEW: MapView = { center: [-81.12, 40.27], zoom: 8.5 };
const defaultFetch: FetchLike = (url) => fetch(url);
const unionAll = (bs: Bbox[]): Bbox | null => bs.reduce<Bbox | null>((acc, x) => (acc ? unionBbox(acc, x) : x), null);

/**
 * GIS module. Framework-free logic (registry, store, hit test, popup HTML)
 * lives in gis/; this component wires it to React state and the MapAdapter.
 */
export function GisModule({ moduleNav, hidden = false, adapterFactory = createLeafletAdapter, store: storeProp, defs = LAYER_REGISTRY, restorePrefs = true, selectedUnits, onSelectedUnitsChange, onUnitRows, onOpenUnitAnalysis }: GisModuleProps) {
  const store = React.useMemo(() => storeProp ?? new LayerStore(defs, manifestJson as ManifestLike, defaultFetch), [storeProp, defs]);
  const adapter = React.useMemo(() => adapterFactory(), [adapterFactory]);
  const [state, dispatch] = React.useReducer(gisReducer, undefined, () => (restorePrefs ? loadGisState(defs) : initialGisState(defs)));
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [mapStatus, setMapStatus] = React.useState<{ state: "loading" } | { state: "ready" } | { state: "error"; message: string }>({ state: "loading" });
  const fitted = React.useRef(state.view !== null);
  const stateRef = React.useRef<GisState>(state); stateRef.current = state;

  // Store → re-render; reference layers load when the module first mounts (i.e. when GIS is first opened).
  React.useEffect(() => { const off = store.subscribe(() => bump()); void store.loadEager(); return off; }, [store]);
  // Lazy layers: the first time a layer is switched on, fetch it (cached for the session afterwards).
  React.useEffect(() => {
    for (const d of defs) if (state.visible[d.id] && store.get(d.id).state === "idle") void store.load(d.id).catch(() => undefined);
  }, [state.visible, store, defs]);
  // Persist layer/label visibility and the view.
  React.useEffect(() => { if (!restorePrefs) return; const t = setTimeout(() => saveGisState(state), GIS_SAVE_DEBOUNCE_MS); return () => clearTimeout(t); }, [state.visible, state.labels, state.view, restorePrefs]);

  const statusOf = (id: string): LayerStatus => store.get(id);

  /**
   * The data a layer renders from: the units layer narrowed to the selected
   * operator, every other layer as loaded. Everything downstream — the map,
   * the hit test, the selection, the feature count, zoom to layer — reads
   * through here, so none of them can disagree about what is filtered out.
   * Memoized on the operator and the loaded units, so panning does not
   * re-filter 789 polygons.
   */
  const unitsRaw = store.data(UNITS_LAYER);
  const unitsDef = React.useMemo(() => defs.find((d) => d.id === UNITS_LAYER) ?? null, [defs]);
  const unitsView = React.useMemo(
    () => (unitsDef && unitsRaw ? filterUnitsByOperators(unitsDef, unitsRaw, state.unitOperators) : unitsRaw),
    [unitsDef, unitsRaw, state.unitOperators],
  );
  // Read through a ref, not the closure: `events` is memoized on [adapter, store],
  // so a click handler captured on the first render would otherwise keep filtering
  // against the units view from before the layer loaded.
  const unitsViewRef = React.useRef<LayerData | null>(unitsView);
  unitsViewRef.current = unitsView;
  const dataFor = (id: string): LayerData | null => (id === UNITS_LAYER ? unitsViewRef.current : store.data(id));

  /**
   * Analysis selection. Every layer in the "units" category keys its features
   * by unit id, so a pick on any of them is the same unit, and the rows join
   * their attributes (operator from ODNR Units, D&C fields from Unit D&C).
   * Rows read the unfiltered layers: the operator filter changes what is drawn,
   * not what was picked.
   */
  const [localPicks, setLocalPicks] = React.useState<string[]>([]);
  const picks = selectedUnits ?? localPicks;
  const setPicks = onSelectedUnitsChange ?? setLocalPicks;
  const picksRef = React.useRef({ picks, setPicks }); picksRef.current = { picks, setPicks };
  const unitDefs = React.useMemo(() => defs.filter((d) => d.category === "units"), [defs]);
  const unitData = unitDefs.map((d) => store.data(d.id));
  const unitRows = React.useMemo(() => unitAnalysisRows(picks, unitData), [picks, ...unitData]);
  const markedFeatures = React.useMemo(() => picks.flatMap((id): Feature[] => { for (const d of unitData) { const f = d?.byId.get(id); if (f) return [f]; } return []; }), [picks, ...unitData]);
  // Sent only when the rows' content changes. A layer finishing its load rebuilds
  // the rows, and with nothing picked that is an empty list each time; passing it
  // up anyway re-rendered the shell for nothing, and that render's stale map
  // reconcile could close a popup a click had just opened.
  const sentRows = React.useRef("[]");
  React.useEffect(() => {
    const key = JSON.stringify(unitRows);
    if (key === sentRows.current) return;
    sentRows.current = key; onUnitRows?.(unitRows);
  }, [unitRows]);

  const readyLayers = (): { def: LayerDefinition; data: LayerData }[] => layersInDrawOrder(defs).flatMap((def) => { const data = dataFor(def.id); return data ? [{ def, data }] : []; });
  const visibleReady = () => readyLayers().filter(({ def }) => stateRef.current.visible[def.id]);

  // Reconcile the map with state after every render: layers, labels, highlight. Adapter calls are idempotent.
  const ready = mapStatus.state === "ready";
  React.useEffect(() => {
    if (!ready) return;
    for (const def of layersInDrawOrder(defs)) {
      const data = dataFor(def.id); const on = Boolean(state.visible[def.id]) && data !== null;
      adapter.setLayer(def, on ? data : null);
      if (def.label) adapter.setLabels(def, on && Boolean(state.labels[def.id]) ? data : null);
    }
    const sel = state.selection; const primary = sel?.hits[sel.primary];
    const pdef = primary ? defs.find((d) => d.id === primary.layerId) ?? null : null;
    adapter.setHighlight(pdef, pdef ? dataFor(pdef.id) : null, primary ?? null);
    adapter.setMarked(markedFeatures);
    if (!sel) adapter.closePopup();
  });

  // First fit: union of the loaded reference layers, once every eager layer has settled, unless a view was restored.
  const loadedCount = readyLayers().length;
  React.useEffect(() => {
    if (!ready || fitted.current || loadedCount === 0) return;
    const settled = defs.filter((d) => d.loading === "eager").every((d) => { const s = store.get(d.id); return s.state === "ready" || s.state === "error"; });
    if (!settled) return;
    const b = unionAll(readyLayers().map((l) => l.data.bbox));
    if (b) { adapter.fitBbox(padBbox(b, 0.02), 12); fitted.current = true; }
  }, [ready, loadedCount]);

  const events = React.useMemo(() => ({
    onReady: () => setMapStatus({ state: "ready" }),
    onError: (message: string) => setMapStatus({ state: "error", message }),
    onViewChange: (view: MapView) => dispatch({ type: "SET_VIEW", view }),
    onClick: (p: Position) => {
      const hits = hitTest(p, visibleReady());
      if (stateRef.current.selectMode) {
        // Select mode: the top unit under the cursor toggles in or out; anything else is ignored.
        const unit = hits.find((h) => h.def.category === "units");
        if (unit) picksRef.current.setPicks(toggleUnitId(picksRef.current.picks, unit.featureId));
        adapter.closePopup();
        return;
      }
      dispatch({ type: "SELECT", at: p, hits: hits.map((h) => ({ layerId: h.def.id, featureId: h.featureId })) });
      if (hits.length) adapter.openPopup(p, popupHtml(hits.map((h) => popupSection(h.def, h.feature.properties ?? {}))));
      else adapter.closePopup();
    },
  }), [adapter, store]);

  /** Switch the units layer on and fetch it; idempotent, so callers need not check. */
  const needUnits = () => { dispatch({ type: "SET_VISIBLE", id: UNITS_LAYER, visible: true }); void store.load(UNITS_LAYER).catch(() => undefined); };

  /**
   * Search result picked: switch the units layer on, select the feature exactly
   * as a map click would (highlight + popup + detail drawer), and fly to it.
   * Selecting before the layer has rendered is fine — the reconcile effect
   * above applies the highlight once the data is on the map.
   */
  const pickSearchHit = (hit: { id: string; feature: { geometry: any; properties: Record<string, unknown> | null } }) => {
    const def = defs.find((d) => d.id === UNITS_LAYER); if (!def) return;
    if (!stateRef.current.visible[UNITS_LAYER]) dispatch({ type: "SET_VISIBLE", id: UNITS_LAYER, visible: true });
    const at = labelAnchor(hit.feature.geometry);
    const b = bboxOfGeometry(hit.feature.geometry);
    if (stateRef.current.selectMode) {
      // Select mode: searching is how you find one unit among 789, so a pick adds it (never removes) and flies there.
      const { picks: cur, setPicks: set } = picksRef.current;
      if (!cur.includes(hit.id)) set([...cur, hit.id]);
      if (b) adapter.fitBbox(padBbox(b, 0.6), 15);
      return;
    }
    if (at) {
      dispatch({ type: "SELECT", at, hits: [{ layerId: UNITS_LAYER, featureId: hit.id }] });
      adapter.openPopup(at, popupHtml([popupSection(def, hit.feature.properties ?? {})]));
    }
    if (b) adapter.fitBbox(padBbox(b, 0.6), 15);
  };

  /** Select mode needs the units on the map to click, and every unit layer loaded so the rows carry D&C even when its layer is hidden. */
  const setSelectMode = (on: boolean) => {
    dispatch({ type: "SET_SELECT_MODE", on });
    if (!on) return;
    needUnits();
    for (const d of unitDefs) void store.load(d.id).catch(() => undefined);
  };
  // Picks made in an earlier GIS session (the shell keeps them) still need their layers to draw and join.
  React.useEffect(() => { if (picks.length) for (const d of unitDefs) void store.load(d.id).catch(() => undefined); }, [picks.length > 0]);

  const zoomToLayer = (id: string) => { const d = dataFor(id); if (d) adapter.fitBbox(padBbox(d.bbox, 0.02), 12); };
  const zoomToExtent = () => { const b = unionAll(readyLayers().filter((l) => l.def.tier === "reference").map((l) => l.data.bbox)); if (b) adapter.fitBbox(padBbox(b, 0.02), 12); };
  const zoomToFeature = (h: ResolvedHit) => { const b = bboxOfGeometry(h.feature.geometry); if (b) adapter.fitBbox(padBbox(b, 0.15), 24); };

  const hits: ResolvedHit[] = (state.selection?.hits ?? []).flatMap((h) => { const def = defs.find((d) => d.id === h.layerId); const f = def ? dataFor(def.id)?.byId.get(h.featureId) : undefined; return def && f ? [{ def, featureId: h.featureId, feature: f }] : []; });
  const totalFeatures = readyLayers().reduce((n, l) => n + l.data.featureCount, 0);
  const loading = defs.some((d) => store.get(d.id).state === "loading");
  const errors = defs.filter((d) => store.get(d.id).state === "error");
  const errorText = (id: string) => { const s = store.get(id); return s.state === "error" ? s.message : ""; };

  return (
    <div className={`app${hidden ? " hidden" : ""}`} data-module="gis" aria-hidden={hidden || undefined}>
      <aside className="rail">
        <div className="brand"><Logo size={134} /><div className="brand-text">Utica<small>Map and spatial reference</small></div></div>
        {moduleNav}
        <UnitSearch
          status={statusOf(UNITS_LAYER)}
          operators={state.unitOperators}
          onNeedLayer={needUnits}
          onPick={pickSearchHit}
        />
        <UnitFilter
          status={statusOf(UNITS_LAYER)}
          operators={state.unitOperators}
          onNeedLayer={needUnits}
          onToggle={(operator) => { dispatch({ type: "TOGGLE_UNIT_OPERATOR", operator }); dispatch({ type: "SET_VISIBLE", id: UNITS_LAYER, visible: true }); }}
          onClear={() => dispatch({ type: "SET_UNIT_OPERATORS", operators: [] })}
        />
        <LayerPanel defs={defs} statusOf={statusOf} state={state} dispatch={dispatch} onZoom={zoomToLayer} onRetry={(id) => void store.retry(id).catch(() => undefined)} />
        <div className="rail-foot">EPSG:4326 GeoJSON, vector only. Click the map to identify the township, county and phase window at that point.</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>GIS</h1>
          <div className="gis-toolbar">
            <span className="muted" data-testid="gis-status">{loading ? <><span className="spinner" /> Loading reference layers</> : `${readyLayers().length} layers · ${totalFeatures.toLocaleString()} features`}</span>
            <button className="btn secondary" onClick={zoomToExtent} disabled={!ready || loadedCount === 0} data-testid="zoom-extent">Zoom to Utica extent</button>
            {state.selection && <button className="btn secondary" onClick={() => dispatch({ type: "CLEAR_SELECTION" })} data-testid="clear-selection">Clear selection</button>}
            <label className={`gis-switch${state.selectMode ? " on" : ""}`} title="While on, clicking a unit adds it to or removes it from the analysis list">
              <input type="checkbox" role="switch" checked={state.selectMode} onChange={(e) => setSelectMode(e.target.checked)} data-testid="select-units" />
              <span className="gis-switch-track" aria-hidden="true"><span className="gis-switch-thumb" /></span>
              Select units
            </label>
            {(state.selectMode || picks.length > 0) && <span className="gis-picks" data-testid="picks-count">{picks.length === 0 ? "Click units to add them" : `${picks.length} unit${picks.length === 1 ? "" : "s"} selected`}</span>}
            {picks.length > 0 && onOpenUnitAnalysis && <button className="btn primary" onClick={onOpenUnitAnalysis} data-testid="open-unit-analysis">Open in Deal Model</button>}
            {picks.length > 0 && <button className="btn secondary" onClick={() => setPicks([])} data-testid="clear-picks">Clear units</button>}
          </div>
        </header>
        <div className="gis-stage">
          <UticaMap adapter={adapter} initialView={state.view ?? FALLBACK_VIEW} events={events} hidden={hidden} />
          {(mapStatus.state !== "ready" || errors.length > 0) && (
            <div className="gis-overlay">
              {mapStatus.state === "loading" && <Banner kind="info"><span className="spinner" /> Loading map library…</Banner>}
              {mapStatus.state === "error" && <Banner kind="error">The map library could not be loaded ({mapStatus.message}). Check network access to cdnjs.cloudflare.com and reload.</Banner>}
              {mapStatus.state === "ready" && errors.length > 0 && <Banner kind="warn">{errors.map((d) => `${d.name}: ${errorText(d.id)}`).join(" · ")}</Banner>}
            </div>
          )}
          {state.selection && state.detailOpen && hits.length > 0 && <FeaturePanel selection={state.selection} hits={hits} dispatch={dispatch} onZoomFeature={zoomToFeature} />}
        </div>
      </div>
    </div>
  );
}
