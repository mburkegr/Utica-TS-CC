import React from "react";
import type { PeriodTable, PeriodMetric } from "../../engine/index";
import { PERIOD_METRIC_LABELS } from "../../engine/index";
import { fmtNumber, fmtPct, fmtProduction } from "../format/format";

const GROUPS: { title: string; rows: PeriodMetric[]; bold?: PeriodMetric[]; italic?: PeriodMetric[] }[] = [
  { title: "Assumed Index Pricing", rows: ["indexOilPrice", "indexGasPrice"] },
  { title: "Realized Pricing", rows: ["realizedOilPrice", "realizedGasPrice", "realizedNglPctOfWti"] },
  { title: "Wells Spud", rows: ["grossWellsSpud", "netWellsSpud"] },
  { title: "Net Production", rows: ["oilBblPerDay", "gasMcfPerDay", "nglBblPerDay", "totalMcfePerDay"], bold: ["totalMcfePerDay"] },
  { title: "Revenues ($k)", rows: ["oilRevenueK", "gasRevenueK", "nglRevenueK", "totalRevenueK"], bold: ["totalRevenueK"] },
  { title: "Operating Expenses ($k)", rows: ["taxesK", "loeK", "totalOpexK", "taxesPerMcfe", "loePerMcfe"], bold: ["totalOpexK"], italic: ["taxesPerMcfe", "loePerMcfe"] },
  { title: "EBITDA ($k)", rows: ["ebitdaK"], bold: ["ebitdaK"] },
  { title: "Capital Expenditures ($k)", rows: ["dncCapexK", "acquisitionCapexK", "totalCapexK"], bold: ["totalCapexK"] },
  { title: "Free Cash Flow ($k)", rows: ["freeCashFlowK", "cumulativeFcfK"], bold: ["freeCashFlowK", "cumulativeFcfK"] },
];

function fmt(metric: PeriodMetric, v: number): string {
  if (metric === "realizedNglPctOfWti") return fmtPct(v, 0, true);
  if (["indexOilPrice", "indexGasPrice", "realizedOilPrice", "realizedGasPrice", "taxesPerMcfe", "loePerMcfe"].includes(metric)) return fmtNumber(v, 2, "$");
  if (["grossWellsSpud", "netWellsSpud", "oilBblPerDay", "gasMcfPerDay", "nglBblPerDay", "totalMcfePerDay"].includes(metric)) return fmtProduction(v);
  return fmtNumber(v, 1, "$");
}

export function PeriodTableView({ table, title }: { table: PeriodTable; title: string }) {
  return (
    <div className="table-wrap">
      <table className="period-table">
        <thead><tr><th className="sticky c1">{title}</th>{table.columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
        <tbody>
          {GROUPS.map((g) => (
            <React.Fragment key={g.title}>
              <tr className="group"><td className="sticky c1">{g.title}</td>{table.columns.map((c) => <td key={c.label} />)}</tr>
              {g.rows.map((m) => (
                <tr key={m} className={g.bold?.includes(m) ? "bold" : g.italic?.includes(m) ? "italic" : undefined}>
                  <td className="sticky c1 indent" title={PERIOD_METRIC_LABELS[m]}>{shortLabel(m)}</td>
                  {table.values[m].map((v, i) => <td key={i} className="num">{fmt(m, v)}</td>)}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortLabel(m: PeriodMetric): string {
  const L = PERIOD_METRIC_LABELS[m];
  return L.replace(/^Assumed Index Pricing - |^Realized Pricing - |^Net Production - |^Revenues - |^Operating Expenses - |^Capital Expenditures - /, "");
}
