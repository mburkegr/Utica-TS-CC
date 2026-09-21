import { compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, rootManifest, type CaseReport, type Frame } from "./harness";
import { buildCase } from "./pipeline";
import { aggregatePythonByMonth, alignedFrameToPython, PY_FLOW_COLS } from "./adapters";
import { monthToIso } from "../engine/months";

const manifest = rootManifest();
// C09a: Python quadruples the spud month when flowbackDelay = 0 (duplicate rows from the left join, then the
// index-price re-merge). Golden through L05; documented divergence from L06 onward, like C09b.
const CALENDAR_DIAGNOSTIC = new Set(["C09a", "C09b"]);
const parity: CaseReport[] = []; const diagnostic: CaseReport[] = []; const fullLife: CaseReport[] = [];
const notes: string[] = [];

for (const c of goldenCases()) {
  if (c === "C07-FL") continue;
  const { cal } = buildCase(c, { calendarMonths: 360 });        // legacy parity switch
  const f = loadJson(c, "L06_aligned_slots_with_acquisition.json") as Frame;
  const pyRows = frameToRecords(f);
  const expectedAll = aggregatePythonByMonth(pyRows, PY_FLOW_COLS);
  if (CALENDAR_DIAGNOSTIC.has(c)) {
    const spud = pyRows.filter((r) => r.date === pyRows[0].date && r.period !== undefined);
    const byDate = new Map<string, number>(); for (const r of pyRows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
    const dup = [...byDate.entries()].filter(([, n]) => n > 1);
    notes.push(`${c}: Python L06 has ${pyRows.length} rows; duplicated months ${JSON.stringify(dup)} (engine: one row per month)`);
  }
  for (const af of cal.slots) {
    const expected = expectedAll.filter((r) => r.slot_id === af.constants.slotId);
    const res = compareRecords(alignedFrameToPython(af), expected, f.columns);
    const rep = { caseName: c, unit: `slot_${af.constants.slotId}`, result: res };
    (CALENDAR_DIAGNOSTIC.has(c) ? diagnostic : parity).push(rep);
  }
}

// Full-life: default horizon vs the monkeypatched C07-FL reference (600-month calendar, zeros beyond life).
{
  const { cal } = buildCase("C07-FL");
  const f = loadJson("C07-FL", "L06_aligned_slots_with_acquisition.json") as Frame;
  const exp = frameToRecords(f);
  notes.push(`C07-FL: engine calculation horizon ${monthToIso(cal.calendarStart)} .. ${monthToIso(cal.calendarEnd)} (${cal.months.length} months); fixture calendar has ${exp.length / cal.slots.length} months per slot`);
  for (const af of cal.slots) {
    const e = exp.filter((r) => r.slot_id === af.constants.slotId);
    const overlap = e.filter((r) => r.date <= monthToIso(cal.calendarEnd));
    const beyond = e.filter((r) => r.date > monthToIso(cal.calendarEnd));
    const res = compareRecords(alignedFrameToPython(af), overlap, f.columns);
    const tailNonzero = beyond.filter((r) => [...PY_FLOW_COLS].some((col) => Math.abs(Number(r[col] ?? 0)) > 0)).length;
    if (tailNonzero) { res.ok = false; res.notes.push(`${tailNonzero} fixture rows beyond the engine horizon carry nonzero flows`); }
    fullLife.push({ caseName: "C07-FL", unit: `slot_${af.constants.slotId}`, result: res });
  }
}

const okP = printModuleReport("calendar (L06) parity, calendarMonths=360", parity, [
  "Python duplicate (slot,date) rows from flowbackDelay=0 (C09a) are collapsed to month level in the fixture before comparison; the engine aggregates by month natively",
  "months without well data: numeric slot constants reproduce Python's fillna(0) artifact in the adapter only; the engine keeps true constants",
  ...notes,
]);
const okF = printModuleReport("calendar (L06) full-life vs C07-FL (P2 reference)", fullLife, [
  "engine default horizon = last month of the latest slot's full curve; fixture rows beyond it are asserted to be all-zero flows",
]);
printModuleReport("calendar (L06) diagnostic (C09a, C09b: flowbackDelay = 0, expected divergence, not a parity result)", diagnostic, [
  "Python: left join duplicates the spud month (period 0 and period 1 rows), then the index-price re-merge duplicates again -> 4 rows; capex and first-month production are 2x in the rollup, acquisition 2x when spud = effective (C09b)",
  "engine: one row per month; flows summed once; acquisition booked once. Mismatches shown here are that divergence",
]);
process.exit(okP && okF ? 0 : 1);
