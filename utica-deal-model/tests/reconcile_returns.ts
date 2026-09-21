import { compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs, type CaseReport, type Frame } from "./harness";
import { runDeal, runStandaloneSlotReturns } from "../engine/deal";
import { payback } from "../engine/returns";
import { deck, lib } from "./adapters";
import { civilToDays, monthToIso, parseMonth } from "../engine/months";
import type { DealMonth } from "../engine/rollup";

const DIAG = new Set(["C09a", "C09b"]);
const data = { typeCurves: lib, priceDeck: deck };
const l9: CaseReport[] = []; const l10: CaseReport[] = []; const full: CaseReport[] = []; const diag: CaseReport[] = []; const notes: string[] = [];

function dealRowToPython(r: DealMonth): Record<string, any> {
  const p = r.promote;
  return {
    date: monthToIso(r.month), slot_gross_oil_production: r.slotGrossOilProduction, slot_gross_gas_production: r.slotGrossGasProduction,
    slot_gross_ngl_production: r.slotGrossNglProduction, slot_gross_boe: r.slotGrossBoe, slot_net_oil_production: r.slotNetOilProduction,
    slot_net_gas_production: r.slotNetGasProduction, slot_net_ngl_production: r.slotNetNglProduction, slot_net_boe: r.slotNetBoe,
    slot_oil_revenue: r.slotOilRevenue, slot_gas_revenue: r.slotGasRevenue, slot_ngl_revenue: r.slotNglRevenue, slot_total_revenue: r.slotTotalRevenue,
    slot_loe: r.slotLoe, slot_tax: r.slotTax, slot_operating_profit: r.slotOperatingProfit, slot_promote_ocf: r.slotPromoteOcf,
    slot_base_capex: r.slotBaseCapex, slot_dale_carry_capex: r.slotDaleCarryCapex, slot_capex: r.slotCapex, slot_pud_cash_flow: r.slotPudCashFlow,
    slot_asset_purchase: r.slotAssetPurchase, slot_total_cash_flow: r.slotTotalCashFlow, index_oil_price: r.indexOilPrice, index_gas_price: r.indexGasPrice,
    promote_monthly_investment: p?.monthlyInvestment ?? null, promote_monthly_distributions: p?.monthlyDistributions ?? null,
    promote_cumulative_investment: p?.cumulativeInvestment ?? null, promote_cumulative_distributions: p?.cumulativeDistributions ?? null,
    promote_hurdle_reached: p?.hurdleReached ?? null, promote_active: p?.active ?? null, promote_running_multiple: p?.runningMultiple ?? null,
    promote_hurdle_date: p == null || p.earliestHurdleDate == null ? null : monthToIso(p.earliestHurdleDate),
    promote_effective_date: p == null || p.earliestEffectiveDate == null ? null : monthToIso(p.earliestEffectiveDate),
    promote_active_group_count: p?.activeGroupCount ?? null, promote_total_group_count: p?.totalGroupCount ?? null,
  };
}
const isoToDays = (s: string) => { const [d, t] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); let days = civilToDays(y, m, dd); if (t) { const [hh, mm, ss] = t.split(":"); days += (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) / 86400; } return days; };

for (const c of goldenCases()) {
  const isFL = c === "C07-FL";
  const L0 = loadJson(c, "L00_inputs.json");
  const di = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const slots = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame);
  const res = runDeal(slots, di, data, isFL ? {} : { calendarMonths: 360 });
  // L09
  const f9 = loadJson(c, "L09_deal_frame.json") as Frame;
  let exp9 = frameToRecords(f9);
  const act9 = (isFL ? res.deal.rows : res.deal.allRows).map(dealRowToPython);
  if (isFL) exp9 = exp9.filter((r) => r.date <= monthToIso(res.deal.economicCalendarEnd));
  const r9 = compareRecords(act9, exp9, f9.columns);
  (isFL ? full : DIAG.has(c) ? diag : l9).push({ caseName: c, unit: "L09_deal_frame", result: r9 });
  // L10
  const L10 = loadJson(c, "L10_returns.json");
  const months = (isFL ? res.deal.rows : res.deal.allRows).map((r) => r.month);
  const cfs = (isFL ? res.deal.rows : res.deal.allRows).map((r) => r.slotTotalCashFlow);
  const pbLegacy = payback(months, cfs, parseMonth("2040-12-01"));
  const pbFull = payback(months, cfs);
  const standalone = runStandaloneSlotReturns(slots, di, data, isFL ? {} : { calendarMonths: 360 });
  const actual: Record<string, any> = { irr: res.irr, moic: res.moic, payback_legacy_days: pbLegacy.paybackDayNumber, payback_legacy_years: pbLegacy.paybackYears,
    payback_full_days: pbFull.paybackDayNumber, payback_full_years: pbFull.paybackYears, calendar_start: monthToIso(res.deal.calendarStart),
    economic_end: monthToIso(res.deal.economicCalendarEnd) };
  const expected: Record<string, any> = { irr: L10.irr, moic: L10.moic,
    payback_legacy_days: L10.payback_legacy_python_golden.payback_date == null ? null : isoToDays(L10.payback_legacy_python_golden.payback_date),
    payback_legacy_years: L10.payback_legacy_python_golden.payback_years,
    payback_full_days: L10.payback_dynamic_expected.payback_date == null ? null : isoToDays(L10.payback_dynamic_expected.payback_date),
    payback_full_years: L10.payback_dynamic_expected.payback_years, calendar_start: L10.calendar_start,
    economic_end: L10.economic_calendar_end_last_nonzero_month };
  for (const [sid, v] of Object.entries(L10.standalone_slot_returns)) { actual[`standalone_${sid}_irr`] = standalone[Number(sid)].irr; actual[`standalone_${sid}_moic`] = standalone[Number(sid)].moic; expected[`standalone_${sid}_irr`] = (v as any).irr; expected[`standalone_${sid}_moic`] = (v as any).moic; }
  const tol = (col: string) => col.includes("irr") ? { atol: 1e-8, rtol: 0 } : col.includes("moic") ? { atol: 1e-9, rtol: 1e-9 } : col.includes("days") ? { atol: 1 / 86400, rtol: 0 } : col.includes("years") ? { atol: 1e-9, rtol: 0 } : { atol: 0, rtol: 0, kind: "exact" as const };
  const r10 = compareRecords([actual], [expected], Object.keys(actual), { tol });
  (isFL ? full : DIAG.has(c) ? diag : l10).push({ caseName: c, unit: "L10_returns", result: r10 });
  notes.push(`${c}: IRR ts=${res.irr} py=${L10.irr}  MOIC ts=${res.moic} py=${L10.moic}`);
}
const ok1 = printModuleReport("rollup (L09) parity, calendarMonths=360", l9, ["portfolio promote summary present only where the schedule has a row (Python left-merge NaN elsewhere)"]);
const ok2 = printModuleReport("returns (L10) parity", l10, [
  "XIRR: Actual/365F on first-of-month dates, Newton from 0.1 with bracketed fallback; null when no sign change (C10)",
  "MOIC on the deal-level netted monthly series; 0.0 (not null) when nothing is returned (C10)",
  "payback: legacy value compared with the 2040-12 display cutoff applied; full-life value compared to the harness dynamic expectation",
  ...notes,
]);
const ok3 = printModuleReport("rollup/returns full-life vs C07-FL (P2)", full, ["deal frame compared through the engine's economic calendar end (last nonzero month); IRR/MOIC vs the monkeypatched Python reference"]);
printModuleReport("rollup/returns diagnostic C09a/C09b (expected divergence)", diag, ["Python duplicates the spud month when flowbackDelay = 0 (capex/production 2x; acquisition 2x in C09b)"]);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
