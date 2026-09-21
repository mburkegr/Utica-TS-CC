/**
 * Deal calendar. Mirrors model.align_to_financial_calendar plus the
 * acquisition placement in model.build_all_slot_financials, with two decided
 * changes:
 *
 *  1. Horizon. Legacy Python cuts the calendar at effectiveDate + 359 months.
 *     The engine's default horizon is the latest month of the latest slot's
 *     full type curve (calculation horizon). `calendarMonths` reproduces the
 *     legacy cutoff for parity testing only. Economic trimming (last nonzero
 *     month) is done downstream by the rollup.
 *  2. Month-level aggregation. Python left-joins well rows onto the calendar,
 *     so flowbackDelay = 0 produces two rows in the spud month and books the
 *     acquisition twice when spud = effective. The engine aggregates a slot's
 *     rows by month before alignment and books acquisition exactly once.
 *
 * Preserved conventions: calendarStart = min(effective, earliest spud);
 * months without well data carry zero flows and period 0; index prices are
 * populated on every calendar month; carry/Dale flags are slot constants.
 */

import type { MonthIndex } from "./months";
import type { SlotFrame, SlotLayerConstants, SlotMonth } from "./layers";
import { buildIndexPriceSeries } from "./pricing";
import type { DealSettings, GlobalAssumptions, PriceDeck } from "./types";

export interface CalendarOptions {
  /** Legacy parity switch: fixed number of months from the effective date. Default: full life. */
  calendarMonths?: number;
}

export interface AlignedSlotMonth {
  month: MonthIndex;
  period: number; // 0 on months without well data (preserved convention)
  hasWellData: boolean;
  /** Number of well rows aggregated into this month (2 only when flowbackDelay = 0 in the spud month). */
  wellRowCount: number;
  indexOilPrice: number;
  indexGasPrice: number;

  // single-well level (per gross well), zero on empty months
  baseOilScaled: number; baseGasScaled: number;
  grossOilProduction: number; grossGasProduction: number; grossNglProduction: number; monthlyProductionBoe: number;
  oilRoyaltyVolumes: number; gasRoyaltyVolumes: number; nglRoyaltyVolumes: number;
  equityOilProduction: number; equityGasProduction: number; equityNglProduction: number;
  localOilPrice: number; localGasPrice: number; localNglPrice: number;
  oilRevenue: number; gasRevenue: number; nglRevenue: number; totalRevenue: number;
  variableLoe: number; fixedLoeMonthly: number; totalLoe: number; tax: number; capex: number;
  preShutInOperatingCf: number; operatingCf: number; cashFlow: number;
  economicLimitReached: boolean | null; wellShutIn: boolean | null;

  // ownership per month
  carryReversionActive: boolean | null;
  ownershipFactor: number; effectiveWorkingInterest: number; effectiveNetWells: number;

  // slot level
  slotGrossOilProduction: number; slotGrossGasProduction: number; slotGrossNglProduction: number; slotGrossBoe: number;
  slotNetOilProduction: number; slotNetGasProduction: number; slotNetNglProduction: number; slotNetBoe: number;
  slotOilRevenue: number; slotGasRevenue: number; slotNglRevenue: number; slotTotalRevenue: number;
  slotLoe: number; slotTax: number; slotOperatingProfit: number; slotPromoteOcf: number;
  slotBaseCapex: number; slotDaleCarryCapex: number; slotCapex: number; slotPudCashFlow: number;
  slotAssetPurchase: number; slotTotalCashFlow: number;
}

export interface AlignedSlotFrame {
  constants: SlotLayerConstants;
  rows: AlignedSlotMonth[];
  spudMonth: MonthIndex;
  terminalMonth: MonthIndex;
  shutInPeriod: number | null;
}

export interface DealCalendar {
  calendarStart: MonthIndex;
  calendarEnd: MonthIndex; // calculation horizon (or legacy end when calendarMonths is set)
  months: MonthIndex[];
  legacyCutoffApplied: boolean;
  slots: AlignedSlotFrame[];
}

const SUM_FIELDS = [
  "baseOilScaled", "baseGasScaled", "grossOilProduction", "grossGasProduction", "grossNglProduction", "monthlyProductionBoe",
  "oilRoyaltyVolumes", "gasRoyaltyVolumes", "nglRoyaltyVolumes", "equityOilProduction", "equityGasProduction", "equityNglProduction",
  "oilRevenue", "gasRevenue", "nglRevenue", "totalRevenue", "variableLoe", "fixedLoeMonthly", "totalLoe", "tax", "capex",
  "preShutInOperatingCf", "operatingCf", "cashFlow",
] as const;
const SLOT_SUM_FIELDS = [
  "slotGrossOilProduction", "slotGrossGasProduction", "slotGrossNglProduction", "slotGrossBoe",
  "slotNetOilProduction", "slotNetGasProduction", "slotNetNglProduction", "slotNetBoe",
  "slotOilRevenue", "slotGasRevenue", "slotNglRevenue", "slotTotalRevenue", "slotLoe", "slotTax", "slotOperatingProfit", "slotPromoteOcf",
  "slotBaseCapex", "slotDaleCarryCapex", "slotCapex", "slotPudCashFlow",
] as const;

export function buildDealCalendar(
  slots: SlotFrame[],
  settings: DealSettings,
  g: GlobalAssumptions,
  deck: PriceDeck | null,
  opts: CalendarOptions = {},
): DealCalendar {
  if (slots.length === 0) throw new Error("No slots to align");
  const effective = settings.effectiveDate;
  const earliestSpud = Math.min(...slots.map((s) => s.well.spudMonth));
  const calendarStart = Math.min(effective, earliestSpud);

  let calendarEnd: MonthIndex;
  let legacy = false;
  if (opts.calendarMonths !== undefined) {
    if (!Number.isInteger(opts.calendarMonths) || opts.calendarMonths < 1) throw new Error("calendarMonths must be a positive integer");
    calendarEnd = effective + opts.calendarMonths - 1;
    legacy = true;
  } else {
    calendarEnd = Math.max(...slots.map((s) => s.rows[s.rows.length - 1].month));
  }
  const months: MonthIndex[] = [];
  for (let m = calendarStart; m <= calendarEnd; m++) months.push(m);
  const prices = buildIndexPriceSeries(months, g, deck);

  const aligned = slots.map((sf) => alignSlot(sf, months, prices, effective));
  return { calendarStart, calendarEnd, months, legacyCutoffApplied: legacy, slots: aligned };
}

function alignSlot(
  sf: SlotFrame,
  months: MonthIndex[],
  prices: { indexOilPrice: number; indexGasPrice: number }[],
  effective: MonthIndex,
): AlignedSlotFrame {
  const byMonth = new Map<MonthIndex, SlotMonth[]>();
  for (const r of sf.rows) {
    const list = byMonth.get(r.month);
    if (list) list.push(r); else byMonth.set(r.month, [r]);
  }
  const rows: AlignedSlotMonth[] = months.map((m, i) => {
    const list = byMonth.get(m) ?? [];
    const row = emptyRow(m, prices[i].indexOilPrice, prices[i].indexGasPrice);
    if (list.length > 0) {
      row.hasWellData = true;
      row.wellRowCount = list.length;
      // Fields taken from the highest-period row in the month (the producing row when flowbackDelay = 0).
      const lead = list.reduce((a, b) => (b.period > a.period ? b : a));
      row.period = lead.period;
      row.localOilPrice = lead.well.localOilPrice;
      row.localGasPrice = lead.well.localGasPrice;
      row.localNglPrice = lead.well.localNglPrice;
      row.economicLimitReached = list.some((r) => r.well.economicLimitReached);
      row.wellShutIn = lead.well.wellShutIn;
      row.carryReversionActive = lead.carryReversionActive;
      row.ownershipFactor = lead.ownershipFactor;
      row.effectiveWorkingInterest = lead.effectiveWorkingInterest;
      row.effectiveNetWells = lead.effectiveNetWells;
      for (const r of list) {
        for (const f of SUM_FIELDS) (row as any)[f] += (r.well as any)[f];
        for (const f of SLOT_SUM_FIELDS) (row as any)[f] += (r as any)[f];
      }
    }
    // Acquisition is booked exactly once, on the effective month.
    row.slotAssetPurchase = m === effective ? -sf.constants.acquisitionCost : 0.0;
    row.slotTotalCashFlow = row.slotPudCashFlow + row.slotAssetPurchase;
    return row;
  });
  return { constants: sf.constants, rows, spudMonth: sf.well.spudMonth, terminalMonth: sf.well.terminalMonth, shutInPeriod: sf.well.shutInPeriod };
}

function emptyRow(month: MonthIndex, idxOil: number, idxGas: number): AlignedSlotMonth {
  return {
    month, period: 0, hasWellData: false, wellRowCount: 0, indexOilPrice: idxOil, indexGasPrice: idxGas,
    baseOilScaled: 0, baseGasScaled: 0, grossOilProduction: 0, grossGasProduction: 0, grossNglProduction: 0, monthlyProductionBoe: 0,
    oilRoyaltyVolumes: 0, gasRoyaltyVolumes: 0, nglRoyaltyVolumes: 0, equityOilProduction: 0, equityGasProduction: 0, equityNglProduction: 0,
    localOilPrice: 0, localGasPrice: 0, localNglPrice: 0, oilRevenue: 0, gasRevenue: 0, nglRevenue: 0, totalRevenue: 0,
    variableLoe: 0, fixedLoeMonthly: 0, totalLoe: 0, tax: 0, capex: 0, preShutInOperatingCf: 0, operatingCf: 0, cashFlow: 0,
    economicLimitReached: null, wellShutIn: null, carryReversionActive: null,
    ownershipFactor: 0, effectiveWorkingInterest: 0, effectiveNetWells: 0,
    slotGrossOilProduction: 0, slotGrossGasProduction: 0, slotGrossNglProduction: 0, slotGrossBoe: 0,
    slotNetOilProduction: 0, slotNetGasProduction: 0, slotNetNglProduction: 0, slotNetBoe: 0,
    slotOilRevenue: 0, slotGasRevenue: 0, slotNglRevenue: 0, slotTotalRevenue: 0, slotLoe: 0, slotTax: 0, slotOperatingProfit: 0, slotPromoteOcf: 0,
    slotBaseCapex: 0, slotDaleCarryCapex: 0, slotCapex: 0, slotPudCashFlow: 0, slotAssetPurchase: 0, slotTotalCashFlow: 0,
  };
}
