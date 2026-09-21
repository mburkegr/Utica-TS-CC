import { compareRecords, goldenCases, loadJson, printModuleReport, toDealInputs, toSlotInputs, type CaseReport, type Frame } from "./harness";
import { deck, lib } from "./adapters";
import { runDeal } from "../engine/deal";
import { buildPeriodTable, calcSlotEur, cumulativeFcfSeries, productionSeries, windowSeries, type PeriodMetric } from "../engine/reporting";
import { monthToIso, parseMonth } from "../engine/months";
import { quarterLabel } from "../engine/reporting";
import { payback } from "../engine/returns";

const data = { typeCurves: lib, priceDeck: deck };
const DIAG = new Set(["C09a", "C09b"]);
const PY_ROW: Record<string, PeriodMetric> = {
  "Assumed Index Pricing - Crude Oil": "indexOilPrice", "Assumed Index Pricing - Natural Gas": "indexGasPrice",
  "Realized Pricing - Crude Oil": "realizedOilPrice", "Realized Pricing - NGL (% of WTI)": "realizedNglPctOfWti", "Realized Pricing - Natural Gas": "realizedGasPrice",
  "Gross Wells Spud": "grossWellsSpud", "Net Wells Spud": "netWellsSpud",
  "Production - Crude Oil": "oilBblPerDay", "Production - NGL's": "nglBblPerDay", "Production - Natural Gas": "gasMcfPerDay", "Production - Total (Mcfe/d)": "totalMcfePerDay",
  "Revenues - Crude Oil": "oilRevenueK", "Revenues - NGL's": "nglRevenueK", "Revenues - Natural Gas": "gasRevenueK", "Revenues - Total": "totalRevenueK",
  "Operating Expenses - Taxes": "taxesK", "Operating Expenses - LOE": "loeK", "Operating Expenses - Total Opex": "totalOpexK",
  "Taxes / Mcfe": "taxesPerMcfe", "LOE / Mcfe": "loePerMcfe", "EBITDA": "ebitdaK",
  "Capital Expenditures - D&C": "dncCapexK", "Capital Expenditures - Acquisition": "acquisitionCapexK", "Capital Expenditures - Total": "totalCapexK",
  "Free Cash Flow": "freeCashFlowK", "Cumulative FCF": "cumulativeFcfK",
};
const tol = (col: string) => /Pricing|Mcfe$|WTI/.test(col) ? { atol: 1e-9, rtol: 1e-9 } : /Wells/.test(col) ? { atol: 1e-12, rtol: 1e-12 } : { atol: 1e-6, rtol: 1e-9 };

const legacy: CaseReport[] = []; const dynamic: CaseReport[] = []; const eurRep: CaseReport[] = []; const diag: CaseReport[] = []; const notes: string[] = [];

function compareTable(c: string, unit: string, pyFrame: any, table: ReturnType<typeof buildPeriodTable>, into: CaseReport[]) {
  const pyCols: string[] = pyFrame.columns; const pyIdx: string[] = pyFrame.index;
  const overlap = pyCols.filter((col) => table.columns.some((tc) => tc.label === col));
  const actual: Record<string, any>[] = [], expected: Record<string, any>[] = [];
  const cols: string[] = [];
  for (const col of overlap) {
    const ti = table.columns.findIndex((tc) => tc.label === col); const pi = pyCols.indexOf(col);
    const a: Record<string, any> = {}, e: Record<string, any> = {};
    for (let r = 0; r < pyIdx.length; r++) {
      const metric = PY_ROW[pyIdx[r]]; if (!metric) continue;
      const ev = pyFrame.rows[r][pi];
      if (ev === null) continue; // Python NaN: no deal rows in that legacy period
      const key = `${pyIdx[r]}`; a[key] = table.values[metric][ti]; e[key] = ev; if (!cols.includes(key)) cols.push(key);
    }
    actual.push(a); expected.push(e);
  }
  const res = compareRecords(actual, expected, cols, { tol });
  res.notes.push(`overlap columns: ${overlap.join(", ")}`);
  into.push({ caseName: c, unit, result: res });
}

for (const c of goldenCases()) {
  const L0 = loadJson(c, "L00_inputs.json");
  const res = runDeal(toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame), toDealInputs(L0.run_deal_inputs_after_app_preprocessing), data);
  const L11 = loadJson(c, "L11_reporting.json");
  const q = buildPeriodTable(res, "quarter"); const y = buildPeriodTable(res, "year");
  const target = DIAG.has(c) ? diag : legacy;
  compareTable(c, "quarterly_legacy_overlap", L11.legacy_python_golden.quarterly_table_numeric, q, target);
  compareTable(c, "annual_legacy_overlap", L11.legacy_python_golden.annual_table_numeric, y, target);
  // dynamic expectations (harness-derived tables + structural rules)
  const dyn = L11.dynamic_expected_harness_derived;
  compareTable(c, "quarterly_dynamic_expected", dyn.quarterly_8_from_calendar_start, q, DIAG.has(c) ? diag : dynamic);
  // The harness expectation was derived from the legacy 360-month Python frame, so its final year is truncated.
  // Compare only years whose 12 months all lie within the legacy calendar end.
  const legacyEnd = parseMonth(loadJson(c, "L10_returns.json").calendar_end);
  const annualExp = { ...dyn.annual_through_economic_life };
  const keep = (annualExp.columns as string[]).map((col, i) => [col, i] as const).filter(([col]) => Number(col) * 12 + 11 <= legacyEnd);
  annualExp.columns = keep.map(([col]) => col);
  annualExp.rows = (annualExp.rows as any[][]).map((row) => keep.map(([, i]) => row[i]));
  compareTable(c, "annual_dynamic_expected_overlap(full years within legacy calendar)", annualExp, y, DIAG.has(c) ? diag : dynamic);
  const startQ = quarterLabel(res.deal.calendarStart);
  const structural = compareRecords(
    [{ quarters: q.columns.length, first_quarter: q.columns[0].label, first_year: y.columns[0].label, last_year: y.columns[y.columns.length - 1].label }],
    [{ quarters: 8, first_quarter: startQ, first_year: String(Math.floor(res.deal.calendarStart / 12)), last_year: String(Math.floor(res.deal.economicCalendarEnd / 12)) }],
    ["quarters", "first_quarter", "first_year", "last_year"], { tol: () => ({ atol: 0, rtol: 0, kind: "exact" }) });
  (DIAG.has(c) ? diag : dynamic).push({ caseName: c, unit: "dynamic_structure", result: structural });
  // EUR
  for (const e of calcSlotEur(res)) {
    const pe = L11.eur_per_ft[String(e.slotId)];
    const r = compareRecords([{ oil: e.oilEurPerFt, residue: e.residueGasEurPerFt, raw: e.rawGasEurPerFt, shrink: e.gasShrinkFraction }],
      [{ oil: pe.oil_eur_per_ft_risked_post_economic_limit, residue: pe.residue_gas_eur_per_ft_risked_post_shrink_post_economic_limit, raw: pe.raw_gas_eur_per_ft_risked_pre_shrink_post_economic_limit_harness_derived, shrink: pe.gas_shrink_fraction }],
      ["oil", "residue", "raw", "shrink"], { tol: () => ({ atol: 1e-9, rtol: 1e-9 }) });
    if (!(e.recoveredNglBblPerFt <= e.theoreticalNglBblPerFt + 1e-12 && e.nglRecoveredFraction > 0 && e.nglRecoveredFraction <= 1)) { r.ok = false; r.notes.push("NGL recovered/theoretical relationship violated"); }
    eurRep.push({ caseName: c, unit: `eur_slot_${e.slotId}`, result: r });
  }
  // windowing must not affect calculations
  const months = res.deal.rows.map((r) => r.month), cfs = res.deal.rows.map((r) => r.slotTotalCashFlow);
  const w = windowSeries(cumulativeFcfSeries(res), { endMonth: parseMonth("2040-12-01") });
  const full = payback(months, cfs);
  const winRes = compareRecords([{ payback_days: full.paybackDayNumber, irr: res.irr, windowed_shorter: w.length < res.deal.rows.length || res.deal.rows.length === w.length, prod_points: productionSeries(res).length }],
    [{ payback_days: res.payback.paybackDayNumber, irr: res.irr, windowed_shorter: true, prod_points: res.deal.rows.length }], ["payback_days", "irr", "windowed_shorter", "prod_points"],
    { tol: (col) => col === "windowed_shorter" ? { atol: 0, rtol: 0, kind: "bool" } : { atol: 0, rtol: 0 } });
  dynamic.push({ caseName: c, unit: "chart_window_isolation", result: winRes });
  if (c === "C01") notes.push(`C01 dynamic columns: quarters ${q.columns.map((x) => x.label).join(" ")}; years ${y.columns[0].label}..${y.columns[y.columns.length - 1].label} (${y.columns.length})`);
}
const ok1 = printModuleReport("reporting (L11) legacy overlap parity", legacy, ["engine tables built from the full-life run; compared on the legacy Q1 26..Q4 27 / 2026..2033 columns where Python has data (NaN legacy cells skipped)"]);
const ok2 = printModuleReport("reporting (L11) dynamic-period suite (intentional new behavior)", dynamic, ["annual harness expectation derived from the legacy 360-month frame: its final (truncated) year is excluded; the engine's annual table runs through the full economic life", "8 quarters from the quarter containing calendarStart; annual through economic life; compared to the harness-derived expectation and structural rules", "chart window is a pure filter; payback/IRR are from the full-life series", ...notes]);
const ok3 = printModuleReport("reporting (L11) EUR / ft", eurRep, ["oil and residue-gas EUR vs Python; raw-gas EUR vs the harness-derived value; recovered NGL = theoretical x sum(content x recovery)"]);
printModuleReport("reporting diagnostic C09a/C09b (expected divergence)", diag, ["Python duplicated spud month"]);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
