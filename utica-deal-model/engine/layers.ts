/**
 * Ownership layers. Mirrors model.build_slot_financials.
 *
 * Order (preserved): Dale initial interest is deducted from the original WI
 * first, then the Granite carry reduces USEDC's production ownership from
 * period 1 on, while D&C is funded at the full GR-parties interest. All
 * interests are multiplicative on WI (6.25% of WI, not 6.25 WI points).
 */

import type { MonthIndex } from "./months";
import type { NglFactors } from "./ngl";
import type { SlotOwnership } from "./ownership";
import type { DealSettings, PreparedSlot } from "./types";
import type { WellFrame, WellMonth } from "./well";

const clip01 = (x: number) => Math.min(1.0, Math.max(0.0, x));

/** Slot-level constants shared by every month of the slot. */
export interface SlotLayerConstants {
  slotId: number;
  tcName: string;
  grossWells: number;
  /** Original WI before Dale or carry (calc_slot_metrics working_interest). */
  preDaleWorkingInterest: number;
  netWells: number; // original WI x gross wells
  acquisitionCost: number;
  bidPriceFinal: number;
  nglRecoveryCase: "recover" | "reject";
  slotShrink: number;
  slotNglPctOfWti: number;
  leaseNri: number;

  dalePromote: boolean;
  daleUnitId: string;
  dalePayoutGroup: string;
  daleFirstWellCarry: boolean;
  daleInitialInterestPct: number;
  daleInitialWorkingInterest: number;
  grPartiesWorkingInterest: number; // post-initial-Dale
  grPartiesNetWells: number;
  daleFirstWellCarryWells: number;
  daleCarryDncNetWells: number;
  fundedDncNetWells: number;

  carryEnabled: boolean;
  carryWiReversionPct: number;
  preCarryWorkingInterest: number;
  postCarryWorkingInterest: number;
  preCarryEffectiveNri: number;
  postCarryEffectiveNri: number;
  preCarryNetWells: number;
  postCarryNetWells: number;
}

export interface SlotMonth {
  period: number;
  month: MonthIndex;
  well: WellMonth; // the single-well row this month scales
  carryReversionActive: boolean;
  ownershipFactor: number;
  effectiveWorkingInterest: number;
  effectiveNetWells: number;

  slotGrossOilProduction: number;
  slotGrossGasProduction: number;
  slotGrossNglProduction: number;
  slotGrossBoe: number;
  slotNetOilProduction: number;
  slotNetGasProduction: number;
  slotNetNglProduction: number;
  slotNetBoe: number;
  slotOilRevenue: number;
  slotGasRevenue: number;
  slotNglRevenue: number;
  slotTotalRevenue: number;
  slotLoe: number;
  slotTax: number;
  slotOperatingProfit: number;
  /** Dale payout OCF: full GR-parties interest, before the carry split. */
  slotPromoteOcf: number;
  slotBaseCapex: number;
  slotDaleCarryCapex: number;
  slotCapex: number;
  slotPudCashFlow: number;
  slotAssetPurchase: number; // set by the calendar module (effective month)
  slotTotalCashFlow: number;
}

export interface SlotFrame {
  constants: SlotLayerConstants;
  rows: SlotMonth[];
  well: WellFrame;
}

export function applyOwnershipLayers(
  slot: PreparedSlot,
  ownership: SlotOwnership,
  ngl: NglFactors,
  well: WellFrame,
  settings: DealSettings,
): SlotFrame {
  const grossWells = slot.grossWells;
  const baseWi = ownership.workingInterest;
  const baseNetWells = ownership.netWells;
  const leaseNri = slot.netRevenueInterest;

  const carryEnabled = slot.carryEnabled;
  const carryPct = clip01(carryEnabled ? slot.carryWiReversionPct : 0.0);
  const postCarryFactor = 1.0 - carryPct;

  const daleInitialPct = clip01(settings.daleInitialInterestPct);
  const daleInitialWi = slot.dalePromote ? baseWi * daleInitialPct : 0.0;
  const grWi = Math.max(0.0, baseWi - daleInitialWi);
  const grNetWells = grWi * grossWells;

  const daleFirstWellCarryWells =
    slot.dalePromote && slot.daleFirstWellCarry ? Math.min(1.0, Math.max(0.0, grossWells)) : 0.0;
  const daleCarryDncNetWells = daleInitialWi * daleFirstWellCarryWells;
  const fundedDncNetWells = grNetWells + daleCarryDncNetWells;

  const constants: SlotLayerConstants = {
    slotId: slot.slotId, tcName: slot.tcName, grossWells,
    preDaleWorkingInterest: baseWi, netWells: baseNetWells,
    acquisitionCost: ownership.acquisitionCost, bidPriceFinal: ownership.bidPriceFinal,
    nglRecoveryCase: ngl.recoveryCase, slotShrink: ngl.shrink, slotNglPctOfWti: ngl.nglPctOfWti, leaseNri,
    dalePromote: slot.dalePromote, daleUnitId: slot.daleUnitId, dalePayoutGroup: slot.dalePayoutGroup,
    daleFirstWellCarry: slot.daleFirstWellCarry, daleInitialInterestPct: daleInitialPct,
    daleInitialWorkingInterest: daleInitialWi, grPartiesWorkingInterest: grWi, grPartiesNetWells: grNetWells,
    daleFirstWellCarryWells, daleCarryDncNetWells, fundedDncNetWells,
    carryEnabled, carryWiReversionPct: carryPct,
    preCarryWorkingInterest: grWi, postCarryWorkingInterest: grWi * postCarryFactor,
    preCarryEffectiveNri: grWi * leaseNri, postCarryEffectiveNri: grWi * postCarryFactor * leaseNri,
    preCarryNetWells: grNetWells, postCarryNetWells: grNetWells * postCarryFactor,
  };

  const rows: SlotMonth[] = well.rows.map((w) => {
    const active = carryEnabled && w.period > 0;
    const ownershipFactor = active ? postCarryFactor : 1.0;
    const effWi = grWi * ownershipFactor;
    const effNw = grNetWells * ownershipFactor;

    const slotOilRevenue = w.equityOilProduction * w.localOilPrice * effNw;
    const slotGasRevenue = w.equityGasProduction * w.localGasPrice * effNw;
    const slotNglRevenue = w.equityNglProduction * w.localNglPrice * effNw;
    const slotTotalRevenue = slotOilRevenue + slotGasRevenue + slotNglRevenue;
    const slotLoe = w.totalLoe * effNw;
    const slotTax = w.tax * effNw;
    const slotOperatingProfit = slotTotalRevenue + slotLoe + slotTax;
    const slotBaseCapex = w.capex * grNetWells;
    const slotDaleCarryCapex = w.capex * daleCarryDncNetWells;
    const slotCapex = slotBaseCapex + slotDaleCarryCapex;
    const slotPudCashFlow = slotOperatingProfit + slotCapex;

    return {
      period: w.period, month: w.month, well: w,
      carryReversionActive: active, ownershipFactor, effectiveWorkingInterest: effWi, effectiveNetWells: effNw,
      slotGrossOilProduction: w.grossOilProduction * grossWells,
      slotGrossGasProduction: w.grossGasProduction * grossWells,
      slotGrossNglProduction: w.grossNglProduction * grossWells,
      slotGrossBoe: w.monthlyProductionBoe * grossWells,
      slotNetOilProduction: w.equityOilProduction * effNw,
      slotNetGasProduction: w.equityGasProduction * effNw,
      slotNetNglProduction: w.equityNglProduction * effNw,
      slotNetBoe: (w.equityOilProduction + w.equityNglProduction + w.equityGasProduction / 6.0) * effNw,
      slotOilRevenue, slotGasRevenue, slotNglRevenue, slotTotalRevenue, slotLoe, slotTax, slotOperatingProfit,
      slotPromoteOcf: w.operatingCf * grNetWells,
      slotBaseCapex, slotDaleCarryCapex, slotCapex, slotPudCashFlow,
      slotAssetPurchase: 0.0,
      slotTotalCashFlow: slotPudCashFlow + 0.0 + 0.0,
    };
  });

  return { constants, rows, well };
}
