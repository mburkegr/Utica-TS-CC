import React from "react";
import type { Feature, LayerDefinition } from "../../gis/index";
import { formatValue } from "../../gis/index";
import type { GisSelection, GisAction } from "./state/gisReducer";

export interface ResolvedHit { def: LayerDefinition; featureId: string; feature: Feature }

/** Detail drawer: every layer under the click as a tab; the active tab shows the full attribute set. */
export function FeaturePanel({ selection, hits, dispatch, onZoomFeature }: { selection: GisSelection; hits: ResolvedHit[]; dispatch: React.Dispatch<GisAction>; onZoomFeature: (h: ResolvedHit) => void }) {
  const active = hits[Math.min(selection.primary, hits.length - 1)];
  if (!active) return null;
  const props = active.feature.properties ?? {};
  const title = active.def.popup.title(props);
  return (
    <aside className="gis-detail" data-testid="feature-panel" aria-label="Selected features">
      <div className="gis-detail-head">
        <h3>Selection</h3>
        <button className="gis-icon-btn" onClick={() => dispatch({ type: "CLEAR_SELECTION" })} aria-label="Close selection" data-testid="selection-close" style={{ color: "inherit" }}>✕</button>
      </div>
      {hits.length > 1 && (
        <div className="gis-detail-tabs" role="tablist">
          {hits.map((h, i) => <button key={h.def.id} role="tab" aria-selected={i === selection.primary} className={`gis-detail-tab${i === selection.primary ? " active" : ""}`} onClick={() => dispatch({ type: "SET_PRIMARY", index: i })} data-testid={`selection-tab-${h.def.id}`}>{h.def.name}</button>)}
        </div>
      )}
      <div className="gis-detail-body">
        <div className="kicker">{active.def.name}</div>
        <h4 data-testid="selection-title">{title}</h4>
        <table className="gis-attrs"><tbody>
          {active.def.popup.fields.map((f) => <tr key={f.label}><th>{f.label}</th><td>{formatValue(f.derive ? f.derive(props) : props[f.key], f.format)}</td></tr>)}
        </tbody></table>
        <details style={{ marginTop: 10 }}>
          <summary className="muted">All attributes ({Object.keys(props).length})</summary>
          <table className="gis-attrs"><tbody>
            {Object.entries(props).map(([k, v]) => <tr key={k}><th>{k}</th><td>{formatValue(v)}</td></tr>)}
          </tbody></table>
        </details>
        <div className="gis-detail-actions">
          <button className="btn secondary" onClick={() => onZoomFeature(active)} data-testid="zoom-to-feature">Zoom to feature</button>
        </div>
      </div>
    </aside>
  );
}
