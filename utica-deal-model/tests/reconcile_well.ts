import * as fs from "node:fs";
import { compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs, type CaseReport, type Frame } from "./harness";
import { prepareDealSettings, prepareGlobalAssumptions, prepareSlotInputs } from "../engine/prepare";
import { calcNglFactors } from "../engine/ngl";
import { loadPriceDeck } from "../engine/pricing";
import { loadTypeCurveLibrary } from "../engine/typecurve";
import { runSingleWell } from "../engine/well";
import { monthToIso } from "../engine/months";

const deck = loadPriceDeck(JSON.parse(fs.readFileSync(new URL("../data/price_file_library.json", import.meta.url), "utf8")));
const lib = loadTypeCurveLibrary(JSON.parse(fs.readFileSync(new URL("../data/type_curve_library.json", import.meta.url), "utf8")));

const reports: CaseReport[] = [];
const shutIns: string[] = [];
for (const c of goldenCases()) {
  const L0 = loadJson(c, "L00_inputs.json");
  const dealInputs = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const g = prepareGlobalAssumptions(dealInputs);
  prepareDealSettings(dealInputs);
  const prepared = prepareSlotInputs(toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame), dealInputs);
  const L4 = loadJson(c, "L04_single_well_frames.json");
  for (const p of prepared) {
    const f = L4[String(p.slotId)] as Frame;
    const expected = frameToRecords(f);
    const w = runSingleWell(p, lib, g, calcNglFactors(p, g), deck);
    const actual = w.rows.map((r) => ({
      period: r.period, date: monthToIso(r.month), index_oil_price: r.indexOilPrice, index_gas_price: r.indexGasPrice,
      base_oil_scaled: r.baseOilScaled, base_gas_scaled: r.baseGasScaled, gross_oil_production: r.grossOilProduction,
      gross_gas_production: r.grossGasProduction, gross_ngl_production: r.grossNglProduction, monthly_production_boe: r.monthlyProductionBoe,
      oil_royalty_volumes: r.oilRoyaltyVolumes, gas_royalty_volumes: r.gasRoyaltyVolumes, ngl_royalty_volumes: r.nglRoyaltyVolumes,
      equity_oil_production: r.equityOilProduction, equity_gas_production: r.equityGasProduction, equity_ngl_production: r.equityNglProduction,
      local_oil_price: r.localOilPrice, local_gas_price: r.localGasPrice, local_ngl_price: r.localNglPrice,
      oil_revenue: r.oilRevenue, gas_revenue: r.gasRevenue, ngl_revenue: r.nglRevenue, total_revenue: r.totalRevenue,
      net_revenue: r.totalRevenue, opex: r.variableLoe, variable_loe: r.variableLoe, fixed_loe_monthly: r.fixedLoeMonthly, total_loe: r.totalLoe,
      tax: r.tax, capex: r.capex, pre_shut_in_operating_cf: r.preShutInOperatingCf, economic_limit_reached: r.economicLimitReached,
      well_shut_in: r.wellShutIn, operating_cf: r.operatingCf, operating_cf_shut_in: r.operatingCf, cash_flow: r.cashFlow,
    }));
    reports.push({ caseName: c, unit: `slot_${p.slotId}`, result: compareRecords(actual, expected, f.columns) });
    const pyShut = expected.find((r) => r.economic_limit_reached)?.period ?? null;
    shutIns.push(`${c}/slot ${p.slotId} (${p.tcName}): python shut-in ${pyShut ?? "none"}, ts ${w.shutInPeriod ?? "none"}, terminal month ${monthToIso(w.terminalMonth)}`);
  }
}
const ok = printModuleReport("well / production (L04)", reports, [
  "full type curve run (360 months in this library); the 360-month master-calendar cutoff is not applied here by design",
  "shut-in: first period >= 1 with negative pre-shut-in operating CF, permanent; prices and capex are not zeroed",
  "gas: grossGasProduction is residue (post-shrink); grossNglProduction is theoretical yield on raw gas (pre-recovery)",
  "per-unit gas severance grossed up to wellhead volume via equityGas / (1 - shrink)",
  "net_revenue and opex alias columns are emitted only in the test adapter (aliases of total_revenue and variable_loe)",
  ...shutIns.map((s) => "shut-in: " + s),
]);
process.exit(ok ? 0 : 1);
