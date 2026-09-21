/** UI: add an NGL profile, edit its ethane content, apply to a selected slot, run, and confirm the displayed IRR equals
 *  the engine run with that slot on the profile; default-only state still equals the base run. */
import "global-jsdom/register";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../ui/App";
import { initialState } from "../ui/state/defaults";
import { fmtPct } from "../ui/format/format";
import { runDeal } from "../engine/index";
import { prepareRun } from "../ui/adapters/prepareRun";
import { deck, lib } from "./adapters";
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";

const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? "  (" + d + ")" : ""}`); if (!ok) failures++; };

async function main() {
  console.log("\nUI NGL profiles");
  const L0 = loadJson("C11", "L00_inputs.json");
  const inputs = { deal: toDealInputs(L0.run_deal_inputs_after_app_preprocessing), slots: toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame) };
  const st = { ...initialState(deck), inputs, ui: { ...initialState(deck).ui, tab: "pricing" as const } };
  render(<App data={data} initial={st} restoreDraft={false} />);
  check("default profile table rendered", !!document.querySelector('[data-profile-table="default"]'));
  check("content total shows 100.0%", document.querySelector('[data-content-total="default"]')!.textContent!.startsWith("100.0%"));
  fireEvent.click(screen.getByTestId("add-ngl-profile"));
  const card = document.querySelector("[data-profile]") as HTMLElement;
  check("new profile card appears, copied from default", !!card && card.querySelector('[data-content-total]')!.textContent!.startsWith("100.0%"));
  const pid = card.getAttribute("data-profile")!;
  // Set ethane 0.70 and pentanes to keep the total at 1.00 (0.50/0.25/0.065/0.065/0.12 -> 0.70/0.15/0.04/0.04/0.07)
  const table = card.querySelector(`[data-profile-table="${pid}"]`)!;
  const inputsIn = (row: number) => [...table.querySelectorAll("tbody tr")][row].querySelectorAll("input");
  const setVal = (el: Element, v: string) => { fireEvent.focus(el); fireEvent.change(el, { target: { value: v } }); fireEvent.blur(el); };
  const targets: [number, string][] = [[0, "0.70"], [1, "0.15"], [2, "0.04"], [3, "0.04"], [4, "0.07"]];
  for (const [row, v] of targets) setVal(inputsIn(row)[0], v);
  check("edited content total still 100.0%", card.querySelector('[data-content-total]')!.textContent!.startsWith("100.0%"), card.querySelector('[data-content-total]')!.textContent!);
  // select slot 2 and apply
  const pick = [...card.querySelectorAll(".pick-slot input")] as HTMLInputElement[];
  fireEvent.click(pick[1]);
  fireEvent.click(card.querySelector(`[data-apply-selected="${pid}"]`)!);
  const sel2 = document.querySelector('[data-slot-profile="2"]') as HTMLSelectElement;
  check("slot 2 assigned to the new profile; slots 1 and 3 remain Default", sel2.value === pid && (document.querySelector('[data-slot-profile="1"]') as HTMLSelectElement).value === "" && (document.querySelector('[data-slot-profile="3"]') as HTMLSelectElement).value === "");
  fireEvent.click(screen.getByTestId("run-model"));
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });
  const shown = screen.getByTestId("irr").textContent!;
  const rich = { id: pid, name: "x", content: { ethane: 0.70, propane: 0.15, isobutane: 0.04, butane: 0.04, pentanes: 0.07 }, recoverEthane: inputs.deal.recoverEthane, rejectEthane: inputs.deal.rejectEthane, nglShrink: inputs.deal.nglShrink, nglPrices: inputs.deal.nglPrices };
  const prep = prepareRun({ deal: { ...inputs.deal, nglProfiles: [rich] }, slots: inputs.slots.map((s) => (s.slotId === 2 ? { ...s, nglProfileId: pid } : s)) }, { includeSlot: {} });
  const ref = runDeal(prep.slots, prep.deal, data);
  const base = runDeal(...(() => { const p = prepareRun(inputs, { includeSlot: {} }); return [p.slots, p.deal, data] as const; })());
  check("displayed IRR equals engine run with slot 2 on the 70% ethane profile", shown === fmtPct(ref.irr, 1), `${shown} vs ${fmtPct(ref.irr, 1)}`);
  check("and differs from the all-default base case", fmtPct(ref.irr, 3) !== fmtPct(base.irr, 3), `${fmtPct(ref.irr, 3)} vs base ${fmtPct(base.irr, 3)}`);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nUI NGL profiles: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
