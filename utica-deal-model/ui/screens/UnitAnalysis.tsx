import React from "react";
import { Section } from "../components/fields";
import { ExportButtons } from "../components/ExportButtons";
import { unitAnalysisSummary, hearingDate, type UnitAnalysisRow } from "../../gis/index";
import { fmtNumber } from "../format/format";
import { unitAnalysisCsv } from "../format/csv";

export interface UnitAnalysisProps {
  rows: readonly UnitAnalysisRow[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * Units picked on the GIS map, with the unit-level data the map carries.
 * Reference data only: nothing here feeds the deal economics. Missing values
 * stay blank; a unit outside the D&C workbook has an operator and nothing else.
 */
export function UnitAnalysis({ rows, onRemove, onClear, stem }: UnitAnalysisProps & { stem: string }) {
  if (rows.length === 0) return (
    <div className="empty">
      <h3>No units selected</h3>
      <p>Pick units on the map to compare their operator, hearing year, wells, lateral length and D&C here.</p>
      <ol><li>Switch to GIS in the left rail.</li><li>Turn on <b>Select units</b> in the map toolbar.</li><li>Click units to add them; click again to remove. Then press <b>Open in Deal Model</b>.</li></ol>
    </div>
  );
  const s = unitAnalysisSummary(rows);
  const blank = (x: number | null, d: number, prefix = "") => (x === null ? "" : fmtNumber(x, d, prefix, "", false));
  return (
    <Section title="Selected units"
      note="Unit-level data, one row per unit. Operator is from the ODNR units shapefile; hearing date, wells, average lateral and D&C $/ft are from the D&C workbook and are blank for units it does not cover. The summary uses only units with D&C data: lateral is averaged per well, and D&C is total cost over total lateral feet, so longer laterals and more wells weigh more."
      right={<span className="row"><ExportButtons filename={`${stem}_Unit_Analysis.csv`} csv={() => unitAnalysisCsv(rows)} /><button className="btn secondary" onClick={onClear} data-testid="unit-analysis-clear">Clear all</button></span>}>
      <div className="table-wrap"><table className="mini" data-testid="unit-analysis-table">
        <thead><tr><th>Unit</th><th>Operator</th><th className="num">Hearing year</th><th className="num">Wells</th><th className="num">Avg lateral (ft)</th><th className="num">D&C ($/ft)</th><th className="num">Unit acres</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-unit={r.id}>
              <td>{r.name}</td><td>{r.operator}</td>
              <td className="num" title={r.hearingDate ? `Hearing ${hearingDate(r.hearingDate)}` : undefined}>{r.hearingYear ?? ""}</td>
              <td className="num">{blank(r.wells, 0)}</td><td className="num">{blank(r.avgLateralFt, 0)}</td><td className="num" data-dc={r.id}>{blank(r.dcPerFt, 0, "$")}</td>
              <td className="num">{blank(r.acres, 0)}</td>
              <td><button className="link" onClick={() => onRemove(r.id)} aria-label={`Remove ${r.name}`}>Remove</button></td>
            </tr>
          ))}
          <tr className="total" data-testid="unit-analysis-summary">
            <td>{s.units} unit{s.units === 1 ? "" : "s"}</td><td className="muted">{s.unitsWithDc} with D&C data</td><td></td>
            <td className="num">{s.unitsWithDc ? fmtNumber(s.wells, 0) : ""}</td><td className="num">{blank(s.avgLateralFt, 0)}</td><td className="num" data-testid="unit-analysis-dc">{blank(s.dcPerFt, 0, "$")}</td><td></td><td></td>
          </tr>
        </tbody>
      </table></div>
    </Section>
  );
}
