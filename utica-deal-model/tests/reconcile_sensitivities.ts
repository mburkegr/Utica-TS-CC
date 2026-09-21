import { compareRecords, frameToRecords, loadJson, printModuleReport, toDealInputs, toSlotInputs, type CaseReport, type Frame } from "./harness";
import { deck, lib } from "./adapters";
import { applySensitivityValue, buildCarryEntrySpecs, buildStandardSpecs, computeBases, runScenarioMatrix, runTwoWaySensitivity, type SensitivitySpec } from "../engine/sensitivities";
import { monthToIso, parseMonth } from "../engine/months";
import { runDeal } from "../engine/deal";

const data = { typeCurves: lib, priceDeck: deck };
const OPTS = { calendarMonths: 360 }; // legacy parity: Python sensitivities run on the 360-month calendar
const basesRep: CaseReport[] = []; const gridRep: CaseReport[] = []; const scenRep: CaseReport[] = []; const notes: string[] = [];
const irrTol = (c: string) => c.startsWith("irr") ? { atol: 1e-8, rtol: 0 } : c.startsWith("moic") ? { atol: 1e-9, rtol: 1e-9 } : c.includes("date") || c.includes("spud") ? { atol: 0, rtol: 0, kind: "date" as const } : { atol: 1e-10, rtol: 0 };

function axisToPy(v: (number)[], variable: string) { return variable === "spud_date" ? v.map((m) => monthToIso(m)) : v; }

function compareGrid(c: string, key: string, spec: SensitivitySpec, grid: { irr: (number|null)[][]; moic: (number|null)[][] }, exp: any) {
  // axes
  const ax: Record<string, any> = {}, ex: Record<string, any> = {};
  axisToPy(spec.xValues as number[], spec.xVariable).forEach((v, i) => { ax[`x_${i}`] = v; ex[`x_${i}`] = spec.xVariable === "spud_date" ? String(exp.x_values[i]).slice(0, 10) : exp.x_values[i]; });
  axisToPy(spec.yValues as number[], spec.yVariable).forEach((v, i) => { ax[`y_${i}`] = v; ex[`y_${i}`] = exp.y_values[i]; });
  ax.x_variable = spec.xVariable; ex.x_variable = exp.x_variable; ax.y_variable = spec.yVariable; ex.y_variable = exp.y_variable;
  const axesRes = compareRecords([ax], [ex], Object.keys(ax), { tol: (col) => col.includes("spud") || (col.startsWith("x_") && spec.xVariable === "spud_date") ? { atol: 0, rtol: 0, kind: "exact" } : col.endsWith("variable") ? { atol: 0, rtol: 0, kind: "exact" } : { atol: 1e-10, rtol: 0 } });
  gridRep.push({ caseName: c, unit: `${key}/axes`, result: axesRes });
  // cells: fixture frames have index = y values, columns = x values, in order
  const eIrr = exp.irr as Frame, eMoic = exp.moic as Frame;
  const actual: Record<string, any>[] = [], expected: Record<string, any>[] = [];
  for (let yi = 0; yi < spec.yValues.length; yi++) for (let xi = 0; xi < spec.xValues.length; xi++) {
    actual.push({ irr: grid.irr[yi][xi], moic: grid.moic[yi][xi] });
    expected.push({ irr: eIrr.rows[yi][xi], moic: eMoic.rows[yi][xi] });
  }
  gridRep.push({ caseName: c, unit: `${key}/cells`, result: compareRecords(actual, expected, ["irr", "moic"], { tol: irrTol }) });
}

for (const c of ["C11", "C12"]) {
  const L0 = loadJson(c, "L00_inputs.json");
  const inputs = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const slots = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame);
  const L12 = loadJson(c, "L12_sensitivities.json");
  const base = { slots, inputs };
  const baseSnapshot = JSON.stringify(base);
  const baseRun = runDeal(slots, inputs, data, OPTS);

  const toggleSets: [string, { useTcRiskAsMain?: boolean; useDcPctSteps?: boolean }][] = [["toggles_off", {}], ["tc_risk_as_main", { useTcRiskAsMain: true }], ["dc_pct_steps", { useDcPctSteps: true }]];
  for (const [name, tg] of toggleSets) {
    const eb = L12.bases[name]; if (!eb) continue;
    const b = computeBases(slots, inputs, tg);
    const act: Record<string, any> = { base_dc: b.baseDc, base_bid: b.baseBid, base_tc_risk: b.baseTcRisk, base_ngl_yield: b.baseNglYield, base_spud_month: monthToIso(b.baseSpudMonth) };
    const exp: Record<string, any> = { base_dc: eb.base_dc, base_bid: eb.base_bid, base_tc_risk: eb.base_tc_risk, base_ngl_yield: eb.base_ngl_yield, base_spud_month: String(eb.base_spud_month).slice(0, 10) };
    const lists: [string, number[], any[]][] = [["bid_values", b.bidValues, eb.bid_values], ["tc_risk_values", b.tcRiskValues, eb.tc_risk_values], ["dc_values", b.dcValues, eb.dc_values], ["oil_values", b.oilValues, eb.oil_values], ["gas_values", b.gasValues, eb.gas_values], ["ngl_yield_values", b.nglYieldValues, eb.ngl_yield_values], ["carry_sens_values", b.carrySensValues, eb.carry_sens_values], ["bid_sens_values", b.bidSensValues, eb.bid_sens_values]];
    for (const [k, a, e] of lists) a.forEach((v, i) => { act[`${k}_${i}`] = v; exp[`${k}_${i}`] = e[i]; });
    b.spudDateValues.forEach((m, i) => { act[`spud_date_values_${i}`] = monthToIso(m); exp[`spud_date_values_${i}`] = String(eb.spud_date_values[i]).slice(0, 10); });
    basesRep.push({ caseName: c, unit: name, result: compareRecords([act], [exp], Object.keys(act), { tol: (col) => col.includes("spud") ? { atol: 0, rtol: 0, kind: "exact" } : { atol: 1e-10, rtol: 0 } }) });
  }

  // grids
  const b0 = computeBases(slots, inputs, {});
  const specs0 = [...buildStandardSpecs(b0, inputs, {}), ...buildCarryEntrySpecs(b0)];
  const bTc = computeBases(slots, inputs, { useTcRiskAsMain: true }); const specsTc = buildStandardSpecs(bTc, inputs, { useTcRiskAsMain: true });
  const bPct = computeBases(slots, inputs, { useDcPctSteps: true }); const specsPct = buildStandardSpecs(bPct, inputs, { useDcPctSteps: true });
  for (const key of Object.keys(L12.grids)) {
    const exp = L12.grids[key];
    let spec: SensitivitySpec | undefined, bases = b0;
    if (key.endsWith("__tc_risk_as_main")) { spec = specsTc.find((s) => s.key === key.replace("__tc_risk_as_main", "")); bases = bTc; }
    else if (key.endsWith("__dc_pct_steps")) { spec = specsPct.find((s) => s.key === key.replace("__dc_pct_steps", "")); bases = bPct; }
    else spec = specs0.find((s) => s.key === key);
    if (!spec) { gridRep.push({ caseName: c, unit: key, result: { ok: false, rowsCompared: 0, columns: {}, mismatches: [], maxAbs: 0, maxRel: 0, notes: ["spec not built by engine"] } }); continue; }
    const t0 = Date.now();
    const grid = runTwoWaySensitivity(base, spec, bases, data, OPTS);
    compareGrid(c, key, spec, grid, exp);
    notes.push(`${c}/${key}: ${spec.yValues.length}x${spec.xValues.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // scenario matrix
  if (L12.scenario_matrix) {
    const sm = runScenarioMatrix(base, b0, data, OPTS);
    const ef = L12.scenario_matrix.rows as Frame; const e = frameToRecords(ef);
    const a = sm.points.map((p) => ({ pricing_case: p.pricingCase, oil_price: p.oilPrice, gas_price: p.gasPrice, dc_case: p.dcCase, dc_value: p.dcValue, tc_risk: p.tcRisk, bid: p.bid, irr: p.irr, moic: p.moic }));
    scenRep.push({ caseName: c, unit: "scenario_matrix", result: compareRecords(a, e, ef.columns, { tol: (col) => ["pricing_case", "dc_case"].includes(col) ? { atol: 0, rtol: 0, kind: "exact" } : irrTol(col) }) });
    notes.push(`${c} scenario D&C labels (engine): ${JSON.stringify(sm.dcLabels)}  | Python figure legend had: ${JSON.stringify(L12.scenario_matrix.labels.figure_dc_legend_labels)}`);
  }

  // non-mutation and base-case isolation
  const afterSnapshot = JSON.stringify(base);
  const baseRun2 = runDeal(slots, inputs, data, OPTS);
  const isolation = compareRecords([{ inputs_unchanged: afterSnapshot === baseSnapshot, base_irr_after: baseRun2.irr, base_moic_after: baseRun2.moic }], [{ inputs_unchanged: true, base_irr_after: baseRun.irr, base_moic_after: baseRun.moic }], ["inputs_unchanged", "base_irr_after", "base_moic_after"], { tol: (col) => col === "inputs_unchanged" ? { atol: 0, rtol: 0, kind: "bool" } : { atol: 0, rtol: 0 } });
  basesRep.push({ caseName: c, unit: "base_case_isolation", result: isolation });
}
const ok1 = printModuleReport("sensitivities: weighted bases and axes (L12.bases) + base-case isolation", basesRep, [
  "weighted spud month uses round-half-even (Python round()); axis rounding to 10 (or 2) decimals as in app.py",
  "base_case_isolation: base inputs are byte-identical after all sensitivity runs and the base-case IRR/MOIC re-runs unchanged",
]);
const ok2 = printModuleReport("sensitivities: two-way grids (L12.grids)", gridRep, notes.filter((n) => n.includes("runs in")));
const ok3 = printModuleReport("sensitivities: scenario matrix (L12.scenario_matrix)", scenRep, [
  "computed D&C cases are base +/- $50/ft; engine labels say so (Python legend text said +/- $100)",
  ...notes.filter((n) => n.includes("labels")),
]);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
