import React from "react";
import { MODULES, type ModuleKey } from "./moduleRegistry";

/** Segmented `Deal Model | GIS` switch shown in every module's rail, directly under the brand. */
export function ModuleNav({ active, onChange }: { active: ModuleKey; onChange: (k: ModuleKey) => void }) {
  return (
    <div className="module-nav" role="tablist" aria-label="Modules">
      {MODULES.map((m) => (
        <button key={m.key} role="tab" aria-selected={m.key === active} className={`module-tab${m.key === active ? " active" : ""}`}
          data-testid={`module-${m.key}`} onClick={() => onChange(m.key)}>{m.label}</button>
      ))}
    </div>
  );
}
