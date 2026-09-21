/**
 * NGL factors. Mirrors model.build_slot_ngl_factors.
 *
 * Methodology (preserved by decision):
 *  - the NGL basket price is expressed as a fixed fraction of WTI, calibrated
 *    against a long-term $70 WTI base; the fraction then rides the monthly
 *    index oil price. The $70 is a calibration constant, not the price deck;
 *  - there is no NGL differential;
 *  - NGL volume is theoretical yield (raw gas x GPM / 42); recovery losses are
 *    embedded in the recovery-weighted basket price, not in the volume.
 */

import { NGL_COMPONENTS, type GlobalAssumptions, type NglComponent, type NglComponents, type PreparedSlot } from "./types";

/** Long-term WTI base used to calibrate the NGL basket as a percent of WTI. */
export const NGL_WTI_CALIBRATION_BASE = 70.0;
export const GALLONS_PER_BARREL = 42.0;

export interface NglComponentDetail {
  component: NglComponent;
  contentPct: number;
  impliedNglContent: number; // GPM of this component
  recoveryPct: number;
  salesVolumeFactor: number; // GPM recovered
  shrinkFactor: number;
  shrinkContribution: number;
  componentPrice: number; // $/gal
}

export interface NglFactors {
  profileName: string;
  recoveryCase: "recover" | "reject";
  recoveries: NglComponents;
  detail: NglComponentDetail[];
  /** Fraction of raw gas volume removed as liquids. Residue gas = raw x (1 - shrink). */
  shrink: number;
  /** $/gal, recovery-weighted over total theoretical gallons. */
  aggregateNglPrice: number;
  /** Realized NGL $/bbl divided by WTI, calibrated at NGL_WTI_CALIBRATION_BASE. */
  nglPctOfWti: number;
}

/**
 * Component assumptions come from the slot's resolved NGL set (its assigned
 * profile or the deal default); the ethane recover/reject switch stays at the
 * deal level. A slot on the default profile reproduces the deal-level Python
 * methodology exactly.
 */
export function calcNglFactors(slot: Pick<PreparedSlot, "nglYield" | "ngl">, g: GlobalAssumptions): NglFactors {
  const nglYield = slot.nglYield;
  const set = slot.ngl;
  const recoveries = g.ethaneRec === 1 ? set.recoverEthane : set.rejectEthane;
  const recoveryCase = g.ethaneRec === 1 ? "recover" : "reject";

  const detail: NglComponentDetail[] = [];
  for (const component of NGL_COMPONENTS) {
    const contentPct = set.content[component];
    const impliedNglContent = contentPct * nglYield;
    const recoveryPct = recoveries[component];
    const salesVolumeFactor = impliedNglContent * recoveryPct;
    const shrinkFactor = set.nglShrink[component];
    const shrinkContribution = salesVolumeFactor * shrinkFactor;
    const componentPrice = set.nglPrices[component];
    detail.push({ component, contentPct, impliedNglContent, recoveryPct, salesVolumeFactor, shrinkFactor, shrinkContribution, componentPrice });
  }

  // Sums in the same (component) order as the pandas column sums.
  let shrink = 0.0;
  let aggregateNglPrice = 0.0;
  for (const d of detail) {
    shrink += d.shrinkContribution;
    aggregateNglPrice += d.recoveryPct * d.contentPct * d.componentPrice;
  }
  const nglPctOfWti = (aggregateNglPrice * GALLONS_PER_BARREL) / NGL_WTI_CALIBRATION_BASE;

  return { profileName: set.profileName, recoveryCase, recoveries, detail, shrink, aggregateNglPrice, nglPctOfWti };
}
