/**
 * Reconciliation diagnostic. Takes an inputs JSON exported from the Artifact,
 * runs the TypeScript engine in full-life and 360-month parity mode, runs the
 * pinned Python reference on the same inputs, and reports:
 *   1. full-life IRR/MOIC   2. 360-month IRR/MOIC   3. the difference
 * and, if the parity run still does not match Python, the first month where
 * the deal-level monthly cash-flow series diverge.
 *
 * Usage: npx tsx diagnostics/compare_inputs.ts <inputs.json> [python_deal.json]
 * No methodology is changed; this only reports.
 */
import * as fs from "node:fs";
import { runDeal, monthToIso } from "../engine/index";
import { deck, lib } from "../tests/adapters";
import { prepareRun } from "../ui/adapters/prepareRun";

const data = { typeCurves: lib, priceDeck: deck };
const [, , inputsPath, pythonPath] = process.argv;
if (!inputsPath) { console.error("usage: compare_inputs.ts <inputs.json> [python_deal.json]"); process.exit(2); }
const payload = JSON.parse(fs.readFileSync(inputsPath, "utf8"));
const inputs = payload.inputs ?? payload;
const includeSlot = payload.includeSlot ?? {};
const prep = prepareRun(inputs, { includeSlot });
if (prep.errors.length) { console.error("input validation:", prep.errors.join(" ")); process.exit(2); }

const full = runDeal(prep.slots, prep.deal, data);
const legacy = runDeal(prep.slots, prep.deal, data, { calendarMonths: 360 });
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(3)}%`);
const mult = (x: number | null) => (x === null ? "n/a" : `${x.toFixed(4)}x`);

console.log(`\nDeal: ${payload.dealName ?? "(unnamed)"}   slots: ${prep.slots.length}   pricing: ${prep.deal.pricingMode}`);
console.log("\n1. Full-life (production):      IRR " + pct(full.irr) + "   MOIC " + mult(full.moic) + `   months ${full.deal.rows.length} (${monthToIso(full.deal.calendarStart)} to ${monthToIso(full.deal.economicCalendarEnd)})`);
console.log("2. 360-month parity mode:       IRR " + pct(legacy.irr) + "   MOIC " + mult(legacy.moic) + `   months ${legacy.deal.rows.length} (to ${monthToIso(legacy.deal.rows[legacy.deal.rows.length - 1].month)})`);
console.log("3. Difference (full - 360):     IRR " + (full.irr !== null && legacy.irr !== null ? `${((full.irr - legacy.irr) * 100).toFixed(3)} pts` : "n/a") + "   MOIC " + (full.moic !== null && legacy.moic !== null ? `${(full.moic - legacy.moic).toFixed(4)}x` : "n/a"));

console.log("\nPer-slot detail (parity mode):");
for (const s of legacy.slots) {
  console.log(`  slot ${s.prepared.slotId} ${s.prepared.tcName}: spud ${monthToIso(s.well.spudMonth)}, flowback ${s.prepared.flowbackDelay}, first production ${monthToIso(s.well.productionStartMonth)}, WI ${(s.ownership.workingInterest * 100).toFixed(4)}%, net wells ${s.ownership.netWells.toFixed(5)}, acquisition $${s.ownership.acquisitionCost.toLocaleString("en-US")}, shut-in ${s.well.shutInPeriod ?? "none"}, D&C $${(-s.well.rows[0].capex * s.layered.constants.grPartiesNetWells).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
}

if (pythonPath) {
  // python_deal.json: [{date, slot_total_cash_flow}, ...] or the L09 frame shape.
  const py = JSON.parse(fs.readFileSync(pythonPath, "utf8"));
  const pyRows: { date: string; cf: number }[] = Array.isArray(py)
    ? py.map((r: any) => ({ date: String(r.date).slice(0, 10), cf: Number(r.slot_total_cash_flow ?? r.cf) }))
    : (py.rows as any[][]).map((r) => ({ date: String(r[py.columns.indexOf("date")]).slice(0, 10), cf: Number(r[py.columns.indexOf("slot_total_cash_flow")]) }));
  const tsRows = legacy.deal.rows.map((r) => ({ date: monthToIso(r.month), cf: r.slotTotalCashFlow }));
  console.log(`\nMonthly cash-flow comparison (parity mode): python ${pyRows.length} months, ts ${tsRows.length} months`);
  const pyMap = new Map(pyRows.map((r) => [r.date, r.cf]));
  const tsMap = new Map(tsRows.map((r) => [r.date, r.cf]));
  const months = [...new Set([...pyMap.keys(), ...tsMap.keys()])].sort();
  let first: string | null = null; let shown = 0;
  console.log("  month        python CF        ts CF            diff");
  for (const m of months) {
    const a = pyMap.get(m), b = tsMap.get(m);
    const diff = (b ?? 0) - (a ?? 0);
    if (Math.abs(diff) > 1) {
      if (first === null) first = m;
      if (shown < 15) { console.log(`  ${m}  ${fmt(a)}  ${fmt(b)}  ${fmt(diff)}${a === undefined ? "  [month missing in python]" : b === undefined ? "  [month missing in ts]" : ""}`); shown++; }
    }
  }
  console.log(first === null ? "  no month differs by more than $1" : `\n  FIRST DIVERGENCE: ${first}`);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`  total CF: python ${fmt(sum(pyMap))}  ts ${fmt(sum(tsMap))}  diff ${fmt(sum(tsMap) - sum(pyMap))}`);
  const neg = (m: Map<string, number>) => [...m.values()].filter((v) => v < 0).reduce((a, b) => a + b, 0);
  console.log(`  invested (negative months): python ${fmt(neg(pyMap))}  ts ${fmt(neg(tsMap))}`);
}
function fmt(x: number | undefined): string { return x === undefined ? "        (none)" : x.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(14); }
