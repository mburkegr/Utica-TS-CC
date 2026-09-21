import { compareRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs, type CaseReport, type Frame } from "./harness";
import { prepareDealSettings, prepareSlotInputs } from "../engine/prepare";
import { calcSlotOwnership } from "../engine/ownership";

const reports: CaseReport[] = [];
const COLS = ["bid_price_final", "unit_acres_final", "working_interest", "net_wells_calc", "acquisition_cost"];
for (const c of goldenCases()) {
  const L0 = loadJson(c, "L00_inputs.json");
  const dealInputs = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const ds = prepareDealSettings(dealInputs);
  const prepared = prepareSlotInputs(toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame), dealInputs);
  const L1 = loadJson(c, "L01_slot_metrics.json");
  for (const p of prepared) {
    const o = calcSlotOwnership(p, ds);
    const actual = { bid_price_final: o.bidPriceFinal, unit_acres_final: o.unitAcresFinal, working_interest: o.workingInterest, net_wells_calc: o.netWells, acquisition_cost: o.acquisitionCost };
    reports.push({ caseName: c, unit: `slot_${p.slotId}`, result: compareRecords([actual], [L1[String(p.slotId)]], COLS) });
  }
}
const ok = printModuleReport("ownership (L01)", reports, [
  "acquisition_cost = netAcres x bidPriceFinal only; the Python allocation branch for the deal-level acquisition override is not implemented (override removed by decision; all fixtures have it off)",
  "C03 exercises calc-unit-acres (480), pctUnitized 0.90 and 2 gross wells; C12 exercises the deal-level bid override",
]);
process.exit(ok ? 0 : 1);
