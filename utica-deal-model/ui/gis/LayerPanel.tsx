import React from "react";
import type { LayerDefinition, LayerStatus, LegendEntry } from "../../gis/index";
import { legendFor } from "../../gis/index";
import type { GisState, GisAction } from "./state/gisReducer";

function Swatch({ e }: { e: LegendEntry }) {
  const line = `var(${e.style.stroke})`;
  if (e.kind === "line") return <span className={`gis-swatch line${e.style.dashArray ? " dashed" : ""}`} style={{ borderTopColor: line, borderTopWidth: Math.max(1, Math.round(e.style.weight)) }} />;
  return <span className="gis-swatch" style={{ background: `var(${e.style.fill})`, opacity: Math.min(1, (e.style.fillOpacity ?? 0.3) + 0.45), border: `1px solid ${line}` }} />;
}

function LayerRow({ def, status, state, dispatch, onZoom, onRetry }: { def: LayerDefinition; status: LayerStatus; state: GisState; dispatch: React.Dispatch<GisAction>; onZoom: (id: string) => void; onRetry: (id: string) => void }) {
  const visible = state.visible[def.id] ?? false;
  const legend = legendFor(def);
  const meta = status.state === "ready" ? `${status.data.featureCount.toLocaleString()} features`
    : status.state === "loading" ? <span className="spinner" aria-label="loading" />
    : status.state === "error" ? (status.code === "not_published" ? "not published" : "failed") : "";
  return (
    <div className="gis-layer" data-layer={def.id} data-status={status.state}>
      <div className="gis-layer-row">
        <label title={def.description}>
          <input type="checkbox" checked={visible} onChange={(e) => dispatch({ type: "SET_VISIBLE", id: def.id, visible: e.target.checked })} data-testid={`layer-toggle-${def.id}`} />
          <span>{def.name}</span>
        </label>
        <span className={`gis-layer-meta${status.state === "error" ? " err" : ""}`} title={status.state === "error" ? status.message : undefined}>{meta}</span>
        {status.state === "error"
          ? <button className="gis-icon-btn" title={`Retry: ${status.message}`} onClick={() => onRetry(def.id)} aria-label={`Retry ${def.name}`}>↻</button>
          : <button className="gis-icon-btn" title={`Zoom to ${def.name}`} onClick={() => onZoom(def.id)} disabled={status.state !== "ready"} data-testid={`layer-zoom-${def.id}`} aria-label={`Zoom to ${def.name}`}>⤢</button>}
      </div>
      {def.label && !def.label.defaultOn && def.label.toggleLabel && (
        <label className="gis-sub">
          <input type="checkbox" checked={state.labels[def.id] ?? false} onChange={(e) => dispatch({ type: "SET_LABELS", id: def.id, on: e.target.checked })} data-testid={`label-toggle-${def.id}`} />
          Show {def.label.toggleLabel}{def.label.minZoom !== undefined ? <span className="gis-layer-meta"> (zoom in)</span> : null}
        </label>
      )}
      {visible && legend.length > 0 && (
        <div className="gis-legend" data-testid={`legend-${def.id}`}>
          {legend.map((e) => <div key={e.key} className="gis-legend-row"><Swatch e={e} /><span>{e.label}</span></div>)}
        </div>
      )}
    </div>
  );
}

export function LayerPanel({ defs, statusOf, state, dispatch, onZoom, onRetry }: { defs: readonly LayerDefinition[]; statusOf: (id: string) => LayerStatus; state: GisState; dispatch: React.Dispatch<GisAction>; onZoom: (id: string) => void; onRetry: (id: string) => void }) {
  const reference = defs.filter((d) => d.tier === "reference"), optional = defs.filter((d) => d.tier === "optional");
  // Panel lists counties first (the framework), then townships, then the phase overlay; draw order is the reverse.
  const byPanelOrder = (a: LayerDefinition, b: LayerDefinition) => b.zIndex - a.zIndex;
  return (
    <div className="gis-rail" data-testid="layer-panel">
      <h4>Reference layers</h4>
      {[...reference].sort(byPanelOrder).map((d) => <LayerRow key={d.id} def={d} status={statusOf(d.id)} state={state} dispatch={dispatch} onZoom={onZoom} onRetry={onRetry} />)}
      <h4>Layer library</h4>
      {optional.length === 0
        ? <div className="gis-empty" data-testid="optional-empty">No optional layers registered yet. Producing wells, Dale wells, units and opportunities will appear here, off by default and loaded on demand.</div>
        : [...optional].sort(byPanelOrder).map((d) => <LayerRow key={d.id} def={d} status={statusOf(d.id)} state={state} dispatch={dispatch} onZoom={onZoom} onRetry={onRetry} />)}
    </div>
  );
}
