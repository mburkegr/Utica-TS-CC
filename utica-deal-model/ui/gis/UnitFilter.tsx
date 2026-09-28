import React from "react";
import { operatorOptions, type LayerStatus } from "../../gis/index";

export interface UnitFilterProps {
  status: LayerStatus;
  operators: readonly string[];
  /** Load and switch on the units layer; called when the filter is first opened. */
  onNeedLayer: () => void;
  onToggle: (operator: string) => void;
  onClear: () => void;
}

/**
 * Narrow the units layer to any number of operators, so two can be compared
 * side by side. Options are the canonical operators present in the data with
 * their unit counts, ordered by count, so the list leads with whoever holds
 * the most acreage and the Gulfport and EOG spellings appear once each.
 *
 * Checkboxes rather than a multi-select: the rail already uses them for layer
 * visibility, and a <select multiple> hides what is chosen behind a scroll and
 * makes deselecting one of several a modifier-click. Collapsed by default so
 * fourteen operators do not push the layer panel off screen.
 */
export function UnitFilter({ status, operators, onNeedLayer, onToggle, onClear }: UnitFilterProps) {
  const [open, setOpen] = React.useState(false);
  const data = status.state === "ready" ? status.data : null;
  const options = React.useMemo(() => (data ? operatorOptions(data) : []), [data]);
  const total = options.reduce((n, o) => n + o.count, 0);
  const selected = new Set(operators);
  const shown = operators.length === 0 ? total : options.filter((o) => selected.has(o.operator)).reduce((n, o) => n + o.count, 0);

  const summary =
    operators.length === 0 ? "All operators"
    : operators.length === 1 ? operators[0]
    : `${operators.length} operators`;

  return (
    <div className="gis-filter" data-testid="unit-filter">
      <button
        type="button" className="gis-filter-toggle" aria-expanded={open}
        onClick={() => { setOpen((v) => !v); if (status.state === "idle") onNeedLayer(); }}
        data-testid="unit-filter-toggle"
      >
        <span className="gis-filter-summary">{summary}</span>
        <span className="gis-filter-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {operators.length > 0 && (
        <button type="button" className="gis-filter-clear" onClick={onClear} data-testid="unit-filter-clear">
          {shown.toLocaleString()} of {total.toLocaleString()} units · show all
        </button>
      )}
      {open && (
        <div className="gis-filter-list" role="group" aria-label="Filter units by operator" data-testid="unit-filter-list">
          {options.length === 0
            ? <div className="gis-search-note">{status.state === "loading" ? "Loading units…" : status.state === "error" ? "Units unavailable" : "No units loaded"}</div>
            : options.map((o) => (
                <label key={o.operator} className="gis-filter-option">
                  <input
                    type="checkbox" checked={selected.has(o.operator)} onChange={() => onToggle(o.operator)}
                    data-testid={`unit-filter-option-${o.operator}`}
                  />
                  <span className="gis-filter-operator">{o.operator}</span>
                  <span className="gis-filter-count">{o.count}</span>
                </label>
              ))}
          {/* A selection whose operator is gone after a data refresh stays visible and unpickable-away otherwise. */}
          {operators.filter((op) => !options.some((o) => o.operator === op)).map((op) => (
            <label key={op} className="gis-filter-option">
              <input type="checkbox" checked onChange={() => onToggle(op)} data-testid={`unit-filter-option-${op}`} />
              <span className="gis-filter-operator">{op}</span>
              <span className="gis-filter-count">0</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
