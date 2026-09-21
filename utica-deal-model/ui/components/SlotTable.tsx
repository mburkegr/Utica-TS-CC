import React from "react";
import type { SlotInput } from "../../engine/index";
import { NumberField, MonthField } from "./fields";

export type SlotColumn =
  | { key: keyof SlotInput; label: string; kind: "number"; step?: number; min?: number; max?: number; decimals?: number; prefix?: string; suffix?: string; help?: string; readOnly?: boolean }
  | { key: keyof SlotInput; label: string; kind: "text"; help?: string; readOnly?: boolean }
  | { key: keyof SlotInput; label: string; kind: "month"; help?: string }
  | { key: keyof SlotInput; label: string; kind: "bool"; help?: string }
  | { key: keyof SlotInput; label: string; kind: "select"; options: { value: string; label: string }[]; help?: string; readOnly?: boolean };

export interface SlotTableProps {
  slots: SlotInput[];
  columns: SlotColumn[];
  include: Record<number, boolean>;
  onChange: (slotId: number, patch: Partial<SlotInput>) => void;
  onInclude?: (slotId: number, include: boolean) => void;
  extra?: (s: SlotInput) => React.ReactNode; // trailing read-only cells (e.g. standalone returns)
  extraHeaders?: string[];
  actions?: (s: SlotInput) => React.ReactNode;
}

/** One table over the canonical slot objects; Slot and Unit are sticky identifying columns on every tab. */
export function SlotTable({ slots, columns, include, onChange, onInclude, extra, extraHeaders = [], actions }: SlotTableProps) {
  return (
    <div className="table-wrap">
      <table className="slot-table">
        <thead>
          <tr>
            <th className="sticky c1">Slot</th>
            <th className="sticky c2">Unit</th>
            {onInclude && <th title="Include this slot in the model run">Incl.</th>}
            {columns.map((c) => <th key={String(c.key)} title={c.help}>{c.label}</th>)}
            {extraHeaders.map((h) => <th key={h} className="derived">{h}</th>)}
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => {
            const included = include[s.slotId] !== false;
            return (
              <tr key={s.slotId} className={included ? undefined : "excluded"}>
                <td className="sticky c1">{s.slotId}</td>
                <td className="sticky c2">{s.daleUnitId}</td>
                {onInclude && <td><input type="checkbox" checked={included} onChange={(e) => onInclude(s.slotId, e.target.checked)} /></td>}
                {columns.map((c) => <td key={String(c.key)}>{renderCell(s, c, onChange)}</td>)}
                {extra && extra(s)}
                {actions && <td className="actions">{actions(s)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(s: SlotInput, c: SlotColumn, onChange: SlotTableProps["onChange"]) {
  const v = s[c.key];
  switch (c.kind) {
    case "number":
      if (c.readOnly) return <span className="ro">{c.prefix ?? ""}{Number(v).toLocaleString("en-US", { maximumFractionDigits: c.decimals ?? 2 })}{c.suffix ?? ""}</span>;
      return <NumberField value={Number(v)} step={c.step} min={c.min} max={c.max} decimals={c.decimals} prefix={c.prefix} suffix={c.suffix} onChange={(x) => onChange(s.slotId, { [c.key]: x } as Partial<SlotInput>)} />;
    case "text":
      if (c.readOnly) return <span className="ro">{String(v)}</span>;
      return <input type="text" value={String(v)} onChange={(e) => onChange(s.slotId, { [c.key]: e.target.value } as Partial<SlotInput>)} />;
    case "month":
      return <MonthField value={String(v)} onChange={(iso) => onChange(s.slotId, { [c.key]: iso } as Partial<SlotInput>)} />;
    case "bool":
      return <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(s.slotId, { [c.key]: e.target.checked } as Partial<SlotInput>)} />;
    case "select":
      if (c.readOnly) return <span className="ro">{String(v) || "-"}</span>;
      return (
        <select value={String(v)} onChange={(e) => onChange(s.slotId, { [c.key]: e.target.value } as Partial<SlotInput>)}>
          <option value="">Choose TC</option>
          {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
  }
}
