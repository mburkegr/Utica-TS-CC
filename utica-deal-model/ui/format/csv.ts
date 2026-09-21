/** CSV serialization of engine outputs. Formatting only; values come from the engine unchanged. */
import type { PeriodTable, DealMonth, SensitivityGrid, ScenarioPoint } from "../../engine/index";
import { PERIOD_METRIC_LABELS, PERIOD_METRICS, monthToIso } from "../../engine/index";
import { axisLabel } from "../charts/Heatmap";

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rows = (r: unknown[][]) => r.map((x) => x.map(cell).join(",")).join("\n") + "\n";

export function safeFileStem(dealName: string | undefined | null): string {
  const s = (dealName ?? "").trim().replace(/[^A-Za-z0-9&+\- ]+/g, " ").trim().replace(/\s+/g, "_");
  return s || "Utica_Deal";
}

/** Exact canonical engine inputs, for reconciliation against the Python model. */
export function inputsJson(inputs: { deal: unknown; slots: unknown }, dealName: string, meta: Record<string, unknown> = {}): string {
  return JSON.stringify({ export: "utica-ui-inputs", schema: "utica-ui-v1", dealName, exportedAt: new Date().toISOString(), ...meta, inputs }, null, 2) + "\n";
}

export function periodTableCsv(t: PeriodTable): string {
  return rows([["Metric", ...t.columns.map((c) => c.label)], ...PERIOD_METRICS.map((m) => [PERIOD_METRIC_LABELS[m], ...t.values[m]])]);
}

export function monthlyDealCsv(deal: DealMonth[]): string {
  const head = ["Month", "Index Oil ($/bbl)", "Index Gas ($/Mcf)", "Gross Oil (bbl)", "Gross Residue Gas (Mcf)", "Gross Theoretical NGL (bbl)", "Net Oil (bbl)", "Net Residue Gas (Mcf)", "Net Theoretical NGL (bbl)", "Net BOE",
    "Oil Revenue", "Gas Revenue", "NGL Revenue", "Total Revenue", "LOE", "Tax", "Operating Profit", "Dale Payout OCF", "Base D&C", "Dale Carry D&C", "Total D&C", "Acquisition", "Total Cash Flow",
    "Payout Cum. Investment", "Payout Cum. Distributions", "Payout Multiple", "Back-in Active", "Active Groups"];
  return rows([head, ...deal.map((m) => [monthToIso(m.month), m.indexOilPrice, m.indexGasPrice, m.slotGrossOilProduction, m.slotGrossGasProduction, m.slotGrossNglProduction, m.slotNetOilProduction, m.slotNetGasProduction, m.slotNetNglProduction, m.slotNetBoe,
    m.slotOilRevenue, m.slotGasRevenue, m.slotNglRevenue, m.slotTotalRevenue, m.slotLoe, m.slotTax, m.slotOperatingProfit, m.slotPromoteOcf, m.slotBaseCapex, m.slotDaleCarryCapex, m.slotCapex, m.slotAssetPurchase, m.slotTotalCashFlow,
    m.promote?.cumulativeInvestment ?? "", m.promote?.cumulativeDistributions ?? "", m.promote?.runningMultiple ?? "", m.promote ? (m.promote.active ? "Yes" : "No") : "", m.promote?.activeGroupCount ?? ""])]);
}

export function sensitivityGridCsv(g: SensitivityGrid): string {
  const { spec } = g;
  const xs = spec.xValues.map((x) => axisLabel(x as number, spec.xFormat));
  const block = (metric: "IRR" | "MOIC", data: (number | null)[][]) => [[`${metric}: ${spec.title}`], [`${spec.yTitle} \\ ${spec.xTitle}`, ...xs], ...spec.yValues.map((y, i) => [axisLabel(y as number, spec.yFormat), ...data[i]])];
  return rows([...block("IRR", g.irr), [""], ...block("MOIC", g.moic)]);
}

export function scenarioCsv(points: ScenarioPoint[]): string {
  return rows([["Pricing Case", "Oil ($/bbl)", "Gas ($/Mcf)", "D&C Case", "D&C ($/ft)", "TC Risk", "$/Acre Bid", "IRR", "MOIC"], ...points.map((p) => [p.pricingCase, p.oilPrice, p.gasPrice, p.dcLabel, p.dcValue, p.tcRisk, p.bid, p.irr, p.moic])]);
}
