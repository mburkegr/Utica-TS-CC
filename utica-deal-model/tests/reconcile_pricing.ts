import * as fs from "node:fs";
import {
  compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs,
  type CaseReport, type Frame,
} from "./harness";
import { prepareDealSettings, prepareGlobalAssumptions, prepareSlotInputs } from "../engine/prepare";
import { buildIndexPriceSeries, loadPriceDeck } from "../engine/pricing";
import { monthToIso, parseMonth } from "../engine/months";

const deck = loadPriceDeck(JSON.parse(fs.readFileSync(new URL("../data/price_file_library.json", import.meta.url), "utf8")));

const prepReports: CaseReport[] = [];
const priceReports: CaseReport[] = [];

for (const c of goldenCases()) {
  const L0 = loadJson(c, "L00_inputs.json");
  const dealInputs = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const slots = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame);

  // ---- prepare: deal settings ----
  const ds = prepareDealSettings(dealInputs);
  const dsActual = {
    effective_date: monthToIso(ds.effectiveDate), use_bid_override: ds.useBidOverride, bid_override: ds.bidOverride,
    promote_enabled: ds.promoteEnabled, dale_initial_interest_pct: ds.daleInitialInterestPct,
    promote_wi_reversion_pct: ds.promoteWiReversionPct, promote_multiple: ds.promoteMultiple,
  };
  prepReports.push({ caseName: c, unit: "deal_settings", result: compareRecords([dsActual], [L0.deal_settings], Object.keys(dsActual)) });

  // ---- prepare: global assumptions ----
  const g = prepareGlobalAssumptions(dealInputs);
  const gaActual: Record<string, any> = {
    pricing_mode: g.pricingMode, oil_price: g.oilPrice, gas_price: g.gasPrice, base_oil_price: g.baseOilPrice, base_gas_price: g.baseGasPrice,
    oil_flat_start_date: monthToIso(g.oilFlatStartDate), gas_flat_start_date: monthToIso(g.gasFlatStartDate),
    use_sev_tax_pct: g.useSevTaxPct, oil_sev_tax: g.oilSevTax, gas_sev_tax: g.gasSevTax, ad_val_tax: g.adValTax, ethane_rec: g.ethaneRec,
  };
  const gaExpected: Record<string, any> = { ...L0.global_assumptions };
  for (const grp of ["content_percentages", "recover_ethane_percentages", "reject_ethane_percentages", "ngl_prices", "ngl_shrink_factors"] as const) {
    const key = { content_percentages: "contentPercentages", recover_ethane_percentages: "recoverEthanePercentages", reject_ethane_percentages: "rejectEthanePercentages", ngl_prices: "nglPrices", ngl_shrink_factors: "nglShrinkFactors" }[grp] as keyof typeof g;
    for (const comp of Object.keys(gaExpected[grp])) {
      gaActual[`${grp}.${comp}`] = (g[key] as any)[comp];
      gaExpected[`${grp}.${comp}`] = gaExpected[grp][comp];
    }
  }
  prepReports.push({ caseName: c, unit: "global_assumptions", result: compareRecords([gaActual], [gaExpected], Object.keys(gaActual)) });

  // ---- prepare: slot inputs ----
  const prepared = prepareSlotInputs(slots, dealInputs);
  const psExpected = frameToRecords(L0.prepared_slot_inputs as Frame);
  const psActual = prepared.map((p) => ({
    dale_promote: p.dalePromote, dale_unit_id: p.daleUnitId, dale_payout_group: p.dalePayoutGroup, dale_first_well_carry: p.daleFirstWellCarry,
    carry_enabled: p.carryEnabled, carry_wi_reversion_pct: p.carryWiReversionPct, slot_id: p.slotId, tc_name: p.tcName, gross_wells: p.grossWells,
    net_acres: p.netAcres, unit_acres: p.unitAcres, use_calc_unit_acres: p.useCalcUnitAcres, pct_unitized: p.pctUnitized,
    drilling_spud_month: monthToIso(p.spudMonth), flowback_delay: p.flowbackDelay, net_revenue_interest: p.netRevenueInterest,
    lateral_length: p.lateralLength, dc_costs: p.dcCosts, tc_risk: p.tcRisk, bid_per_acre: p.bidPerAcre, oil_diff: p.oilDiff, gas_diff: p.gasDiff,
    oil_opex_bbl: p.oilOpexBbl, gas_opex_mcf: p.gasOpexMcf, ngl_opex: p.nglOpex, fixed_loe: p.fixedLoe, ngl_yield: p.nglYield,
  }));
  const cols = (L0.prepared_slot_inputs as Frame).columns.filter((x) => x !== "ngl_diff");
  prepReports.push({ caseName: c, unit: "slot_inputs", result: compareRecords(psActual, psExpected, cols) });

  // ---- pricing: L03 ----
  const L3 = loadJson(c, "L03_price_series.json");
  for (const key of Object.keys(L3)) {
    const f = L3[key] as Frame;
    const expected = frameToRecords(f);
    const months = expected.map((r) => parseMonth(r.date));
    const actual = buildIndexPriceSeries(months, g, deck).map((r) => ({
      date: monthToIso(r.month), index_oil_price: r.indexOilPrice, index_gas_price: r.indexGasPrice,
    }));
    priceReports.push({ caseName: c, unit: key === "deal_calendar" ? "deal_calendar" : `slot_${key}`, result: compareRecords(actual, expected, f.columns) });
  }
}

const okPrep = printModuleReport("prepare (L00)", prepReports, [
  "acquisition-cost override removed: deal_settings.use_acquisition_override / acquisition_cost_override are not compared (all fixtures have it off)",
  "ngl_diff is not part of the engine and is excluded from the slot comparison",
  "flowbackDelay is validated as an integer >= 0 (0 accepted)",
]);
const okPrice = printModuleReport("pricing (L03)", priceReports, [
  "deck loaded from data/price_file_library.json (exported once from the workbook; same validation rules as the Python loader)",
  "file mode: month >= flat-start uses the terminal price; otherwise deck + (terminal - base) parallel shift; missing months raise",
  "flat mode ignores the 1900-01-01 placeholder switch dates",
]);
process.exit(okPrep && okPrice ? 0 : 1);
