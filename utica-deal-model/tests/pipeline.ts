// Shared: build the engine pipeline for a fixture case up to the aligned calendar.
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";
import { prepareDealSettings, prepareGlobalAssumptions, prepareSlotInputs } from "../engine/prepare";
import { calcNglFactors } from "../engine/ngl";
import { calcSlotOwnership } from "../engine/ownership";
import { runSingleWell } from "../engine/well";
import { applyOwnershipLayers } from "../engine/layers";
import { buildDealCalendar, type CalendarOptions } from "../engine/calendar";
import { deck, lib } from "./adapters";

export function buildCase(c: string, opts: CalendarOptions = {}) {
  const L0 = loadJson(c, "L00_inputs.json");
  const di = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const g = prepareGlobalAssumptions(di); const ds = prepareDealSettings(di);
  const prepared = prepareSlotInputs(toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame), di);
  const slotFrames = prepared.map((p) => {
    const ngl = calcNglFactors(p, g);
    return applyOwnershipLayers(p, calcSlotOwnership(p, ds), ngl, runSingleWell(p, lib, g, ngl, deck), ds);
  });
  const cal = buildDealCalendar(slotFrames, ds, g, deck, opts);
  return { di, g, ds, prepared, slotFrames, cal };
}
