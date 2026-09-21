/**
 * Deal orchestration. Mirrors model.run_deal_model / run_deal_metrics and
 * app.run_individual_slot_returns. Pure functions of (slots, dealInputs, data).
 */

import { buildDealCalendar, type CalendarOptions, type DealCalendar } from "./calendar";
import { applyOwnershipLayers, type SlotFrame } from "./layers";
import { calcNglFactors, type NglFactors } from "./ngl";
import { calcSlotOwnership, type SlotOwnership } from "./ownership";
import { prepareDealSettings, prepareGlobalAssumptions, prepareSlotInputs } from "./prepare";
import { applyPromote, type PromoteResult } from "./promote";
import { moic, payback, xirr, type Payback } from "./returns";
import { rollUpDeal, type DealRollup } from "./rollup";
import type { DealInputs, DealSettings, GlobalAssumptions, PreparedSlot, PriceDeck, SlotInput, TypeCurveLibrary } from "./types";
import { runSingleWell, type WellFrame } from "./well";

export interface EngineData {
  typeCurves: TypeCurveLibrary;
  priceDeck: PriceDeck | null;
}

export interface DealRunOptions extends CalendarOptions {}

export interface SlotResult {
  prepared: PreparedSlot;
  ownership: SlotOwnership;
  ngl: NglFactors;
  well: WellFrame;
  layered: SlotFrame;
}

export interface DealResult {
  settings: DealSettings;
  globals: GlobalAssumptions;
  slots: SlotResult[];
  calendar: DealCalendar;
  promote: PromoteResult;
  deal: DealRollup;
  irr: number | null;
  moic: number | null;
  payback: Payback;
}

export function runDeal(slots: SlotInput[], inputs: DealInputs, data: EngineData, opts: DealRunOptions = {}): DealResult {
  const settings = prepareDealSettings(inputs);
  const globals = prepareGlobalAssumptions(inputs);
  const prepared = prepareSlotInputs(slots, inputs);
  const slotResults: SlotResult[] = prepared.map((p) => {
    const ownership = calcSlotOwnership(p, settings);
    const ngl = calcNglFactors(p, globals);
    const well = runSingleWell(p, data.typeCurves, globals, ngl, data.priceDeck);
    const layered = applyOwnershipLayers(p, ownership, ngl, well, settings);
    return { prepared: p, ownership, ngl, well, layered };
  });
  const calendar = buildDealCalendar(slotResults.map((s) => s.layered), settings, globals, data.priceDeck, opts);
  const promote = applyPromote(calendar, settings);
  const deal = rollUpDeal(calendar, promote);
  const months = deal.rows.map((r) => r.month);
  const cfs = deal.rows.map((r) => r.slotTotalCashFlow);
  return {
    settings, globals, slots: slotResults, calendar, promote, deal,
    irr: xirr(months, cfs), moic: moic(cfs), payback: payback(months, cfs),
  };
}

export function runDealMetrics(slots: SlotInput[], inputs: DealInputs, data: EngineData, opts: DealRunOptions = {}): { irr: number | null; moic: number | null } {
  const r = runDeal(slots, inputs, data, opts);
  return { irr: r.irr, moic: r.moic };
}

/** Standalone slot economics: each slot run as its own deal with the same deal inputs. */
export function runStandaloneSlotReturns(slots: SlotInput[], inputs: DealInputs, data: EngineData, opts: DealRunOptions = {}): Record<number, { irr: number | null; moic: number | null }> {
  const out: Record<number, { irr: number | null; moic: number | null }> = {};
  for (const s of slots) {
    try { out[s.slotId] = runDealMetrics([s], inputs, data, opts); }
    catch { out[s.slotId] = { irr: null, moic: null }; }
  }
  return out;
}
