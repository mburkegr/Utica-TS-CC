/** Public engine surface. The UI imports from here and nowhere else in engine/. */
export * from "./types";
export { monthToIso, parseMonth, monthIndex, monthYear, monthOfYear1, daysInMonth, type MonthIndex } from "./months";
export { loadTypeCurveLibrary, cleanTcName, getTypeCurve } from "./typecurve";
export { loadPriceDeck } from "./pricing";
export { NGL_WTI_CALIBRATION_BASE } from "./ngl";
export { resolveNglComponents } from "./prepare";
export { runDeal, runDealMetrics, runStandaloneSlotReturns, type DealResult, type EngineData, type DealRunOptions, type SlotResult } from "./deal";
export type { DealMonth, DealRollup } from "./rollup";
export type { Payback } from "./returns";
export type { PromoteScheduleRow } from "./promote";
export type { AlignedSlotMonth } from "./calendar";
export type { WellFrame, WellMonth } from "./well";
export {
  computeBases, buildStandardSpecs, buildCarryEntrySpecs, runTwoWaySensitivity, runScenarioMatrix,
  SCENARIO_DC_STEP, SCENARIO_TC_RISKS,
  type SensitivityBases, type SensitivitySpec, type SensitivityGrid, type SensitivityToggles, type ScenarioPoint, type SensitivityCase,
} from "./sensitivities";
export {
  buildPeriodTable, calcSlotEur, productionSeries, cumulativeFcfSeries, windowSeries, dealSummary, quarterLabel,
  PERIOD_METRICS, PERIOD_METRIC_LABELS, EUR_LABELS,
  type PeriodTable, type PeriodMetric, type SlotEur, type DisplayWindow, type DealSummary, type ProductionSeriesPoint, type CumulativeFcfPoint,
} from "./reporting";
