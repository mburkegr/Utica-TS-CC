import type { DealInputs, SlotInput, PriceDeck } from "../../engine/index";
import { monthToIso, monthIndex } from "../../engine/index";
import type { AppState, ModelInputs, UiState } from "./types";
import { STATE_SCHEMA_VERSION } from "./types";

/** UI-only date helpers (the engine never reads the clock). */
export function nextMonthStartIso(today = new Date()): string {
  const y = today.getFullYear(), m = today.getMonth() + 1;
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
export function defaultFlatStartIso(deck: PriceDeck | null, today = new Date()): string {
  const cur = monthIndex(today.getFullYear(), today.getMonth() + 1);
  let target = cur + 48;
  if (deck) target = Math.min(target, deck.lastMonth + 1);
  return monthToIso(target);
}

export function defaultDeal(deck: PriceDeck | null): DealInputs {
  const flat = defaultFlatStartIso(deck);
  return {
    effectiveDate: nextMonthStartIso(), pricingMode: deck ? "file" : "flat", oilPrice: 70.0, gasPrice: 3.75,
    baseOilPrice: 70.0, baseGasPrice: 3.75, oilFlatStartDate: flat, gasFlatStartDate: flat,
    useDcOverride: false, dcOverride: 750.0, useBidOverride: false, bidOverride: 8000.0, useCarryOverride: false, carryOverridePct: 20.0,
    useSevTaxPct: false, oilSevTax: 0.10, gasSevTax: 0.025, adValTax: 0.025,
    ethaneRec: false,
    content: { ethane: 0.50, propane: 0.25, isobutane: 0.065, butane: 0.065, pentanes: 0.12 },
    recoverEthane: { ethane: 0.90, propane: 0.98, isobutane: 0.99, butane: 0.99, pentanes: 0.995 },
    rejectEthane: { ethane: 0.20, propane: 0.90, isobutane: 0.98, butane: 0.98, pentanes: 0.995 },
    nglShrink: { ethane: 0.06634, propane: 0.091563, isobutane: 0.09963, butane: 0.103744, pentanes: 0.10968 },
    nglPrices: { ethane: 0.23450, propane: 0.82528, isobutane: 0.76020, butane: 0.61473, pentanes: 1.28987 },
    daleInitialInterestPct: 6.25, promoteEnabled: false, promoteWiReversionPct: 6.25, promoteMultiple: 1.00,
  };
}

/** Percent-mode severance defaults, kept separately so toggling never loses the other mode's values. */
export const PCT_MODE_SEV_DEFAULTS = { oil: 0.0, gas: 0.0 };
export const UNIT_MODE_SEV_DEFAULTS = { oil: 0.10, gas: 0.025 };

export function defaultSlot(slotId: number, spud: string): SlotInput {
  return {
    slotId, tcName: "", grossWells: 1.0, netAcres: 25.0, unitAcres: 200.0, useCalcUnitAcres: false, pctUnitized: 1.0,
    drillingSpudMonth: spud, flowbackDelay: 4, netRevenueInterest: 0.80, lateralLength: 15000, dcCosts: 750.0, tcRisk: 1.00,
    bidPerAcre: 8000.0, oilDiff: -10.00, gasDiff: -2.75, oilOpexBbl: 1.78, gasOpexMcf: 0.25, nglOpex: 2.50, fixedLoe: 3534.0, nglYield: 4.2,
    dalePromote: false, daleUnitId: `UNIT-${slotId}`, dalePayoutGroup: `UNIT-${slotId}`, daleFirstWellCarry: false,
    carryEnabled: false, carryWiReversionPct: 0.0,
  };
}

export function defaultInputs(deck: PriceDeck | null, slotCount = 2): ModelInputs {
  const spud = nextMonthStartIso();
  return { deal: defaultDeal(deck), slots: Array.from({ length: slotCount }, (_, i) => defaultSlot(i + 1, spud)) };
}

export function defaultUi(): UiState {
  return { tab: "development", includeSlot: {}, opportunityName: "", chartWindow: "10Y", useTcRiskAsMain: false, useDcPctSteps: false,
    carryStartPct: 10.0, carryStepPct: 5.0, bidStart: null, bidStep: 500.0, productionView: "stacked" };
}

export function initialState(deck: PriceDeck | null): AppState {
  return { schemaVersion: STATE_SCHEMA_VERSION, inputs: defaultInputs(deck), ui: defaultUi(),
    results: { signature: null, base: null, standalone: null, grids: {}, scenario: null, error: null, validation: [] } };
}
