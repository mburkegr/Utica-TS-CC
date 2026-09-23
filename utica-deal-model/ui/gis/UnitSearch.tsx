import React from "react";
import { buildUnitIndex, searchUnits, formatValue, MIN_QUERY, type LayerStatus, type SearchHit } from "../../gis/index";

export interface UnitSearchProps {
  status: LayerStatus;
  /** Active operator filter; search is narrowed to it so a result is never a hidden unit. */
  operator: string | null;
  /** Load and switch on the units layer; called the first time the box is used. */
  onNeedLayer: () => void;
  onPick: (hit: SearchHit) => void;
}

/**
 * Find a unit by name, operator or order number, then fly to it.
 *
 * The units layer is lazy, so the first keystroke asks for it; until it is
 * ready the box says so rather than reporting "no matches" for data it has not
 * loaded. The index is rebuilt only when the layer data changes.
 */
export function UnitSearch({ status, operator, onNeedLayer, onPick }: UnitSearchProps) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const data = status.state === "ready" ? status.data : null;
  const index = React.useMemo(() => (data ? buildUnitIndex(data) : []), [data]);
  const hits = React.useMemo(() => searchUnits(index, query, undefined, operator), [index, query, operator]);

  React.useEffect(() => { setActive(0); }, [query]);
  // Asking for the layer is idempotent, so it is safe to call on every change.
  const need = status.state === "idle";
  const onChange = (v: string) => { setQuery(v); if (need && v.length >= MIN_QUERY) onNeedLayer(); };

  const pick = (h: SearchHit | undefined) => { if (!h) return; onPick(h); setQuery(""); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
    else if (e.key === "Escape") { setQuery(""); }
  };

  const searching = query.trim().length >= MIN_QUERY;
  const note =
    status.state === "loading" ? "Loading units…"
    : status.state === "error" ? "Units unavailable"
    : searching && status.state === "ready" && hits.length === 0 ? (operator ? `No matching unit for ${operator}` : "No matching unit")
    : "";

  return (
    <div className="gis-search" data-testid="unit-search">
      <input
        type="search" className="gis-search-input" value={query} placeholder={operator ? `Find a ${operator} unit` : "Find a unit, operator or order no."}
        aria-label="Find a unit" autoComplete="off" spellCheck={false}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} data-testid="unit-search-input"
      />
      {note && <div className="gis-search-note" data-testid="unit-search-note">{note}</div>}
      {searching && hits.length > 0 && (
        <ul className="gis-search-results" role="listbox" data-testid="unit-search-results">
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                type="button" role="option" aria-selected={i === active}
                className={`gis-search-result${i === active ? " active" : ""}`}
                onMouseEnter={() => setActive(i)} onClick={() => pick(h)} data-testid={`unit-search-result-${h.id}`}
              >
                <span className="gis-search-name">{h.name}</span>
                <span className="gis-search-meta">
                  {[h.operator, h.order || "no order", h.acres === null ? null : `${formatValue(h.acres, "integer")} ac`].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
