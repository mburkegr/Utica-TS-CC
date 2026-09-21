/**
 * Sensitivities. Mirrors app.py's weighted_avg_by_net_acres,
 * weighted_avg_spud_month_by_net_acres, build_sensitivity_range,
 * build_percentage_sensitivity_range, run_two_way_sensitivity.apply_value,
 * the sensitivity_specs / carry_entry_specs construction, and the scenario
 * grid inside build_scenario_scatter_chart.
 *
 * Every sensitivity case is built from fresh copies of the base-case inputs
 * (`applySensitivityValue` never mutates its arguments) and is executed
 * through the same `runDealMetrics` entry point as the base case. Base-case
 * execution and sensitivity execution are separate calls; nothing here holds
 * state.
 *
 * Scenario matrix D&C cases are base +/- $50/ft and are labeled as such
 * (the Python legend text showing +/- $100 was a defect).
 */

import { runDealMetrics, type DealRunOptions, type EngineData } from "./deal";
import type { MonthIndex } from "./months";
import type { DealInputs, SlotInput } from "./types";

// ---------------------------------------------------------------------------
// Weighted bases
// ---------------------------------------------------------------------------
export function weightedAvgByNetAcres(slots: SlotInput[], field: keyof SlotInput): number {
  const vals = slots.map((s) => Number(s[field]));
  const wts = slots.map((s) => (Number.isFinite(Number(s.netAcres)) ? Number(s.netAcres) : 0));
  let num = 0, den = 0, any = false;
  for (let i = 0; i < vals.length; i++) {
    if (Number.isFinite(vals[i]) && wts[i] > 0) { num += vals[i] * wts[i]; den += wts[i]; any = true; }
  }
  if (!any) {
    const v = vals.filter((x) => Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0.0;
  }
  return num / den;
}

/** Python round(): round half to even. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Net-acre-weighted representative spud month (month index == Python year*12 + month - 1). */
export function weightedAvgSpudMonth(slots: { spudMonth: MonthIndex; netAcres: number }[], fallback: MonthIndex): MonthIndex {
  let num = 0, den = 0, any = false;
  for (const s of slots) {
    if (Number.isFinite(s.spudMonth) && s.netAcres > 0) { num += s.spudMonth * s.netAcres; den += s.netAcres; any = true; }
  }
  if (!any) {
    const v = slots.filter((s) => Number.isFinite(s.spudMonth));
    return v.length ? v[0].spudMonth : fallback;
  }
  return roundHalfEven(num / den);
}

// ---------------------------------------------------------------------------
// Axis construction
// ---------------------------------------------------------------------------
const round10 = (v: number) => Math.round(v * 1e10) / 1e10;
const round2 = (v: number) => Math.round(v * 1e2) / 1e2;

export function buildSensitivityRange(base: number, step: number, stepsEachWay = 3, minValue?: number): number[] {
  const target = stepsEachWay * 2 + 1;
  let raw: number[] = [];
  for (let i = -stepsEachWay; i <= stepsEachWay; i++) raw.push(base + step * i);
  if (minValue !== undefined) raw = raw.map((v) => Math.max(minValue, v));
  const values: number[] = [];
  for (const v of raw) { const r = round10(v); if (!values.includes(r)) values.push(r); }
  while (values.length < target) values.push(round10(Math.max(...values) + step));
  return values.sort((a, b) => a - b);
}

export function buildPercentageSensitivityRange(base: number, pctStep = 0.05, stepsEachWay = 4, minValue = 0.0): number[] {
  const out: number[] = [];
  for (let i = -stepsEachWay; i <= stepsEachWay; i++) out.push(round2(Math.max(minValue, base * (1.0 + pctStep * i))));
  return out;
}

// ---------------------------------------------------------------------------
// Bases and specs
// ---------------------------------------------------------------------------
export type SensitivityVariable = "bid" | "dc" | "oil" | "gas" | "tc_risk" | "ngl_yield" | "spud_date" | "carry";
export type AxisFormat = "dollar" | "percent" | "percent1" | "float2" | "date";

export interface SensitivityBases {
  baseDc: number; baseBid: number; baseTcRisk: number; baseNglYield: number; baseSpudMonth: MonthIndex;
  dcOverrideEnabled: boolean;
  bidValues: number[]; tcRiskValues: number[]; dcValues: number[]; oilValues: number[]; gasValues: number[];
  nglYieldValues: number[]; spudDateValues: MonthIndex[]; carrySensValues: number[]; bidSensValues: number[];
}

export interface SensitivityToggles {
  useTcRiskAsMain?: boolean;
  useDcPctSteps?: boolean;
  /** Carry / entry custom sensitivities: seven levels each (app defaults 10% + 5% steps, base bid + $500 steps). */
  carryStartPct?: number; carryStepPct?: number; bidStart?: number; bidStep?: number;
}

export interface SensitivitySpec {
  key: string;
  title: string;
  xValues: (number | MonthIndex)[]; xVariable: SensitivityVariable; xTitle: string; xFormat: AxisFormat; baseX?: number;
  yValues: (number | MonthIndex)[]; yVariable: SensitivityVariable; yTitle: string; yFormat: AxisFormat; baseY?: number;
  /** Forced base-case changes applied before the grid runs (carry/entry customs). */
  forcing?: "bid_to_one_dollar" | "carry_off";
  caption?: string;
}

export function computeBases(slots: SlotInput[], inputs: DealInputs, t: SensitivityToggles = {}): SensitivityBases {
  const dcOverrideEnabled = Boolean(inputs.useDcOverride);
  const baseDc = dcOverrideEnabled ? Number(inputs.dcOverride) : weightedAvgByNetAcres(slots, "dcCosts");
  const baseBid = Math.max(1.0, inputs.useBidOverride ? Number(inputs.bidOverride) : weightedAvgByNetAcres(slots, "bidPerAcre"));
  const baseTcRisk = weightedAvgByNetAcres(slots, "tcRisk");
  const baseNglYield = weightedAvgByNetAcres(slots, "nglYield");
  const spuds = slots.map((s) => ({ spudMonth: parseMonthSafe(s.drillingSpudMonth), netAcres: Number(s.netAcres) || 0 }));
  const baseSpudMonth = weightedAvgSpudMonth(spuds, spuds[0]?.spudMonth ?? 0);
  const tcRiskValues: number[] = [];
  for (let i = -4; i <= 4; i++) tcRiskValues.push(Math.max(0.0, baseTcRisk + 0.05 * i));
  const spudDateValues: MonthIndex[] = [];
  for (let i = -4; i <= 4; i++) spudDateValues.push(baseSpudMonth + 3 * i);
  const carryStart = t.carryStartPct ?? 10.0, carryStep = t.carryStepPct ?? 5.0;
  const bidStart = t.bidStart ?? Math.max(1.0, baseBid), bidStep = t.bidStep ?? 500.0;
  const carrySensValues: number[] = [], bidSensValues: number[] = [];
  for (let i = 0; i < 7; i++) { carrySensValues.push(round10((carryStart + carryStep * i) / 100.0)); bidSensValues.push(Math.max(1.0, round10(bidStart + bidStep * i))); }
  return {
    baseDc, baseBid, baseTcRisk, baseNglYield, baseSpudMonth, dcOverrideEnabled,
    bidValues: buildSensitivityRange(baseBid, 500.0, 4, 1.0), tcRiskValues,
    dcValues: t.useDcPctSteps ? buildPercentageSensitivityRange(baseDc, 0.05, 4, 0.0) : buildSensitivityRange(baseDc, 50.0, 4, 0.0),
    oilValues: buildSensitivityRange(Number(inputs.oilPrice), 5.0, 4), gasValues: buildSensitivityRange(Number(inputs.gasPrice), 0.25, 4),
    nglYieldValues: buildSensitivityRange(baseNglYield, 0.50, 4, 0.0), spudDateValues, carrySensValues, bidSensValues,
  };
}

function parseMonthSafe(iso: string): MonthIndex {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso));
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : NaN;
}

export function buildStandardSpecs(b: SensitivityBases, inputs: DealInputs, t: SensitivityToggles = {}): SensitivitySpec[] {
  const tcMain = Boolean(t.useTcRiskAsMain);
  const main = tcMain
    ? { values: b.tcRiskValues, variable: "tc_risk" as const, title: "TC Risk", format: "percent" as const, base: b.baseTcRisk }
    : { values: b.bidValues, variable: "bid" as const, title: "$/Acre Bid", format: "dollar" as const, base: b.baseBid };
  const cross = tcMain
    ? { values: b.bidValues, variable: "bid" as const, title: "$/Acre Bid", format: "dollar" as const, base: b.baseBid }
    : { values: b.tcRiskValues, variable: "tc_risk" as const, title: "TC Risk", format: "percent" as const, base: b.baseTcRisk };
  const M = (key: string, title: string, xValues: number[], xVariable: SensitivityVariable, xTitle: string, xFormat: AxisFormat, baseX: number): SensitivitySpec =>
    ({ key, title: `${title} vs. ${main.title} Sensitivity`, xValues, xVariable, xTitle, xFormat, baseX, yValues: main.values, yVariable: main.variable, yTitle: main.title, yFormat: main.format, baseY: main.base });
  return [
    M("dc_main", "D&C Costs ($/ft)", b.dcValues, "dc", "D&C Costs ($/ft)", "dollar", b.baseDc),
    M("oil_main", "Oil Price", b.oilValues, "oil", "Oil Price ($/bbl)", "dollar", Number(inputs.oilPrice)),
    M("ngl_main", "NGL Yield (GPM)", b.nglYieldValues, "ngl_yield", "NGL Yield (GPM)", "float2", b.baseNglYield),
    M("gas_main", "Gas Price", b.gasValues, "gas", "Gas Price ($/mcf)", "dollar", Number(inputs.gasPrice)),
    { key: "gas_dc", title: "Gas Price vs. D&C Costs Sensitivity", xValues: b.gasValues, xVariable: "gas", xTitle: "Gas Price ($/mcf)", xFormat: "dollar", baseX: Number(inputs.gasPrice),
      yValues: b.dcValues, yVariable: "dc", yTitle: "D&C Costs ($/ft)", yFormat: "dollar", baseY: b.baseDc },
    { key: "oil_gas", title: "Oil Price vs. Gas Price Sensitivity", xValues: b.oilValues, xVariable: "oil", xTitle: "Oil Price ($/bbl)", xFormat: "dollar", baseX: Number(inputs.oilPrice),
      yValues: b.gasValues, yVariable: "gas", yTitle: "Gas Price ($/mcf)", yFormat: "dollar", baseY: Number(inputs.gasPrice) },
    M("cross_main", cross.title, cross.values, cross.variable, cross.title, cross.format, cross.base),
    { key: "spud_tc", title: "Spud Date vs. TC Risk Sensitivity", xValues: b.spudDateValues, xVariable: "spud_date", xTitle: "Spud Date", xFormat: "date", baseX: b.baseSpudMonth,
      yValues: b.tcRiskValues, yVariable: "tc_risk", yTitle: "TC Risk", yFormat: "percent", baseY: b.baseTcRisk,
      caption: "Spud timing shifts in 3-month increments from 12 months earlier to 12 months later. Every slot shifts by the same amount so relative timing is preserved." },
  ];
}

export function buildCarryEntrySpecs(b: SensitivityBases): SensitivitySpec[] {
  return [
    { key: "carry_dc_custom", title: "Carry vs. D&C Costs Sensitivity", xValues: b.dcValues, xVariable: "dc", xTitle: "D&C Costs ($/ft)", xFormat: "dollar",
      yValues: b.carrySensValues, yVariable: "carry", yTitle: "Carry", yFormat: "percent1", forcing: "bid_to_one_dollar",
      caption: "Acquisition forced to $1/acre; carry applies as a deal-level override to every included slot." },
    { key: "bid_dc_custom", title: "$/Acre vs. D&C Costs Sensitivity", xValues: b.dcValues, xVariable: "dc", xTitle: "D&C Costs ($/ft)", xFormat: "dollar",
      yValues: b.bidSensValues, yVariable: "bid", yTitle: "$/Acre Bid", yFormat: "dollar", forcing: "carry_off",
      caption: "Carry forced off on every slot; the $/acre axis starts at the entered value and increases by the entered step for seven levels." },
  ];
}

// ---------------------------------------------------------------------------
// Value application (pure: returns new objects)
// ---------------------------------------------------------------------------
export interface SensitivityCase { slots: SlotInput[]; inputs: DealInputs }

export function applySensitivityValue(c: SensitivityCase, variable: SensitivityVariable, value: number | MonthIndex, b: SensitivityBases): SensitivityCase {
  const slots = c.slots.map((s) => ({ ...s }));
  const inputs: DealInputs = { ...c.inputs };
  switch (variable) {
    case "spud_date": {
      const delta = (value as MonthIndex) - b.baseSpudMonth;
      for (const s of slots) { const m = parseMonthSafe(s.drillingSpudMonth) + delta; s.drillingSpudMonth = monthIso(m); }
      break;
    }
    case "bid": inputs.useBidOverride = true; inputs.bidOverride = Math.max(1.0, Number(value)); break;
    case "dc": {
      const delta = Number(value) - b.baseDc;
      if (b.dcOverrideEnabled) { inputs.useDcOverride = true; inputs.dcOverride = Math.max(0.0, b.baseDc + delta); }
      else { inputs.useDcOverride = false; for (const s of slots) s.dcCosts = Math.max(0.0, (Number(s.dcCosts) || 0) + delta); }
      break;
    }
    case "oil": inputs.oilPrice = Number(value); break;
    case "gas": inputs.gasPrice = Number(value); break;
    case "tc_risk": { const d = Number(value) - b.baseTcRisk; for (const s of slots) s.tcRisk = Math.max(0.0, (Number(s.tcRisk) || 0) + d); break; }
    case "ngl_yield": { const d = Number(value) - b.baseNglYield; for (const s of slots) s.nglYield = Math.max(0.0, (Number(s.nglYield) || 0) + d); break; }
    case "carry": inputs.useCarryOverride = true; inputs.carryOverridePct = Math.max(0.0, Math.min(100.0, Number(value) * 100.0)); break;
    default: throw new Error(`Unsupported sensitivity variable: ${variable}`);
  }
  return { slots, inputs };
}

function monthIso(m: MonthIndex): string {
  const y = Math.floor(m / 12), mo = m - y * 12 + 1;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
}

export function applyForcing(c: SensitivityCase, forcing: SensitivitySpec["forcing"]): SensitivityCase {
  const slots = c.slots.map((s) => ({ ...s }));
  const inputs: DealInputs = { ...c.inputs };
  if (forcing === "bid_to_one_dollar") { inputs.useBidOverride = true; inputs.bidOverride = 1.0; }
  else if (forcing === "carry_off") { inputs.useCarryOverride = false; inputs.carryOverridePct = 0.0; for (const s of slots) { s.carryEnabled = false; s.carryWiReversionPct = 0.0; } }
  return { slots, inputs };
}

// ---------------------------------------------------------------------------
// Grid execution
// ---------------------------------------------------------------------------
export interface SensitivityGrid {
  spec: SensitivitySpec;
  /** irr[yIndex][xIndex], null where the run failed. */
  irr: (number | null)[][];
  moic: (number | null)[][];
}

export function runTwoWaySensitivity(base: SensitivityCase, spec: SensitivitySpec, bases: SensitivityBases, data: EngineData, opts: DealRunOptions = {}): SensitivityGrid {
  const forced = applyForcing(base, spec.forcing);
  const irr: (number | null)[][] = [], moic: (number | null)[][] = [];
  for (const y of spec.yValues) {
    const rowI: (number | null)[] = [], rowM: (number | null)[] = [];
    for (const x of spec.xValues) {
      const c1 = applySensitivityValue(forced, spec.xVariable, x, bases);
      const c2 = applySensitivityValue(c1, spec.yVariable, y, bases);
      try { const r = runDealMetrics(c2.slots, c2.inputs, data, opts); rowI.push(r.irr); rowM.push(r.moic); }
      catch { rowI.push(null); rowM.push(null); }
    }
    irr.push(rowI); moic.push(rowM);
  }
  return { spec, irr, moic };
}

// ---------------------------------------------------------------------------
// Scenario matrix (data only; the UI draws it)
// ---------------------------------------------------------------------------
export const SCENARIO_DC_STEP = 50.0; // $/ft, the actual computed step (labels must say +/- $50)
export const SCENARIO_TC_RISKS = [0.80, 1.00, 1.20];
export const SCENARIO_OIL_STEP = 5.0;
export const SCENARIO_GAS_STEP = 0.25;

export interface ScenarioPoint {
  pricingCase: "Downside" | "Base" | "Upside"; oilPrice: number; gasPrice: number;
  dcCase: "Low" | "Base" | "High"; dcValue: number; dcLabel: string;
  tcRisk: number; bid: number; irr: number | null; moic: number | null;
}

export function runScenarioMatrix(base: SensitivityCase, bases: SensitivityBases, data: EngineData, opts: DealRunOptions = {}): { points: ScenarioPoint[]; dcLabels: Record<string, string>; pricingLabels: Record<string, string> } {
  const bidValues = buildSensitivityRange(bases.baseBid, 500.0, 3, 1.0);
  const dcCases: [ScenarioPoint["dcCase"], number][] = [["Low", bases.baseDc - SCENARIO_DC_STEP], ["Base", bases.baseDc], ["High", bases.baseDc + SCENARIO_DC_STEP]];
  const bo = Number(base.inputs.oilPrice), bg = Number(base.inputs.gasPrice);
  const pricing: [ScenarioPoint["pricingCase"], number, number][] = [
    ["Downside", Math.max(0.0, bo - SCENARIO_OIL_STEP), Math.max(0.0, bg - SCENARIO_GAS_STEP)], ["Base", bo, bg], ["Upside", bo + SCENARIO_OIL_STEP, bg + SCENARIO_GAS_STEP],
  ];
  const dcLabels: Record<string, string> = {};
  for (const [k, v] of dcCases) dcLabels[k] = `${k} ($${Math.round(v).toLocaleString("en-US")}/ft)`;
  const pricingLabels: Record<string, string> = {};
  for (const [k, o, g] of pricing) pricingLabels[k] = `${k} (Oil ${o.toFixed(0)} / Gas ${g.toFixed(2)})`;
  const points: ScenarioPoint[] = [];
  for (const [pname, op, gp] of pricing) for (const [dlabel, dval] of dcCases) for (const tc of SCENARIO_TC_RISKS) for (const bid of bidValues) {
    const inputs: DealInputs = { ...base.inputs, oilPrice: op, gasPrice: gp, useBidOverride: true, bidOverride: bid, useDcOverride: true, dcOverride: dval };
    const slots = base.slots.map((s) => ({ ...s, tcRisk: tc }));
    let irr: number | null = null, moic: number | null = null;
    try { ({ irr, moic } = runDealMetrics(slots, inputs, data, opts)); } catch { /* keep nulls */ }
    points.push({ pricingCase: pname, oilPrice: op, gasPrice: gp, dcCase: dlabel, dcValue: dval, dcLabel: dcLabels[dlabel], tcRisk: tc, bid, irr, moic });
  }
  return { points, dcLabels, pricingLabels };
}
