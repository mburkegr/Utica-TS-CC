/**
 * Single-well economics. Mirrors model.run_single_slot_economics.
 *
 * One gross well, 8/8ths volumes, NRI revenue, before any WI or net-well
 * scaling. Runs the complete type curve (no 360-month master-calendar cutoff;
 * the calendar module decides the horizon).
 *
 * Timing convention (period 0, preserved by decision):
 *  - period 0 is dated the spud month and carries D&C capex with zero volumes;
 *  - period p >= 1 is dated spudMonth + flowbackDelay + (p - 1);
 *  - flowbackDelay = 0 puts period 1 in the spud month (two rows, same month).
 *
 * Economic limit (preserved): the first period >= 1 whose operating cash flow
 * (NRI revenue + 8/8ths LOE + taxes) is negative permanently shuts the well
 * in from that month; volumes, revenues, LOE and taxes are zeroed thereafter,
 * prices and capex are not. No look-ahead, no P&A cash flow.
 */

import type { MonthIndex } from "./months";
import type { NglFactors } from "./ngl";
import { buildIndexPriceSeries } from "./pricing";
import { getTypeCurve } from "./typecurve";
import type { GlobalAssumptions, PreparedSlot, PriceDeck, TypeCurveLibrary } from "./types";

export const GALLONS_PER_BARREL = 42.0;
export const MCF_PER_BOE = 6.0;

export interface WellMonth {
  period: number; // 0 = spud/capex month; 1..N = curve months
  month: MonthIndex;
  indexOilPrice: number;
  indexGasPrice: number;
  /** Type-curve volumes after TC risk and lateral scaling (raw gas). */
  baseOilScaled: number;
  baseGasScaled: number;
  grossOilProduction: number; // bbl, 8/8ths
  grossGasProduction: number; // Mcf residue (post-shrink), 8/8ths
  grossNglProduction: number; // bbl theoretical yield (pre-recovery), 8/8ths
  monthlyProductionBoe: number;
  oilRoyaltyVolumes: number;
  gasRoyaltyVolumes: number;
  nglRoyaltyVolumes: number;
  equityOilProduction: number;
  equityGasProduction: number;
  equityNglProduction: number;
  localOilPrice: number;
  localGasPrice: number;
  localNglPrice: number;
  oilRevenue: number;
  gasRevenue: number;
  nglRevenue: number;
  totalRevenue: number;
  variableLoe: number; // negative
  fixedLoeMonthly: number; // negative
  totalLoe: number; // negative
  adValoremTax: number; // negative
  oilSeveranceTax: number; // negative
  gasSeveranceTax: number; // negative
  tax: number; // negative
  capex: number; // negative, period 0 only
  preShutInOperatingCf: number;
  economicLimitReached: boolean;
  wellShutIn: boolean;
  operatingCf: number;
  cashFlow: number;
}

export interface WellFrame {
  rows: WellMonth[];
  spudMonth: MonthIndex;
  productionStartMonth: MonthIndex;
  curveLength: number;
  /** First shut-in period, or null when the economic limit is never reached. */
  shutInPeriod: number | null;
  /** Last period with production (curve end or the month before shut-in). */
  terminalPeriod: number;
  /** Month of the last producing period; equals the capex month when nothing produces. */
  terminalMonth: MonthIndex;
}

export function runSingleWell(
  slot: PreparedSlot,
  lib: TypeCurveLibrary,
  g: GlobalAssumptions,
  ngl: NglFactors,
  deck: PriceDeck | null,
): WellFrame {
  const tc = getTypeCurve(lib, slot.tcName);
  const lateralLength = slot.lateralLength;
  const spudMonth = slot.spudMonth;
  const productionStart = spudMonth + slot.flowbackDelay;
  const nri = slot.netRevenueInterest;
  const shrink = ngl.shrink;
  const nglPctOfWti = ngl.nglPctOfWti;
  const llScale = lateralLength / tc.baseLateral;

  const n = tc.months.length;
  const periods = tc.months; // 1..n
  const months: MonthIndex[] = periods.map((p) => productionStart + (p - 1));

  const prices = buildIndexPriceSeries(months, g, deck);
  const period0Price = buildIndexPriceSeries([spudMonth], g, deck)[0];

  const rows: WellMonth[] = [];

  // Period 0 row (spud month).
  rows.push(zeroRow(0, spudMonth, period0Price.indexOilPrice, period0Price.indexGasPrice, slot, nglPctOfWti));
  rows[0].capex = -(slot.dcCosts * lateralLength);

  for (let i = 0; i < n; i++) {
    const idxOil = prices[i].indexOilPrice;
    const idxGas = prices[i].indexGasPrice;

    const baseOilScaled = tc.oil[i] * slot.tcRisk * llScale;
    const baseGasScaled = tc.gas[i] * slot.tcRisk * llScale;

    const grossOil = baseOilScaled;
    const grossGas = baseGasScaled * (1.0 - shrink);
    const grossNgl = (baseGasScaled * slot.nglYield) / GALLONS_PER_BARREL;
    const boe = grossOil + grossNgl + grossGas / MCF_PER_BOE;

    const oilRoy = grossOil * (1.0 - nri);
    const gasRoy = grossGas * (1.0 - nri);
    const nglRoy = grossNgl * (1.0 - nri);
    const eqOil = grossOil - oilRoy;
    const eqGas = grossGas - gasRoy;
    const eqNgl = grossNgl - nglRoy;

    const localOil = idxOil + slot.oilDiff;
    const localGas = idxGas + slot.gasDiff;
    const localNgl = idxOil * nglPctOfWti;

    const oilRev = localOil * eqOil;
    const gasRev = localGas * eqGas;
    const nglRev = localNgl * eqNgl;
    const totalRev = oilRev + gasRev + nglRev;

    const variableLoe = -(grossOil * slot.oilOpexBbl + grossGas * slot.gasOpexMcf + grossNgl * slot.nglOpex);
    const fixedLoeMonthly = -slot.fixedLoe;
    const totalLoe = variableLoe + fixedLoeMonthly;

    const adVal = -(g.adValTax * totalRev);
    let oilSev: number;
    let gasSev: number;
    if (g.useSevTaxPct) {
      oilSev = -(g.oilSevTax * oilRev);
      gasSev = -(g.gasSevTax * gasRev);
    } else {
      oilSev = -(g.oilSevTax * eqOil);
      gasSev = -(g.gasSevTax * (eqGas / (1.0 - shrink)));
    }
    const tax = adVal + oilSev + gasSev;

    rows.push({
      period: periods[i], month: months[i], indexOilPrice: idxOil, indexGasPrice: idxGas,
      baseOilScaled, baseGasScaled, grossOilProduction: grossOil, grossGasProduction: grossGas, grossNglProduction: grossNgl,
      monthlyProductionBoe: boe, oilRoyaltyVolumes: oilRoy, gasRoyaltyVolumes: gasRoy, nglRoyaltyVolumes: nglRoy,
      equityOilProduction: eqOil, equityGasProduction: eqGas, equityNglProduction: eqNgl,
      localOilPrice: localOil, localGasPrice: localGas, localNglPrice: localNgl,
      oilRevenue: oilRev, gasRevenue: gasRev, nglRevenue: nglRev, totalRevenue: totalRev,
      variableLoe, fixedLoeMonthly, totalLoe, adValoremTax: adVal, oilSeveranceTax: oilSev, gasSeveranceTax: gasSev, tax,
      capex: 0.0, preShutInOperatingCf: 0.0, economicLimitReached: false, wellShutIn: false, operatingCf: 0.0, cashFlow: 0.0,
    });
  }

  // Economic limit: evaluated on the unmodified operating cash flow, permanent once reached.
  let shutIn = false;
  let shutInPeriod: number | null = null;
  for (const r of rows) {
    r.preShutInOperatingCf = r.totalRevenue + r.totalLoe + r.tax;
    r.economicLimitReached = r.period > 0 && r.preShutInOperatingCf < 0.0;
    if (r.economicLimitReached && !shutIn) { shutIn = true; shutInPeriod = r.period; }
    r.wellShutIn = shutIn;
    if (r.wellShutIn) zeroFlows(r);
    r.operatingCf = r.totalRevenue + r.totalLoe + r.tax;
    r.cashFlow = r.operatingCf + r.capex;
  }

  const terminalPeriod = shutInPeriod === null ? n : shutInPeriod - 1;
  const terminalMonth = terminalPeriod === 0 ? spudMonth : productionStart + (terminalPeriod - 1);
  return { rows, spudMonth, productionStartMonth: productionStart, curveLength: n, shutInPeriod, terminalPeriod, terminalMonth };
}

function zeroRow(period: number, month: MonthIndex, idxOil: number, idxGas: number, slot: PreparedSlot, nglPct: number): WellMonth {
  return {
    period, month, indexOilPrice: idxOil, indexGasPrice: idxGas,
    baseOilScaled: 0, baseGasScaled: 0, grossOilProduction: 0, grossGasProduction: 0, grossNglProduction: 0, monthlyProductionBoe: 0,
    oilRoyaltyVolumes: 0, gasRoyaltyVolumes: 0, nglRoyaltyVolumes: 0, equityOilProduction: 0, equityGasProduction: 0, equityNglProduction: 0,
    localOilPrice: idxOil + slot.oilDiff, localGasPrice: idxGas + slot.gasDiff, localNglPrice: idxOil * nglPct,
    oilRevenue: 0, gasRevenue: 0, nglRevenue: 0, totalRevenue: 0, variableLoe: 0, fixedLoeMonthly: 0, totalLoe: 0,
    adValoremTax: 0, oilSeveranceTax: 0, gasSeveranceTax: 0, tax: 0, capex: 0, preShutInOperatingCf: 0,
    economicLimitReached: false, wellShutIn: false, operatingCf: 0, cashFlow: 0,
  };
}

function zeroFlows(r: WellMonth) {
  r.baseOilScaled = 0; r.baseGasScaled = 0;
  r.grossOilProduction = 0; r.grossGasProduction = 0; r.grossNglProduction = 0; r.monthlyProductionBoe = 0;
  r.oilRoyaltyVolumes = 0; r.gasRoyaltyVolumes = 0; r.nglRoyaltyVolumes = 0;
  r.equityOilProduction = 0; r.equityGasProduction = 0; r.equityNglProduction = 0;
  r.oilRevenue = 0; r.gasRevenue = 0; r.nglRevenue = 0; r.totalRevenue = 0;
  r.variableLoe = 0; r.fixedLoeMonthly = 0; r.totalLoe = 0;
  r.adValoremTax = 0; r.oilSeveranceTax = 0; r.gasSeveranceTax = 0; r.tax = 0;
}
