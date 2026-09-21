import { compareRecords, frameToRecords, goldenCases, loadJson, printModuleReport, type CaseReport, type Frame } from "./harness";
import { buildCase } from "./pipeline";
import { aggregatePythonByMonth, alignedFrameToPython, promoteExtra, PY_FLOW_COLS, scheduleToPython } from "./adapters";
import { applyPromote } from "../engine/promote";
import { monthToIso } from "../engine/months";

const DIAG = new Set(["C09a", "C09b"]);
const sched: CaseReport[] = []; const slots: CaseReport[] = []; const diag: CaseReport[] = []; const full: CaseReport[] = [];
const notes: string[] = [];
for (const c of goldenCases()) {
  const isFL = c === "C07-FL";
  const { cal, ds } = buildCase(c, isFL ? {} : { calendarMonths: 360 });
  const pr = applyPromote(cal, ds);
  // L07
  const L7 = loadJson(c, "L07_promote_schedule.json");
  const f7 = L7.schedule as Frame;
  const exp7 = f7.columns ? frameToRecords(f7) : [];
  let act7 = scheduleToPython(pr.schedule);
  if (isFL) act7 = act7; // engine horizon shorter than the 600-month fixture; compare overlap below
  const exp7cmp = isFL ? exp7.filter((r) => r.date <= monthToIso(cal.calendarEnd)) : exp7;
  const res7 = compareRecords(act7, exp7cmp, f7.columns ?? []);
  if (!f7.columns) { res7.ok = act7.length === 0; if (!res7.ok) res7.notes.push("engine produced a schedule where Python has none"); }
  (isFL ? full : DIAG.has(c) ? diag : sched).push({ caseName: c, unit: "L07_schedule", result: res7 });
  if (pr.enabled) {
    const groups = [...new Set(pr.schedule.map((r) => r.payoutGroup))];
    for (const gname of groups) {
      const r0 = pr.schedule.find((r) => r.payoutGroup === gname)!;
      notes.push(`${c} group ${gname}: hurdle ${r0.hurdleDate == null ? "never" : monthToIso(r0.hurdleDate)}, effective ${r0.effectiveDate == null ? "never" : monthToIso(r0.effectiveDate)}, final multiple ${pr.schedule.filter((r) => r.payoutGroup === gname).at(-1)!.runningMultiple.toFixed(4)}`);
    }
  }
  // L08
  const f8 = loadJson(c, "L08_all_slots_post_promote.json") as Frame;
  const exp8 = aggregatePythonByMonth(frameToRecords(f8), PY_FLOW_COLS);
  for (const sf of pr.slots) {
    let e = exp8.filter((r) => r.slot_id === sf.constants.slotId);
    if (isFL) e = e.filter((r) => r.date <= monthToIso(cal.calendarEnd));
    const a = alignedFrameToPython(sf, (r) => promoteExtra(r as any));
    const res = compareRecords(a, e, f8.columns);
    (isFL ? full : DIAG.has(c) ? diag : slots).push({ caseName: c, unit: `L08_slot_${sf.constants.slotId}`, result: res });
  }
}
const ok1 = printModuleReport("promote schedule (L07) parity", sched, notes);
const ok2 = printModuleReport("promote applied to slots (L08) parity", slots, [
  "active rows scale net volumes, revenues, LOE, tax, operating profit and base D&C by (1 - reversion); slotPromoteOcf, Dale carry capex and acquisition are not scaled",
  "schedule fields merge onto every slot sharing the payout-group name (Python behavior preserved; validation deferred)",
  "C08 (never reaches payout) reconciles against the pandas 2.2.3 fixture: all flags false, null dates, no scaling. The engine has no exception path here",
]);
const ok3 = printModuleReport("promote (L07/L08) full-life vs C07-FL (P2)", full, ["compared on the engine's calculation horizon; fixture months beyond it are all-zero flows (asserted in the calendar test)"]);
printModuleReport("promote (L08) diagnostic C09a/C09b (expected divergence)", diag, ["flowbackDelay = 0 row duplication in Python; see calendar report"]);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
