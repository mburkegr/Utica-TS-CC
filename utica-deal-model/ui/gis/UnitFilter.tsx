import React from "react";
import { operatorOptions, type LayerStatus } from "../../gis/index";

export interface UnitFilterProps {
  status: LayerStatus;
  operator: string | null;
  /** Load and switch on the units layer; called when the filter is first used. */
  onNeedLayer: () => void;
  onChange: (operator: string | null) => void;
}

/**
 * Narrow the units layer to one operator. Options are the canonical operators
 * present in the data with their unit counts, so the list leads with whoever
 * holds the most acreage and the Gulfport and EOG spellings appear once each.
 *
 * Disabled until the layer is loaded, because the options come from the data
 * rather than a hardcoded roster. A filter restored from a previous session
 * stays selected while the layer loads, so the map does not flash the full set.
 */
export function UnitFilter({ status, operator, onNeedLayer, onChange }: UnitFilterProps) {
  const data = status.state === "ready" ? status.data : null;
  const options = React.useMemo(() => (data ? operatorOptions(data) : []), [data]);
  const ready = data !== null;
  const total = options.reduce((n, o) => n + o.count, 0);
  const shown = operator === null ? total : options.find((o) => o.operator === operator)?.count ?? 0;

  return (
    <div className="gis-filter" data-testid="unit-filter">
      <select
        className="gis-filter-select" aria-label="Filter units by operator"
        value={operator ?? ""} disabled={!ready}
        onFocus={() => { if (status.state === "idle") onNeedLayer(); }}
        onChange={(e) => { const v = e.target.value; onChange(v === "" ? null : v); }}
        data-testid="unit-filter-select"
      >
        <option value="">{ready ? `All operators (${total})` : "All operators"}</option>
        {options.map((o) => <option key={o.operator} value={o.operator}>{o.operator} ({o.count})</option>)}
        {/* A restored filter whose operator is gone after a data refresh still shows what is selected. */}
        {operator !== null && !options.some((o) => o.operator === operator) && <option value={operator}>{operator} (0)</option>}
      </select>
      {operator !== null && (
        <button type="button" className="gis-filter-clear" onClick={() => onChange(null)} data-testid="unit-filter-clear">
          {shown.toLocaleString()} of {total.toLocaleString()} units · show all
        </button>
      )}
    </div>
  );
}
