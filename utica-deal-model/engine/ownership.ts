/**
 * Ownership. Mirrors model.calc_slot_metrics.
 *
 * Rules (preserved):
 *  - bid floor $1/acre (deal override wins when enabled);
 *  - calculated unit acres = grossWells x lateralLength / 50;
 *  - WI = netAcres / unitAcres x pctUnitized (0 when unit acres are 0);
 *  - net wells = WI x grossWells;
 *  - acquisition = netAcres x bid; unitization and Dale interests do not
 *    reduce it. The deal-level acquisition-cost override was removed by
 *    decision; there is no allocation path.
 */

import type { DealSettings, PreparedSlot } from "./types";

export const LATERAL_FT_PER_UNIT_ACRE = 50.0;

export interface SlotOwnership {
  bidPriceFinal: number;
  unitAcresFinal: number;
  workingInterest: number;
  netWells: number;
  acquisitionCost: number;
}

export function calcSlotOwnership(slot: PreparedSlot, settings: DealSettings): SlotOwnership {
  const bidPriceFinal = settings.useBidOverride
    ? Math.max(1.0, settings.bidOverride)
    : Math.max(1.0, slot.bidPerAcre);

  const unitAcresFinal = slot.useCalcUnitAcres
    ? (slot.grossWells * slot.lateralLength) / LATERAL_FT_PER_UNIT_ACRE
    : slot.unitAcres;

  const workingInterest = unitAcresFinal === 0 ? 0.0 : (slot.netAcres / unitAcresFinal) * slot.pctUnitized;
  const netWells = workingInterest * slot.grossWells;
  const acquisitionCost = slot.netAcres * bidPriceFinal;

  return { bidPriceFinal, unitAcresFinal, workingInterest, netWells, acquisitionCost };
}
