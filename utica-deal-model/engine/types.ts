/**
 * Engine types. No UI concepts here. Percent conventions follow the Python
 * app: fields documented as "whole percent" (6.25 = 6.25%) are converted to
 * decimals by prepare.ts; everything else is already a decimal.
 */

import type { MonthIndex } from "./months";

// ---------------------------------------------------------------------------
// Data contracts (loaded from JSON exported from the workbooks)
// ---------------------------------------------------------------------------
export interface TypeCurve {
  /** Normalized key: trim, lower-case, spaces -> underscores. */
  name: string;
  rawName: string;
  baseLateral: number;
  /** Curve months, contiguous, starting at 1. */
  months: number[];
  /** bbl/month, gross 8/8ths, one well at baseLateral. */
  oil: number[];
  /** Mcf/month raw wellhead gas (pre-shrink), gross 8/8ths, one well at baseLateral. */
  gas: number[];
}
export type TypeCurveLibrary = Map<string, TypeCurve>;

export interface PriceDeckRow {
  month: MonthIndex;
  oilPrice: number;
  gasPrice: number;
}
export interface PriceDeck {
  rows: PriceDeckRow[]; // sorted, contiguous
  firstMonth: MonthIndex;
  lastMonth: MonthIndex;
}

// ---------------------------------------------------------------------------
// App-level inputs (what the UI collects; mirrors app.py deal_inputs)
// ---------------------------------------------------------------------------
export type PricingMode = "flat" | "file";

export interface DealInputs {
  effectiveDate: string; // ISO date
  pricingMode: PricingMode;
  /** Flat price in flat mode; terminal flat price in file mode. $/bbl, $/Mcf. */
  oilPrice: number;
  gasPrice: number;
  /** Base-case prices retained during sensitivities (defaults to oil/gas price). */
  baseOilPrice?: number;
  baseGasPrice?: number;
  /** File mode: month from which the flat price applies (per commodity). Ignored in flat mode. */
  oilFlatStartDate?: string;
  gasFlatStartDate?: string;

  useDcOverride: boolean;
  dcOverride: number; // $/ft
  useBidOverride: boolean;
  bidOverride: number; // $/acre
  useCarryOverride: boolean;
  carryOverridePct: number; // whole percent

  useSevTaxPct: boolean;
  /** perUnit mode: $/bbl and $/Mcf. pct mode: whole percents of net oil/gas revenue. */
  oilSevTax: number;
  gasSevTax: number;
  adValTax: number; // decimal share of total net revenue

  ethaneRec: boolean;
  content: NglComponents;
  recoverEthane: NglComponents;
  rejectEthane: NglComponents;
  nglShrink: NglComponents;
  nglPrices: NglComponents; // $/gal
  /** Additional named profiles a slot may point at via SlotInput.nglProfileId. */
  nglProfiles?: NglProfile[];

  daleInitialInterestPct: number; // whole percent
  promoteEnabled: boolean; // set from slot flags before the run
  promoteWiReversionPct: number; // whole percent
  promoteMultiple: number;

  /** Sensitivity-only toggles (do not affect the base case). */
  useTcRiskAsMainSensitivity?: boolean;
  useDcPctSensitivity?: boolean;
}

export const NGL_COMPONENTS = ["ethane", "propane", "isobutane", "butane", "pentanes"] as const;

/** A named NGL component profile (content split, recovery tables, shrink factors, $/gal prices). */
export interface NglProfile {
  id: string;
  name: string;
  content: NglComponents;
  recoverEthane: NglComponents;
  rejectEthane: NglComponents;
  nglShrink: NglComponents;
  nglPrices: NglComponents;
}

/** Component assumptions resolved for one slot (profile or deal default). */
export interface NglComponentSet {
  profileId: string | null; // null = deal default
  profileName: string;
  content: NglComponents;
  recoverEthane: NglComponents;
  rejectEthane: NglComponents;
  nglShrink: NglComponents;
  nglPrices: NglComponents;
}
export type NglComponent = (typeof NGL_COMPONENTS)[number];
export type NglComponents = Record<NglComponent, number>;

export interface SlotInput {
  slotId: number;
  tcName: string;
  grossWells: number;
  netAcres: number;
  unitAcres: number;
  useCalcUnitAcres: boolean;
  pctUnitized: number; // decimal
  drillingSpudMonth: string; // ISO date
  flowbackDelay: number; // integer months, 0 allowed
  netRevenueInterest: number; // decimal
  lateralLength: number; // ft
  dcCosts: number; // $/ft
  tcRisk: number; // decimal multiplier
  bidPerAcre: number; // $/acre
  oilDiff: number; // $/bbl additive
  gasDiff: number; // $/Mcf additive, includes GP&T, applied to residue gas
  oilOpexBbl: number;
  gasOpexMcf: number; // per residue Mcf
  nglOpex: number; // per theoretical NGL bbl
  fixedLoe: number; // $/well/month
  nglYield: number; // GPM on raw gas
  /** Optional NGL profile id; undefined or null uses the deal default profile. */
  nglProfileId?: string | null;

  dalePromote: boolean;
  daleUnitId: string;
  dalePayoutGroup: string;
  daleFirstWellCarry: boolean;
  carryEnabled: boolean;
  /** Whole percent of our post-Dale WI given to the carried party (any party) in exchange for funding 100% of D&C. */
  carryWiReversionPct: number; // whole percent
}

// ---------------------------------------------------------------------------
// Prepared inputs (output of prepare.ts; mirrors model.prepare_* outputs)
// ---------------------------------------------------------------------------
export interface DealSettings {
  effectiveDate: MonthIndex;
  useBidOverride: boolean;
  bidOverride: number;
  promoteEnabled: boolean;
  daleInitialInterestPct: number; // decimal
  promoteWiReversionPct: number; // decimal, 0 when promote disabled
  promoteMultiple: number; // 0 when promote disabled
}

export interface GlobalAssumptions {
  pricingMode: PricingMode;
  oilPrice: number;
  gasPrice: number;
  baseOilPrice: number;
  baseGasPrice: number;
  oilFlatStartDate: MonthIndex;
  gasFlatStartDate: MonthIndex;
  useSevTaxPct: boolean;
  oilSevTax: number; // decimal in pct mode, $/bbl in per-unit mode
  gasSevTax: number;
  adValTax: number;
  ethaneRec: 0 | 1;
  contentPercentages: NglComponents;
  recoverEthanePercentages: NglComponents;
  rejectEthanePercentages: NglComponents;
  nglPrices: NglComponents;
  nglShrinkFactors: NglComponents;
}

export interface PreparedSlot {
  slotId: number;
  tcName: string; // as entered (normalized at lookup time, like Python)
  grossWells: number;
  netAcres: number;
  unitAcres: number;
  useCalcUnitAcres: boolean;
  pctUnitized: number;
  spudMonth: MonthIndex;
  flowbackDelay: number;
  netRevenueInterest: number;
  lateralLength: number;
  dcCosts: number;
  tcRisk: number;
  bidPerAcre: number;
  oilDiff: number;
  gasDiff: number;
  oilOpexBbl: number;
  gasOpexMcf: number;
  nglOpex: number;
  fixedLoe: number;
  nglYield: number;
  ngl: NglComponentSet;
  dalePromote: boolean;
  daleUnitId: string;
  dalePayoutGroup: string;
  daleFirstWellCarry: boolean;
  carryEnabled: boolean;
  carryWiReversionPct: number; // decimal
}
