/**
 * Expected-behavior regression: flowbackDelay = 0 means exactly zero delay.
 * One spud-month D&C event, one first-production month, no duplicated month
 * anywhere (calendar, promote, rollup), acquisition booked once. Guards
 * against re-introducing the Python reference's join/re-merge duplication.
 */
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";
import { deck, lib } from "./adapters";
import { runDeal } from "../engine/deal";
import { monthToIso } from "../engine/months";

const data = { typeCurves: lib, priceDeck: deck };
const L0 = loadJson("C01", "L00_inputs.json");
const inputs = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
const baseSlot = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame)[0];
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
const approx = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

for (const [label, spud] of [["spud == effective", inputs.effectiveDate], ["spud before effective", "2026-07-01"]] as const) {
  console.log(`\nflowbackDelay = 0, ${label} (spud ${spud})`);
  const s0 = { ...baseSlot, drillingSpudMonth: spud, flowbackDelay: 0 };
  const s1 = { ...baseSlot, drillingSpudMonth: spud, flowbackDelay: 1 };
  const r0 = runDeal([s0], inputs, data); const r1 = runDeal([s1], inputs, data);
  const sf = r0.promote.slots[0]; const months = sf.rows.map((r) => r.month);
  check("calendar months are unique", new Set(months).size === months.length);
  const spudRow = sf.rows.find((r) => r.month === sf.spudMonth)!;
  check("spud month has exactly one aligned row aggregating two well rows", spudRow.wellRowCount === 2 && sf.rows.filter((r) => r.month === sf.spudMonth).length === 1);
  check("spud month period is 1 (first production) with D&C present", spudRow.period === 1 && spudRow.slotCapex < 0);
  const well = r0.slots[0].well;
  check("single-well frame: period 0 and period 1 share the spud month", well.rows[0].month === well.rows[1].month && well.rows[0].period === 0 && well.rows[1].period === 1);
  const oneWellCapex = well.rows[0].capex * sf.constants.grPartiesNetWells;
  check("D&C booked exactly once", approx(spudRow.slotCapex, oneWellCapex), `${spudRow.slotCapex} vs ${oneWellCapex}`);
  const totalCapex0 = sf.rows.reduce((s, r) => s + r.slotCapex, 0), totalCapex1 = r1.promote.slots[0].rows.reduce((s, r) => s + r.slotCapex, 0);
  check("total D&C equals the flowbackDelay = 1 run", approx(totalCapex0, totalCapex1));
  const acqRows = sf.rows.filter((r) => r.slotAssetPurchase !== 0);
  check("acquisition booked exactly once, on the effective month", acqRows.length === 1 && monthToIso(acqRows[0].month) === inputs.effectiveDate && approx(acqRows[0].slotAssetPurchase, -sf.constants.acquisitionCost));
  const prod0 = sf.rows.reduce((s, r) => s + r.slotGrossOilProduction, 0), prod1 = r1.promote.slots[0].rows.reduce((s, r) => s + r.slotGrossOilProduction, 0);
  check("total production equals the flowbackDelay = 1 run (no duplicated month)", approx(prod0, prod1, 1e-6), `${prod0} vs ${prod1}`);
  check("first production month is the spud month", approx(spudRow.slotGrossOilProduction, well.rows[1].grossOilProduction * sf.constants.grossWells));
  const dealSpud = r0.deal.allRows.find((r) => r.month === sf.spudMonth)!;
  check("deal rollup spud month = operating profit + D&C + acquisition (once each)", approx(dealSpud.slotTotalCashFlow, spudRow.slotOperatingProfit + spudRow.slotCapex + spudRow.slotAssetPurchase));
  check("deal rollup has one row per month", new Set(r0.deal.allRows.map((r) => r.month)).size === r0.deal.allRows.length);
  check("IRR is finite and higher than the 1-month-delay run (earlier production, same capital)", r0.irr !== null && r1.irr !== null && r0.irr > r1.irr, `${r0.irr} vs ${r1.irr}`);
}
console.log(failures ? `\n${failures} regression check(s) FAILED` : "\nflowbackDelay = 0 regression: all checks passed");
process.exit(failures ? 1 : 0);
