/** Full-cycle slot returns: each standalone slot run reported with its cash-flow components.
 *  The returns must be the validated standalone returns unchanged, the components must add up,
 *  and the acquisition must be in the cash flows the returns are computed on. */
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";
import { deck, lib } from "./adapters";
import { runDeal, runStandaloneSlots, runStandaloneSlotReturns, fullCycleSummary, dealSummary } from "../engine/index";
import { xirr, moic } from "../engine/returns";
import { fullCycleCsv } from "../ui/format/csv";
const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? "  (" + d + ")" : ""}`); if (!ok) failures++; };
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log("\nFull-cycle slot returns");
for (const c of ["C11", "C12"]) {
  const L0 = loadJson(c, "L00_inputs.json"); const L10 = loadJson(c, "L10_returns.json");
  const deal = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const slots = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame);

  // 1. Same numbers as the validated standalone returns, full life and on the legacy calendar the fixture uses.
  const runs = runStandaloneSlots(slots, deal, data);
  const st = runStandaloneSlotReturns(slots, deal, data);
  const legacy = runStandaloneSlots(slots, deal, data, { calendarMonths: 360 });
  for (const s of slots) {
    const f = fullCycleSummary(runs[s.slotId]!);
    check(`${c} slot ${s.slotId}: IRR and MOIC identical to standalone returns`, f.irr === st[s.slotId].irr && f.moic === st[s.slotId].moic, `${f.irr} vs ${st[s.slotId].irr}`);
    const fl = fullCycleSummary(legacy[s.slotId]!); const py = L10.standalone_slot_returns[String(s.slotId)];
    check(`${c} slot ${s.slotId}: legacy-calendar IRR / MOIC match the Python fixture`, near(fl.irr!, py.irr, 1e-8) && near(fl.moic!, py.moic, 1e-9), `${fl.irr} vs python ${py.irr}`);

    // 2. Components: acquisition is net acres x the bid (the deal override when set, C12); the walk adds up.
    const bid = Math.max(1, deal.useBidOverride ? deal.bidOverride : s.bidPerAcre);
    check(`${c} slot ${s.slotId}: acquisition = net acres x bid${deal.useBidOverride ? " override" : ""}`, near(f.acquisition, s.netAcres * bid) && f.acquisition > 0, `${f.acquisition} vs ${s.netAcres} x ${bid}`);
    check(`${c} slot ${s.slotId}: operating CF = revenue - LOE and taxes`, near(f.operatingCashFlow, f.revenue - f.operatingCosts), `${f.operatingCashFlow} vs ${f.revenue - f.operatingCosts}`);
    check(`${c} slot ${s.slotId}: net CF = operating CF - D&C - acquisition`, near(f.netCashFlow, f.operatingCashFlow - f.dncCapex - f.acquisition), `${f.netCashFlow}`);

    // 3. Counterfactual: the returns move when the acquisition is taken out, so it is in the series they use.
    const rows = runs[s.slotId]!.deal.rows;
    const months = rows.map((r) => r.month), noAcq = rows.map((r) => r.slotTotalCashFlow - r.slotAssetPurchase);
    const halfIrr = xirr(months, noAcq)!, halfMoic = moic(noAcq)!;
    check(`${c} slot ${s.slotId}: removing acquisition raises IRR and MOIC`, halfIrr > f.irr! && halfMoic > f.moic!, `full ${f.irr!.toFixed(4)} / ${f.moic!.toFixed(3)}x vs ex-acq ${halfIrr.toFixed(4)} / ${halfMoic.toFixed(3)}x`);
  }

  // 4. Whole-deal row: the base run's own returns and totals; with no shared payout group the slots add up to it.
  const base = runDeal(slots, deal, data); const whole = fullCycleSummary(base); const ds = dealSummary(base);
  check(`${c} whole deal: returns are the base run's`, whole.irr === base.irr && whole.moic === base.moic && whole.paybackYears === base.payback.paybackYears);
  check(`${c} whole deal: acquisition and D&C equal the deal summary`, near(whole.acquisition, ds.totalAcquisition) && near(whole.dncCapex, ds.totalDncCapex));
  const shared = new Set(slots.filter((s) => s.dalePromote).map((s) => s.dalePayoutGroup)).size < slots.filter((s) => s.dalePromote).length;
  const sum = slots.reduce((a, s) => a + fullCycleSummary(runs[s.slotId]!).netCashFlow, 0);
  check(`${c} whole deal: slot net cash flows add up to the deal (no shared payout group)`, !shared && near(sum, whole.netCashFlow), `${sum} vs ${whole.netCashFlow}`);
}

// 5. A slot whose run fails is null, not a thrown error, and the other slots still report.
{
  const L0 = loadJson("C11", "L00_inputs.json");
  const deal = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
  const slots = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame).map((s) => (s.slotId === 2 ? { ...s, nglProfileId: "missing" } : s));
  const runs = runStandaloneSlots(slots, deal, data);
  check("failed slot run is null; other slots still run", runs[2] === null && runs[1] !== null && runs[3] !== null);

  // 6. CSV: header, one row per slot plus the whole deal, costs signed negative, failed slot left blank.
  const table = slots.map((s) => ({ label: String(s.slotId), unit: s.daleUnitId, summary: runs[s.slotId] ? fullCycleSummary(runs[s.slotId]!) : null }));
  const lines = fullCycleCsv(table).trim().split("\n");
  const head = lines[0].split(",");
  check("CSV header carries the full-cycle columns", head.includes("Acquisition") && head.includes("Full-Cycle IRR") && head.includes("Full-Cycle MOIC"), lines[0]);
  const row1 = lines[1].split(","); const f1 = table[0].summary!;
  check("CSV slot 1 row: acquisition negative, IRR raw", Number(row1[head.indexOf("Acquisition")]) === -f1.acquisition && Number(row1[head.indexOf("Full-Cycle IRR")]) === f1.irr, lines[1]);
  check("CSV failed slot row is label and unit only", lines[2] === `2,${table[1].unit}`, lines[2]);
}

if (failures) { console.error(`\n${failures} full-cycle check(s) failed`); process.exit(1); }
console.log("  full-cycle slot returns: all checks passed");
