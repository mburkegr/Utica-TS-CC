import React from "react";
import type { MapAdapter, MapAdapterEvents, MapView } from "../../gis/index";

/**
 * Owns the map container. The adapter is mounted once and destroyed on unmount;
 * everything else (layers, labels, highlight) is reconciled by GisModule.
 */
export function UticaMap({ adapter, initialView, events, hidden }: { adapter: MapAdapter; initialView: MapView; events: MapAdapterEvents; hidden: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const eventsRef = React.useRef(events); eventsRef.current = events;
  React.useEffect(() => {
    if (!ref.current) return;
    let alive = true;
    const forward: MapAdapterEvents = { onClick: (p) => eventsRef.current.onClick(p), onViewChange: (v) => eventsRef.current.onViewChange(v), onReady: () => { if (alive) eventsRef.current.onReady(); }, onError: (m) => { if (alive) eventsRef.current.onError(m); } };
    adapter.mount(ref.current, { view: initialView, events: forward }).catch(() => undefined);
    return () => { alive = false; adapter.destroy(); };
  }, [adapter]);
  React.useEffect(() => { if (!hidden) adapter.invalidateSize(); }, [hidden, adapter]);
  return <div ref={ref} className="gis-map" data-testid="gis-map" role="application" aria-label="Utica map" />;
}
