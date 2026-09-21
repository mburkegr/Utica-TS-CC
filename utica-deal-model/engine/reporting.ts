/**
 * Reporting (data only, no rendering). Mirrors the formulas in
 * app.build_quarterly_output_table.build_section and the EUR logic in
 * app.calc_slot_eur_metrics, with the decided changes:
 *
 *  - period labels are generated from the model calendar: 8 quarters from
 *    the quarter containing calendarStart (default), annual columns through
 *    the economic life; nothing is hard-coded;
 *  - EUR/ft and NGL volumes carry explicit labels: raw (pre-shrink) vs
 *    residue (post-shrink) gas, theoretical (pre-recovery) vs recovered
 *    (post-recovery) NGL;
 *  - chart series accept a display window that filters only what is drawn.
 *    Payback, IRR, MOIC and every table are computed from full-life data.
 */

import type { DealResult } from "./deal";
import { daysInMonth, type MonthIndex, monthOfYear1, monthYear } from "./months";
import type { DealMonth } from "./rollup";

// ---------------------------------------------------------------------------
// Period tables
// ---------------------------------------------------------------------------
export type Granularity = "quarter" | "year";

export interface PeriodColumn { label: string; months: MonthIndex[]; days: number }

export const PERIOD_METRICS = [
  "indexOilPrice", "indexGasPrice", "realizedOilPrice", "realizedNglPctOfWti", "realizedGasPrice",
  "grossWellsSpud", "netWellsSpud",
  "oilBblPerDay", "nglBblPerDay", "gasMcfPerDay", "totalMcfePerDay",
  "oilRevenueK", "nglRevenueK", "gasRevenueK", "totalRevenueK",
  "taxesK", "loeK", "totalOpexK", "taxesPerMcfe", "loePerMcfe", "ebitdaK",
  "dncCapexK", "acquisitionCapexK", "totalCapexK", "freeCashFlowK", "cumulativeFcfK",
] as const;
export type PeriodMetric = (typeof PERIOD_METRICS)[number];

/** Display labels. Gas volumes are residue (post-shrink); NGL volumes are theoretical yield (pre-recovery). */
export const PERIOD_METRIC_LABELS: Record<PeriodMetric, string> = {
  indexOilPrice: "Assumed Index Pricing - Crude Oil ($/bbl)",
  indexGasPrice: "Assumed Index Pricing - Natural Gas ($/Mcf)",
  realizedOilPrice: "Realized Pricing - Crude Oil ($/bbl)",
  realizedNglPctOfWti: "Realized Pricing - NGL, Recovery-Weighted (% of WTI)",
  realizedGasPrice: "Realized Pricing - Natural Gas, Residue ($/Mcf)",
  grossWellsSpud: "Gross Wells Spud",
  netWellsSpud: "Net Wells Spud",
  oilBblPerDay: "Net Production - Crude Oil (bbl/d)",
  nglBblPerDay: "Net Production - NGL, Theoretical Yield Pre-Recovery (bbl/d)",
  gasMcfPerDay: "Net Production - Natural Gas, Residue Post-Shrink (Mcf/d)",
  totalMcfePerDay: "Net Production - Total (Mcfe/d)",
  oilRevenueK: "Revenues - Crude Oil ($k)",
  nglRevenueK: "Revenues - NGL ($k)",
  gasRevenueK: "Revenues - Natural Gas ($k)",
  totalRevenueK: "Revenues - Total ($k)",
  taxesK: "Operating Expenses - Taxes ($k)",
  loeK: "Operating Expenses - LOE ($k)",
  totalOpexK: "Operating Expenses - Total Opex ($k)",
  taxesPerMcfe: "Taxes / Mcfe ($)",
  loePerMcfe: "LOE / Mcfe ($)",
  ebitdaK: "EBITDA ($k)",
  dncCapexK: "Capital Expenditures - D&C ($k)",
  acquisitionCapexK: "Capital Expenditures - Acquisition ($k)",
  totalCapexK: "Capital Expenditures - Total ($k)",
  freeCashFlowK: "Free Cash Flow ($k)",
  cumulativeFcfK: "Cumulative FCF ($k)",
};

export interface PeriodTable {
  granularity: Granularity;
  columns: PeriodColumn[];
  /** values[metric][columnIndex] */
  values: Record<PeriodMetric, number[]>;
}

export interface PeriodTableOptions {
  /** Quarterly: number of quarters from the quarter containing calendarStart (default 8). */
  quarters?: number;
}

export function quarterLabel(m: MonthIndex): string {
  const q = Math.floor((monthOfYear1(m) - 1) / 3) + 1;
  return `Q${q} ${String(monthYear(m) % 100).padStart(2, "0")}`;
}
export function yearLabel(m: MonthIndex): string { return String(monthYear(m)); }

function buildColumns(result: DealResult, granularity: Granularity, opts: PeriodTableOptions): PeriodColumn[] {
  const start = result.deal.calendarStart;
  const end = result.deal.economicCalendarEnd;
  const cols: PeriodColumn[] = [];
  if (granularity === "quarter") {
    const n = opts.quarters ?? 8;
    const qStart = start - ((monthOfYear1(start) - 1) % 3);
    for (let i = 0; i < n; i++) {
      const m0 = qStart + 3 * i;
      const months = [m0, m0 + 1, m0 + 2];
      cols.push({ label: quarterLabel(m0), months, days: months.reduce((s, m) => s + daysInMonth(m), 0) });
    }
  } else {
    for (let y = monthYear(start); y <= monthYear(end); y++) {
      const months: MonthIndex[] = [];
      for (let k = 0; k < 12; k++) months.push(y * 12 + k);
      cols.push({ label: String(y), months, days: months.reduce((s, m) => s + daysInMonth(m), 0) });
    }
  }
  return cols;
}

const safeDiv = (n: number, d: number) => (d !== 0 && Number.isFinite(d) ? n / d : 0.0);

export function buildPeriodTable(result: DealResult, granularity: Granularity, opts: PeriodTableOptions = {}): PeriodTable {
  const columns = buildColumns(result, granularity, opts);
  const byMonth = new Map<MonthIndex, DealMonth>();
  for (const r of result.deal.allRows) byMonth.set(r.month, r);

  const values = Object.fromEntries(PERIOD_METRICS.map((k) => [k, [] as number[]])) as Record<PeriodMetric, number[]>;
  let cumFcf = 0.0;
  for (const col of columns) {
    const rows = col.months.map((m) => byMonth.get(m)).filter((r): r is DealMonth => r !== undefined);
    const sum = (f: keyof DealMonth) => rows.reduce((s, r) => s + (r[f] as number), 0.0);
    const mean = (f: keyof DealMonth) => (rows.length ? sum(f) / rows.length : 0.0);
    const oilIdx = mean("indexOilPrice"), gasIdx = mean("indexGasPrice");
    const netOil = sum("slotNetOilProduction"), netGas = sum("slotNetGasProduction"), netNgl = sum("slotNetNglProduction");
    const oilRev = sum("slotOilRevenue"), gasRev = sum("slotGasRevenue"), nglRev = sum("slotNglRevenue"), totRev = sum("slotTotalRevenue");
    const taxesPos = -sum("slotTax"), loePos = -sum("slotLoe"), totalOpex = taxesPos + loePos;
    const dnc = -sum("slotCapex"), acq = -sum("slotAssetPurchase"), fcf = sum("slotTotalCashFlow");
    const totalMcfe = netOil * 6.0 + netNgl * 6.0 + netGas;
    const realizedNgl = safeDiv(nglRev, netNgl);
    cumFcf += fcf / 1000.0;

    // wells spud in the period: gross from inputs, net from the slot's effective net wells on its spud-month row
    let gross = 0.0, net = 0.0;
    for (const sf of result.promote.slots) {
      if (!col.months.includes(sf.spudMonth)) continue;
      gross += sf.constants.grossWells;
      const spudRow = sf.rows.find((r) => r.month === sf.spudMonth);
      net += spudRow ? spudRow.effectiveNetWells : sf.constants.grPartiesNetWells;
    }

    values.indexOilPrice.push(oilIdx); values.indexGasPrice.push(gasIdx);
    values.realizedOilPrice.push(safeDiv(oilRev, netOil)); values.realizedNglPctOfWti.push(safeDiv(realizedNgl, oilIdx)); values.realizedGasPrice.push(safeDiv(gasRev, netGas));
    values.grossWellsSpud.push(gross); values.netWellsSpud.push(net);
    values.oilBblPerDay.push(safeDiv(netOil, col.days)); values.nglBblPerDay.push(safeDiv(netNgl, col.days)); values.gasMcfPerDay.push(safeDiv(netGas, col.days)); values.totalMcfePerDay.push(safeDiv(totalMcfe, col.days));
    values.oilRevenueK.push(oilRev / 1000.0); values.nglRevenueK.push(nglRev / 1000.0); values.gasRevenueK.push(gasRev / 1000.0); values.totalRevenueK.push(totRev / 1000.0);
    values.taxesK.push(taxesPos / 1000.0); values.loeK.push(loePos / 1000.0); values.totalOpexK.push(totalOpex / 1000.0);
    values.taxesPerMcfe.push(safeDiv(taxesPos, totalMcfe)); values.loePerMcfe.push(safeDiv(loePos, totalMcfe)); values.ebitdaK.push((totRev - totalOpex) / 1000.0);
    values.dncCapexK.push(dnc / 1000.0); values.acquisitionCapexK.push(acq / 1000.0); values.totalCapexK.push((dnc + acq) / 1000.0);
    values.freeCashFlowK.push(fcf / 1000.0); values.cumulativeFcfK.push(cumFcf);
  }
  return { granularity, columns, values };
}

// ---------------------------------------------------------------------------
// EUR per foot (single gross well, post shut-in, full curve)
// ---------------------------------------------------------------------------
export interface SlotEur {
  slotId: number;
  lateralLength: number;
  monthsSummed: number; // producing periods included (curve end or shut-in)
  oilEurPerFt: number;
  rawGasEurPerFt: number; // pre-shrink, risked, post-economic-limit
  residueGasEurPerFt: number; // post-shrink, risked, post-economic-limit
  theoreticalNglBblPerFt: number; // pre-recovery
  recoveredNglBblPerFt: number; // post-recovery
  gasShrinkFraction: number;
  nglRecoveredFraction: number; // sum(content x recovery) = recovered / theoretical gallons
}

export const EUR_LABELS: Record<Exclude<keyof SlotEur, "slotId" | "lateralLength" | "monthsSummed">, string> = {
  oilEurPerFt: "Oil EUR / ft (Risked, Post-Economic-Limit)",
  rawGasEurPerFt: "Raw Gas EUR / ft (Pre-Shrink, Risked, Post-Economic-Limit)",
  residueGasEurPerFt: "Residue Gas EUR / ft (Post-Shrink, Risked, Post-Economic-Limit)",
  theoreticalNglBblPerFt: "Theoretical NGL Volume / ft (Pre-Recovery)",
  recoveredNglBblPerFt: "Recovered NGL Sales Volume / ft (Post-Recovery)",
  gasShrinkFraction: "Gas Shrink (fraction of raw gas removed as liquids)",
  nglRecoveredFraction: "NGL Recovered Fraction of Theoretical Yield",
};

export function calcSlotEur(result: DealResult): SlotEur[] {
  return result.slots.map((s) => {
    const ll = s.prepared.lateralLength;
    let oil = 0, raw = 0, residue = 0, ngl = 0, n = 0;
    for (const r of s.well.rows) {
      if (r.period < 1) continue;
      oil += r.grossOilProduction; raw += r.baseGasScaled; residue += r.grossGasProduction; ngl += r.grossNglProduction; n++;
    }
    const recoveredFraction = s.ngl.detail.reduce((acc, d) => acc + d.contentPct * d.recoveryPct, 0.0);
    return {
      slotId: s.prepared.slotId, lateralLength: ll, monthsSummed: n,
      oilEurPerFt: ll ? oil / ll : NaN, rawGasEurPerFt: ll ? raw / ll : NaN, residueGasEurPerFt: ll ? residue / ll : NaN,
      theoreticalNglBblPerFt: ll ? ngl / ll : NaN, recoveredNglBblPerFt: ll ? (ngl * recoveredFraction) / ll : NaN,
      gasShrinkFraction: s.ngl.shrink, nglRecoveredFraction: recoveredFraction,
    };
  });
}

// ---------------------------------------------------------------------------
// Chart series (full life) and display windowing (presentation only)
// ---------------------------------------------------------------------------
export interface ProductionSeriesPoint { month: MonthIndex; oilMcfePerDay: number; nglMcfePerDay: number; residueGasMcfePerDay: number; totalMcfePerDay: number }
export interface CumulativeFcfPoint { month: MonthIndex; fcfK: number; cumulativeFcfK: number }

export function productionSeries(result: DealResult): ProductionSeriesPoint[] {
  return result.deal.rows.map((r) => {
    const d = daysInMonth(r.month);
    const oil = (r.slotNetOilProduction * 6.0) / d, ngl = (r.slotNetNglProduction * 6.0) / d, gas = r.slotNetGasProduction / d;
    return { month: r.month, oilMcfePerDay: oil, nglMcfePerDay: ngl, residueGasMcfePerDay: gas, totalMcfePerDay: oil + ngl + gas };
  });
}

export function cumulativeFcfSeries(result: DealResult): CumulativeFcfPoint[] {
  let cum = 0.0;
  return result.deal.rows.map((r) => { cum += r.slotTotalCashFlow / 1000.0; return { month: r.month, fcfK: r.slotTotalCashFlow / 1000.0, cumulativeFcfK: cum }; });
}

export interface DisplayWindow { startMonth?: MonthIndex; endMonth?: MonthIndex }

/** Pure filter for charts. It never feeds back into any calculation. */
export function windowSeries<T extends { month: MonthIndex }>(series: T[], w: DisplayWindow = {}): T[] {
  return series.filter((p) => (w.startMonth === undefined || p.month >= w.startMonth) && (w.endMonth === undefined || p.month <= w.endMonth));
}

// ---------------------------------------------------------------------------
// Deal summary strip (all arithmetic stays in the engine)
// ---------------------------------------------------------------------------
export interface DealSummary {
  slotCount: number;
  grossWells: number;
  /** Net wells at each slot's spud month (after Dale initial interest and any carry, before a later back-in). */
  netWells: number;
  totalNetAcres: number;
  totalAcquisition: number; // positive $
  blendedBidPerAcre: number;
  totalDncCapex: number; // positive $, full life
  /** Peak month of net Boe/d (oil + theoretical NGL + residue gas / 6, divided by days in month). */
  peakNetBoePerDay: number;
  peakNetBoeMonth: MonthIndex | null;
  /** Peak month of gross Boe/d across all gross wells. */
  peakGrossBoePerDay: number;
  calendarStart: MonthIndex;
  economicCalendarEnd: MonthIndex;
  promoteEnabled: boolean;
  earliestPromoteEffective: MonthIndex | null;
}

export function dealSummary(result: DealResult): DealSummary {
  let netAcres = 0, acq = 0, gross = 0, dnc = 0, net = 0;
  for (const s of result.slots) { netAcres += s.prepared.netAcres; acq += s.ownership.acquisitionCost; gross += s.prepared.grossWells; }
  for (const sf of result.promote.slots) {
    const spudRow = sf.rows.find((r) => r.month === sf.spudMonth);
    net += spudRow ? spudRow.effectiveNetWells : sf.constants.grPartiesNetWells;
  }
  let peakNet = 0, peakGross = 0; let peakMonth: MonthIndex | null = null;
  for (const r of result.deal.allRows) {
    dnc -= r.slotCapex;
    const d = daysInMonth(r.month);
    const net = r.slotNetBoe / d, gross = r.slotGrossBoe / d;
    if (net > peakNet) { peakNet = net; peakMonth = r.month; }
    if (gross > peakGross) peakGross = gross;
  }
  const eff = result.promote.schedule.map((r) => r.effectiveDate).filter((d): d is MonthIndex => d !== null);
  return {
    slotCount: result.slots.length, grossWells: gross, netWells: net, totalNetAcres: netAcres, totalAcquisition: acq,
    blendedBidPerAcre: netAcres > 0 ? acq / netAcres : 0, totalDncCapex: dnc,
    peakNetBoePerDay: peakNet, peakNetBoeMonth: peakMonth, peakGrossBoePerDay: peakGross,
    calendarStart: result.deal.calendarStart, economicCalendarEnd: result.deal.economicCalendarEnd,
    promoteEnabled: result.promote.enabled, earliestPromoteEffective: eff.length ? Math.min(...eff) : null,
  };
}
