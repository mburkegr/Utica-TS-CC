import {
  compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs,
  type CaseReport, type Frame,
} from "./harness";
import { prepareGlobalAssumptions, prepareSlotInputs } from "../engine/prepare";
import { calcNglFactors } from "../engine/ngl";

const reports: CaseReport[] = [];
for (const c of goldenCases()) {
  const L0 = loadJson(c, "L00_inputs.json");
  const dealInputs = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const g = prepareGlobalAssumptions(dealInputs);
  const prepared = prepareSlotInputs(toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame), dealInputs);
  const L2 = loadJson(c, "L02_ngl_factors.json");
  for (const p of prepared) {
    const exp = L2[String(p.slotId)];
    const f = calcNglFactors(p, g);
    // scalars
    const scal = compareRecords(
      [{ recovery_case: f.recoveryCase, shrink: f.shrink, aggregate_ngl_price: f.aggregateNglPrice, ngl_pct_of_wti: f.nglPctOfWti,
         ...Object.fromEntries(Object.entries(f.recoveries).map(([k, v]) => [`recoveries.${k}`, v])) }],
      [{ recovery_case: exp.recovery_case, shrink: exp.shrink, aggregate_ngl_price: exp.aggregate_ngl_price, ngl_pct_of_wti: exp.ngl_pct_of_wti,
         ...Object.fromEntries(Object.entries(exp.recoveries).map(([k, v]) => [`recoveries.${k}`, v])) }],
      ["recovery_case", "shrink", "aggregate_ngl_price", "ngl_pct_of_wti", ...Object.keys(f.recoveries).map((k) => `recoveries.${k}`)],
    );
    reports.push({ caseName: c, unit: `slot_${p.slotId}_scalars`, result: scal });
    // detail table
    const detailFrame = exp.detail_df as Frame;
    const actual = f.detail.map((d) => ({
      component: d.component, content_pct: d.contentPct, implied_ngl_content: d.impliedNglContent, recovery_pct: d.recoveryPct,
      sales_volume_factor: d.salesVolumeFactor, shrink_factor: d.shrinkFactor, shrink_contribution: d.shrinkContribution, component_price: d.componentPrice,
    }));
    reports.push({ caseName: c, unit: `slot_${p.slotId}_detail`, result: compareRecords(actual, frameToRecords(detailFrame), detailFrame.columns) });
  }
}
const ok = printModuleReport("ngl (L02)", reports, [
  "NGL_WTI_CALIBRATION_BASE = 70 kept as a named constant (intentional methodology)",
  "recovery table selected by ethaneRec; C02 exercises the recovery table, all other cases the rejection table",
  "sums accumulate in component order (ethane, propane, isobutane, butane, pentanes) to match pandas column sums",
]);
process.exit(ok ? 0 : 1);
