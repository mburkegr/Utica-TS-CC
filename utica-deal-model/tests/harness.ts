/**
 * Reconciliation harness shared by the per-module tests.
 * Loads Python golden fixtures, adapts the app-level inputs to engine types,
 * and compares engine output to fixture frames using the documented tolerances.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DealInputs, SlotInput, NglComponents } from "../engine/types";
import { monthToIso, type MonthIndex } from "../engine/months";

export const FIXTURE_ROOT = process.env.FIXTURE_ROOT ?? "/mnt/user-data/outputs/utica_fixtures";

export interface Frame {
  type: "dataframe";
  columns: string[];
  dtypes: Record<string, string>;
  rows: unknown[][];
  shape: [number, number];
}

export function loadJson(caseName: string, file: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, caseName, file), "utf8"));
}

export function rootManifest(): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, "manifest.json"), "utf8"));
}

export function frameToRecords(f: Frame): Record<string, any>[] {
  return f.rows.map((r) => {
    const o: Record<string, any> = {};
    f.columns.forEach((c, i) => (o[c] = r[i]));
    return o;
  });
}

// ---------------------------------------------------------------------------
// Adapters: Python app dicts -> engine inputs
// ---------------------------------------------------------------------------
function comps(d: any, prefix: string): NglComponents {
  return {
    ethane: d[`${prefix}_ethane`],
    propane: d[`${prefix}_propane`],
    isobutane: d[`${prefix}_isobutane`],
    butane: d[`${prefix}_butane`],
    pentanes: d[`${prefix}_pentanes`],
  };
}

export function toDealInputs(d: any): DealInputs {
  return {
    effectiveDate: d.effective_date,
    pricingMode: d.pricing_mode,
    oilPrice: d.oil_price,
    gasPrice: d.gas_price,
    baseOilPrice: d.base_oil_price,
    baseGasPrice: d.base_gas_price,
    oilFlatStartDate: d.oil_flat_start_date,
    gasFlatStartDate: d.gas_flat_start_date,
    useDcOverride: d.use_dc_override,
    dcOverride: d.dc_override,
    useBidOverride: d.use_bid_override,
    bidOverride: d.bid_override,
    useCarryOverride: d.use_carry_override,
    carryOverridePct: d.carry_override_pct,
    useSevTaxPct: d.use_sev_tax_pct,
    oilSevTax: d.oil_sev_tax,
    gasSevTax: d.gas_sev_tax,
    adValTax: d.ad_val_tax,
    ethaneRec: d.ethane_rec,
    content: comps(d, "content"),
    recoverEthane: comps(d, "rec"),
    rejectEthane: comps(d, "rej"),
    nglShrink: comps(d, "shrink"),
    nglPrices: comps(d, "price"),
    daleInitialInterestPct: d.dale_initial_interest_pct,
    promoteEnabled: d.promote_enabled,
    promoteWiReversionPct: d.promote_wi_reversion_pct,
    promoteMultiple: d.promote_multiple,
    useTcRiskAsMainSensitivity: d.use_tc_risk_as_main_sensitivity,
    useDcPctSensitivity: d.use_dc_pct_sensitivity,
  };
}

export function toSlotInputs(frame: Frame): SlotInput[] {
  return frameToRecords(frame).map((r) => ({
    slotId: r.slot_id,
    tcName: r.tc_name,
    grossWells: r.gross_wells,
    netAcres: r.net_acres,
    unitAcres: r.unit_acres,
    useCalcUnitAcres: r.use_calc_unit_acres,
    pctUnitized: r.pct_unitized,
    drillingSpudMonth: r.drilling_spud_month,
    flowbackDelay: r.flowback_delay,
    netRevenueInterest: r.net_revenue_interest,
    lateralLength: r.lateral_length,
    dcCosts: r.dc_costs,
    tcRisk: r.tc_risk,
    bidPerAcre: r.bid_per_acre,
    oilDiff: r.oil_diff,
    gasDiff: r.gas_diff,
    oilOpexBbl: r.oil_opex_bbl,
    gasOpexMcf: r.gas_opex_mcf,
    nglOpex: r.ngl_opex,
    fixedLoe: r.fixed_loe,
    nglYield: r.ngl_yield,
    dalePromote: r.dale_promote,
    daleUnitId: r.dale_unit_id,
    dalePayoutGroup: r.dale_payout_group,
    daleFirstWellCarry: r.dale_first_well_carry,
    carryEnabled: r.carry_enabled,
    carryWiReversionPct: r.carry_wi_reversion_pct,
  }));
}

// ---------------------------------------------------------------------------
// Tolerances (TOLERANCES.md)
// ---------------------------------------------------------------------------
export interface Tol { atol: number; rtol: number; kind?: "exact" | "date" | "bool" }

const RULES: [RegExp, Tol][] = [
  [/^(period|slot_id|flowback_delay|lateral_length)$/, { atol: 0, rtol: 0, kind: "exact" }],
  [/(^date$|_date$|spud_month$)/, { atol: 0, rtol: 0, kind: "date" }],
  [/^(economic_limit_reached|well_shut_in|carry_reversion_active|promote_hurdle_reached|promote_active|dale_promote|dale_first_well_carry|carry_enabled|use_calc_unit_acres)$/, { atol: 0, rtol: 0, kind: "bool" }],
  [/(working_interest|ownership_factor|net_wells|dale_initial_interest_pct|carry_wi_reversion_pct|promote_wi_reversion_pct|pct_unitized|net_revenue_interest)/, { atol: 1e-12, rtol: 1e-12 }],
  [/^(shrink|ngl_pct_of_wti|sales_volume_factor|shrink_contribution|aggregate_ngl_price|implied_ngl_content|content_pct|recovery_pct|shrink_factor|component_price)$/, { atol: 1e-12, rtol: 1e-12 }],
  [/(index_.*_price|local_.*_price|deck_.*_price|bid_price_final|bid_per_acre)/, { atol: 1e-9, rtol: 1e-12 }],
  [/(production|royalty_volumes|_scaled$|boe$)/, { atol: 1e-9, rtol: 1e-9 }],
  [/(revenue|loe|opex|tax|capex|cash_flow|operating_cf|acquisition_cost|promote_ocf|asset_purchase)/, { atol: 1e-6, rtol: 1e-9 }],
];
const DEFAULT_TOL: Tol = { atol: 1e-9, rtol: 1e-9 };

export function toleranceFor(col: string): Tol {
  for (const [re, t] of RULES) if (re.test(col)) return t;
  return DEFAULT_TOL;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
export interface Mismatch { column: string; row: number; expected: any; actual: any; absDiff: number; relDiff: number }
export interface ColumnStat { compared: number; maxAbs: number; maxRel: number; mismatches: number }
export interface CompareResult {
  ok: boolean;
  rowsCompared: number;
  columns: Record<string, ColumnStat>;
  mismatches: Mismatch[];
  maxAbs: number;
  maxRel: number;
  notes: string[];
}

export function compareRecords(
  actual: Record<string, any>[],
  expected: Record<string, any>[],
  columns: string[],
  opts: { tol?: (c: string) => Tol; ignore?: string[] } = {},
): CompareResult {
  const tolFor = opts.tol ?? toleranceFor;
  const res: CompareResult = { ok: true, rowsCompared: 0, columns: {}, mismatches: [], maxAbs: 0, maxRel: 0, notes: [] };
  if (actual.length !== expected.length) {
    res.ok = false;
    res.notes.push(`row count differs: actual ${actual.length} vs expected ${expected.length}`);
  }
  const n = Math.min(actual.length, expected.length);
  res.rowsCompared = n;
  for (const col of columns) {
    if (opts.ignore?.includes(col)) continue;
    const t = tolFor(col);
    const stat: ColumnStat = { compared: 0, maxAbs: 0, maxRel: 0, mismatches: 0 };
    for (let i = 0; i < n; i++) {
      const e = expected[i][col];
      const a = actual[i][col];
      const m = compareValue(a, e, t);
      stat.compared++;
      if (m.absDiff !== undefined) {
        stat.maxAbs = Math.max(stat.maxAbs, m.absDiff);
        stat.maxRel = Math.max(stat.maxRel, m.relDiff ?? 0);
      }
      if (!m.ok) {
        stat.mismatches++;
        res.ok = false;
        if (res.mismatches.length < 200) {
          res.mismatches.push({ column: col, row: i, expected: e, actual: a, absDiff: m.absDiff ?? NaN, relDiff: m.relDiff ?? NaN });
        }
      }
    }
    res.columns[col] = stat;
    res.maxAbs = Math.max(res.maxAbs, stat.maxAbs);
    res.maxRel = Math.max(res.maxRel, stat.maxRel);
  }
  return res;
}

export function compareValue(a: any, e: any, t: Tol): { ok: boolean; absDiff?: number; relDiff?: number } {
  const aNull = a === null || a === undefined || (typeof a === "number" && Number.isNaN(a));
  const eNull = e === null || e === undefined || (typeof e === "number" && Number.isNaN(e));
  if (aNull || eNull) return { ok: aNull && eNull };
  if (t.kind === "exact") return { ok: a === e, absDiff: typeof a === "number" && typeof e === "number" ? Math.abs(a - e) : undefined };
  if (t.kind === "bool") return { ok: Boolean(a) === Boolean(e) };
  if (t.kind === "date") {
    const as = typeof a === "number" ? monthToIso(a as MonthIndex) : String(a).slice(0, 10);
    return { ok: as === String(e).slice(0, 10) };
  }
  if (typeof a === "number" && typeof e === "number") {
    const absDiff = Math.abs(a - e);
    const relDiff = e !== 0 ? absDiff / Math.abs(e) : absDiff === 0 ? 0 : Infinity;
    return { ok: absDiff <= t.atol + t.rtol * Math.abs(e), absDiff, relDiff };
  }
  return { ok: a === e };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
export interface CaseReport { caseName: string; unit: string; result: CompareResult }

export function printModuleReport(module: string, reports: CaseReport[], assumptions: string[] = []) {
  const passed = reports.filter((r) => r.result.ok);
  const failed = reports.filter((r) => !r.result.ok);
  const fmt = (x: number) => (x === 0 ? "0" : x.toExponential(2));
  console.log(`\n=== ${module} reconciliation ===`);
  console.log(`units compared: ${reports.length}   passed: ${passed.length}   failed: ${failed.length}`);
  const byCase = new Map<string, CaseReport[]>();
  for (const r of reports) byCase.set(r.caseName, [...(byCase.get(r.caseName) ?? []), r]);
  for (const [c, rs] of byCase) {
    const ok = rs.every((r) => r.result.ok);
    const maxAbs = Math.max(...rs.map((r) => r.result.maxAbs));
    const maxRel = Math.max(...rs.map((r) => r.result.maxRel));
    const rows = rs.reduce((s, r) => s + r.result.rowsCompared, 0);
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.padEnd(7)} units=${rs.length} rows=${String(rows).padStart(5)}  max|abs|=${fmt(maxAbs)}  max rel=${fmt(maxRel)}`);
  }
  for (const r of failed) {
    console.log(`  --- ${r.caseName}/${r.unit}: ${r.result.mismatches.length} mismatches ${r.result.notes.join("; ")}`);
    for (const m of r.result.mismatches.slice(0, 6)) {
      console.log(`      ${m.column}[${m.row}] expected=${m.expected} actual=${m.actual} abs=${fmt(m.absDiff)} rel=${fmt(m.relDiff)}`);
    }
  }
  if (assumptions.length) {
    console.log("  assumptions / behavior notes:");
    for (const a of assumptions) console.log(`   - ${a}`);
  }
  return failed.length === 0;
}

export function goldenCases(): string[] {
  const m = rootManifest();
  return Object.keys(m.cases).filter((c) => m.cases[c].status === "ok");
}
