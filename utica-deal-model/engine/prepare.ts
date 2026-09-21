/**
 * Input preparation. Mirrors model.prepare_deal_settings,
 * prepare_global_assumptions and prepare_slot_inputs.
 *
 * Decisions applied:
 *  - acquisition-cost override removed (acquisition = netAcres x bid always);
 *  - flowbackDelay must be an integer >= 0 (0 is valid);
 *  - nglDiff does not exist in the engine.
 */

import { parseMonth } from "./months";
import type {
  DealInputs,
  DealSettings,
  GlobalAssumptions,
  NglComponentSet,
  NglComponents,
  PreparedSlot,
  SlotInput,
} from "./types";

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const num = (x: unknown, dflt = 0): number => {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : dflt;
};

export function prepareDealSettings(d: DealInputs): DealSettings {
  const promoteEnabled = Boolean(d.promoteEnabled);
  const promoteWiReversionPct = clip(num(d.promoteWiReversionPct) / 100.0, 0.0, 1.0);
  const daleInitialInterestPct = clip(num(d.daleInitialInterestPct, 6.25) / 100.0, 0.0, 0.999999);
  return {
    effectiveDate: parseMonth(d.effectiveDate),
    useBidOverride: Boolean(d.useBidOverride),
    bidOverride: Math.max(1.0, num(d.bidOverride, 1.0)),
    promoteEnabled,
    daleInitialInterestPct,
    promoteWiReversionPct: promoteEnabled ? promoteWiReversionPct : 0.0,
    promoteMultiple: promoteEnabled ? num(d.promoteMultiple) : 0.0,
  };
}

function components(c: NglComponents): NglComponents {
  return {
    ethane: num(c.ethane),
    propane: num(c.propane),
    isobutane: num(c.isobutane),
    butane: num(c.butane),
    pentanes: num(c.pentanes),
  };
}

export function prepareGlobalAssumptions(d: DealInputs): GlobalAssumptions {
  const mode = String(d.pricingMode ?? "flat").toLowerCase();
  if (mode !== "flat" && mode !== "file") throw new Error(`Unsupported pricing mode: ${mode}`);
  const useSevTaxPct = Boolean(d.useSevTaxPct);
  return {
    pricingMode: mode,
    oilPrice: num(d.oilPrice),
    gasPrice: num(d.gasPrice),
    baseOilPrice: d.baseOilPrice === undefined ? num(d.oilPrice) : num(d.baseOilPrice),
    baseGasPrice: d.baseGasPrice === undefined ? num(d.gasPrice) : num(d.baseGasPrice),
    // Python default '1900-01-01' means "flat from the beginning of time".
    oilFlatStartDate: parseMonth(d.oilFlatStartDate ?? "1900-01-01"),
    gasFlatStartDate: parseMonth(d.gasFlatStartDate ?? "1900-01-01"),
    useSevTaxPct,
    oilSevTax: useSevTaxPct ? num(d.oilSevTax) / 100.0 : num(d.oilSevTax),
    gasSevTax: useSevTaxPct ? num(d.gasSevTax) / 100.0 : num(d.gasSevTax),
    adValTax: num(d.adValTax),
    ethaneRec: d.ethaneRec ? 1 : 0,
    contentPercentages: components(d.content),
    recoverEthanePercentages: components(d.recoverEthane),
    rejectEthanePercentages: components(d.rejectEthane),
    nglPrices: components(d.nglPrices),
    nglShrinkFactors: components(d.nglShrink),
  };
}

/** Resolve a slot's NGL component set: its named profile if assigned and found, otherwise the deal default. */
export function resolveNglComponents(s: Pick<SlotInput, "nglProfileId" | "slotId">, d: DealInputs): NglComponentSet {
  const id = s.nglProfileId ?? null;
  if (id !== null) {
    const p = (d.nglProfiles ?? []).find((x) => x.id === id);
    if (!p) throw new Error(`Slot ${s.slotId}: NGL profile '${id}' not found`);
    return { profileId: p.id, profileName: p.name, content: components(p.content), recoverEthane: components(p.recoverEthane),
      rejectEthane: components(p.rejectEthane), nglShrink: components(p.nglShrink), nglPrices: components(p.nglPrices) };
  }
  return { profileId: null, profileName: "Default", content: components(d.content), recoverEthane: components(d.recoverEthane),
    rejectEthane: components(d.rejectEthane), nglShrink: components(d.nglShrink), nglPrices: components(d.nglPrices) };
}

export function prepareSlotInputs(slots: SlotInput[], d: DealInputs): PreparedSlot[] {
  return slots.map((s) => {
    const slotId = Math.trunc(num(s.slotId));
    const flowbackDelay = num(s.flowbackDelay, 4);
    if (!Number.isInteger(flowbackDelay) || flowbackDelay < 0) {
      throw new Error(`Slot ${slotId}: flowbackDelay must be an integer >= 0 (got ${s.flowbackDelay})`);
    }
    // Deal-level carry override is applied before the whole-percent conversion (same as Python).
    let carryEnabled = Boolean(s.carryEnabled);
    let carryPct = num(s.carryWiReversionPct);
    if (d.useCarryOverride) {
      carryEnabled = true;
      carryPct = num(d.carryOverridePct);
    }
    const daleUnitId = String(s.daleUnitId ?? "").trim() || `UNIT-${slotId}`;
    const dalePayoutGroup = String(s.dalePayoutGroup ?? "").trim() || daleUnitId;
    return {
      slotId,
      tcName: String(s.tcName),
      grossWells: num(s.grossWells),
      netAcres: num(s.netAcres),
      unitAcres: num(s.unitAcres),
      useCalcUnitAcres: Boolean(s.useCalcUnitAcres),
      pctUnitized: num(s.pctUnitized),
      spudMonth: parseMonth(s.drillingSpudMonth),
      flowbackDelay,
      netRevenueInterest: num(s.netRevenueInterest),
      lateralLength: num(s.lateralLength),
      dcCosts: d.useDcOverride ? num(d.dcOverride) : num(s.dcCosts),
      tcRisk: num(s.tcRisk, 1.0),
      bidPerAcre: d.useBidOverride
        ? Math.max(1.0, num(d.bidOverride, 1.0))
        : Math.max(1.0, num(s.bidPerAcre, 1.0)),
      oilDiff: num(s.oilDiff),
      gasDiff: num(s.gasDiff),
      oilOpexBbl: num(s.oilOpexBbl),
      gasOpexMcf: num(s.gasOpexMcf),
      nglOpex: num(s.nglOpex),
      fixedLoe: num(s.fixedLoe),
      nglYield: num(s.nglYield),
      ngl: resolveNglComponents(s, d),
      dalePromote: Boolean(s.dalePromote),
      daleUnitId,
      dalePayoutGroup,
      daleFirstWellCarry: Boolean(s.daleFirstWellCarry),
      carryEnabled,
      carryWiReversionPct: clip(carryPct, 0.0, 100.0) / 100.0,
    };
  });
}
