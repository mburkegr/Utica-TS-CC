import { compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs, type CaseReport, type Frame } from "./harness";
import { prepareDealSettings, prepareGlobalAssumptions, prepareSlotInputs } from "../engine/prepare";
import { calcNglFactors } from "../engine/ngl";
import { calcSlotOwnership } from "../engine/ownership";
import { runSingleWell } from "../engine/well";
import { applyOwnershipLayers } from "../engine/layers";
import { deck, lib, slotFrameToPython } from "./adapters";

const reports: CaseReport[] = [];
for (const c of goldenCases()) {
  const L0 = loadJson(c, "L00_inputs.json");
  const di = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const g = prepareGlobalAssumptions(di); const ds = prepareDealSettings(di);
  const prepared = prepareSlotInputs(toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame), di);
  const L5 = loadJson(c, "L05_slot_financials_pre_alignment.json");
  for (const p of prepared) {
    const f = L5[String(p.slotId)] as Frame;
    const own = calcSlotOwnership(p, ds); const ngl = calcNglFactors(p, g);
    const sf = applyOwnershipLayers(p, own, ngl, runSingleWell(p, lib, g, ngl, deck), ds);
    reports.push({ caseName: c, unit: `slot_${p.slotId}`, result: compareRecords(slotFrameToPython(sf), frameToRecords(f), f.columns) });
  }
}
const ok = printModuleReport("layers (L05)", reports, [
  "order: Dale initial (x of WI) -> Granite carry from period 1 -> scaling; D&C funded at GR-parties interest; first-well carry covers min(1, grossWells)",
  "slot_promote is always 0 in Python and is emitted only by the test adapter",
  "C06 exercises Dale + carry ordering with 2 gross wells; C07 pooled Dale; C05/C12 carry without Dale",
]);
process.exit(ok ? 0 : 1);
