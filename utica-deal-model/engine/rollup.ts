/**
 * Deal rollup. Mirrors model.roll_up_deal (sums by month plus the
 * non-duplicated promote portfolio summary) and adds the decided economic
 * trimming: the reported deal frame ends at the last month with nonzero
 * production or cash flow.
 */

import type { MonthIndex } from "./months";
import type { PromoteResult, PromoteScheduleRow } from "./promote";
import type { DealCalendar } from "./calendar";

export interface DealMonth {
  month: MonthIndex;
  indexOilPrice: number;
  indexGasPrice: number;
  slotGrossOilProduction: number; slotGrossGasProduction: number; slotGrossNglProduction: number; slotGrossBoe: number;
  slotNetOilProduction: number; slotNetGasProduction: number; slotNetNglProduction: number; slotNetBoe: number;
  slotOilRevenue: number; slotGasRevenue: number; slotNglRevenue: number; slotTotalRevenue: number;
  slotLoe: number; slotTax: number; slotOperatingProfit: number; slotPromoteOcf: number;
  slotBaseCapex: number; slotDaleCarryCapex: number; slotCapex: number; slotPudCashFlow: number;
  slotAssetPurchase: number; slotTotalCashFlow: number;
  promote: PromotePortfolioMonth | null;
}

export interface PromotePortfolioMonth {
  monthlyInvestment: number;
  monthlyDistributions: number;
  cumulativeInvestment: number;
  cumulativeDistributions: number;
  runningMultiple: number;
  hurdleReached: boolean; // any group
  active: boolean; // any group
  earliestHurdleDate: MonthIndex | null;
  earliestEffectiveDate: MonthIndex | null;
  activeGroupCount: number;
  totalGroupCount: number;
}

export interface DealRollup {
  rows: DealMonth[]; // calendarStart .. economicCalendarEnd
  calendarStart: MonthIndex;
  calculationHorizonEnd: MonthIndex;
  economicCalendarEnd: MonthIndex;
  /** Untrimmed rows (through the calculation horizon), for audit. */
  allRows: DealMonth[];
}

const SUM = [
  "slotGrossOilProduction", "slotGrossGasProduction", "slotGrossNglProduction", "slotGrossBoe",
  "slotNetOilProduction", "slotNetGasProduction", "slotNetNglProduction", "slotNetBoe",
  "slotOilRevenue", "slotGasRevenue", "slotNglRevenue", "slotTotalRevenue", "slotLoe", "slotTax", "slotOperatingProfit", "slotPromoteOcf",
  "slotBaseCapex", "slotDaleCarryCapex", "slotCapex", "slotPudCashFlow", "slotAssetPurchase", "slotTotalCashFlow",
] as const;

export function rollUpDeal(cal: DealCalendar, promote: PromoteResult, opts: { trimToEconomicLife?: boolean } = {}): DealRollup {
  const trim = opts.trimToEconomicLife ?? !cal.legacyCutoffApplied;
  const summary = buildPortfolioSummary(promote.schedule, cal.months);
  const allRows: DealMonth[] = cal.months.map((m, i) => {
    const row: DealMonth = {
      month: m, indexOilPrice: cal.slots[0].rows[i].indexOilPrice, indexGasPrice: cal.slots[0].rows[i].indexGasPrice,
      slotGrossOilProduction: 0, slotGrossGasProduction: 0, slotGrossNglProduction: 0, slotGrossBoe: 0,
      slotNetOilProduction: 0, slotNetGasProduction: 0, slotNetNglProduction: 0, slotNetBoe: 0,
      slotOilRevenue: 0, slotGasRevenue: 0, slotNglRevenue: 0, slotTotalRevenue: 0, slotLoe: 0, slotTax: 0, slotOperatingProfit: 0, slotPromoteOcf: 0,
      slotBaseCapex: 0, slotDaleCarryCapex: 0, slotCapex: 0, slotPudCashFlow: 0, slotAssetPurchase: 0, slotTotalCashFlow: 0,
      promote: summary ? summary.get(m) ?? null : null,
    };
    // Sum in slot order (matches groupby("date").sum() over the concatenated slot frames).
    for (const sf of promote.slots) {
      const r = sf.rows[i];
      for (const f of SUM) (row as any)[f] += (r as any)[f];
    }
    return row;
  });

  let economicEnd = cal.calendarStart;
  for (const r of allRows) {
    if (Math.abs(r.slotGrossBoe) > 0 || Math.abs(r.slotTotalCashFlow) > 0) economicEnd = r.month;
  }
  const rows = trim ? allRows.filter((r) => r.month <= economicEnd) : allRows;
  return { rows, allRows, calendarStart: cal.calendarStart, calculationHorizonEnd: cal.calendarEnd, economicCalendarEnd: economicEnd };
}

function buildPortfolioSummary(schedule: PromoteScheduleRow[], months: MonthIndex[]): Map<MonthIndex, PromotePortfolioMonth> | null {
  if (schedule.length === 0) return null;
  const groups = [...new Set(schedule.map((r) => r.payoutGroup))];
  const earliestHurdle = minOrNull(groups.map((g) => schedule.find((r) => r.payoutGroup === g)!.hurdleDate));
  const earliestEffective = minOrNull(groups.map((g) => schedule.find((r) => r.payoutGroup === g)!.effectiveDate));
  const byMonth = new Map<MonthIndex, PromoteScheduleRow[]>();
  for (const r of schedule) { const l = byMonth.get(r.month); if (l) l.push(r); else byMonth.set(r.month, [r]); }
  const out = new Map<MonthIndex, PromotePortfolioMonth>();
  for (const m of months) {
    const rows = byMonth.get(m);
    if (!rows) continue; // Python: left merge leaves NaN where the schedule has no row
    let inv = 0, dist = 0, cinv = 0, cdist = 0, reached = false, active = false, activeCount = 0;
    for (const r of rows) { inv += r.monthlyInvestment; dist += r.monthlyDistributions; cinv += r.cumulativeInvestment; cdist += r.cumulativeDistributions; reached = reached || r.hurdleReached; active = active || r.active; if (r.active) activeCount++; }
    out.set(m, { monthlyInvestment: inv, monthlyDistributions: dist, cumulativeInvestment: cinv, cumulativeDistributions: cdist,
      runningMultiple: cinv > 0 ? cdist / cinv : 0, hurdleReached: reached, active, earliestHurdleDate: earliestHurdle,
      earliestEffectiveDate: earliestEffective, activeGroupCount: activeCount, totalGroupCount: groups.length });
  }
  return out;
}

function minOrNull(xs: (MonthIndex | null)[]): MonthIndex | null {
  const v = xs.filter((x): x is MonthIndex => x !== null);
  return v.length ? Math.min(...v) : null;
}
