/** Downloads, CSV builders, filename convention, running indicator and stale-result guard. */
import "global-jsdom/register";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { App } from "../ui/App";
import { initialState } from "../ui/state/defaults";
import { reducer } from "../ui/state/reducer";
import { safeFileStem, periodTableCsv, sensitivityGridCsv } from "../ui/format/csv";
import { runDeal, buildPeriodTable, computeBases, buildStandardSpecs, runTwoWaySensitivity } from "../engine/index";
import { prepareRun } from "../ui/adapters/prepareRun";
import { deck, lib } from "./adapters";
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";

const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };

async function main() {
  console.log("\nUI downloads / running / stale guard");
  const L0 = loadJson("C11", "L00_inputs.json");
  const inputs = { deal: toDealInputs(L0.run_deal_inputs_after_app_preprocessing), slots: toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame) };
  const base = { ...initialState(deck), inputs, ui: { ...initialState(deck).ui, opportunityName: "Towe HMN North" } };

  // filename convention
  check("filename stem from deal name", safeFileStem("Towe HMN North") === "Towe_HMN_North", safeFileStem("Towe HMN North"));
  check("filename stem default", safeFileStem("") === "Utica_Deal");
  check("sensitivity title stem keeps D&C ampersand", safeFileStem("D&C Costs ($/ft) vs. $/Acre Bid") === "D&C_Costs_ft_vs_Acre_Bid", safeFileStem("D&C Costs ($/ft) vs. $/Acre Bid"));

  // CSV content equals engine values
  const prep = prepareRun(inputs, base.ui); const ref = runDeal(prep.slots, prep.deal, data); const q = buildPeriodTable(ref, "quarter");
  const csv = periodTableCsv(q); const lines = csv.trim().split("\n");
  check("quarterly CSV header has metric + 8 quarter columns", lines[0] === ["Metric", ...q.columns.map((c) => c.label)].join(","), lines[0]);
  const revLine = lines.find((l) => l.startsWith("Revenues - Total"))!;
  check("quarterly CSV total revenue row carries raw engine values", revLine.split(",").slice(1).every((v, i) => Number(v) === q.values.totalRevenueK[i]));
  const bases = computeBases(prep.slots, prep.deal, {}); const spec = buildStandardSpecs(bases, prep.deal, {})[0];
  const grid = runTwoWaySensitivity({ slots: prep.slots, inputs: prep.deal }, spec, bases, data);
  const gcsv = sensitivityGridCsv(grid);
  check("sensitivity CSV has IRR and MOIC blocks with axis labels", gcsv.includes("IRR: ") && gcsv.includes("MOIC: ") && gcsv.includes("$/Acre Bid \\ D&C Costs ($/ft)"));

  // stale guard in the reducer
  const ran = reducer(base, { type: "RUN_DONE", signature: "sig-new", base: ref, standalone: {} });
  const guarded = reducer(ran, { type: "SET_GRID", key: "dc_main", result: { grid, signature: "x" }, baseSignature: "sig-old" });
  const accepted = reducer(ran, { type: "SET_GRID", key: "dc_main", result: { grid, signature: "x" }, baseSignature: "sig-new" });
  check("grid from an older base run is dropped", guarded === ran && Object.keys(guarded.results.grids).length === 0);
  check("grid from the current base run is stored", Object.keys(accepted.results.grids).length === 1);

  // No runtime: download button hidden, copy present
  render(<App data={data} initial={base} restoreDraft={false} />);
  fireEvent.click(screen.getByTestId("run-model"));
  check("Run button disabled while running", (screen.getByTestId("run-model") as HTMLButtonElement).disabled);
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });
  check("Run button re-enabled after run", !(screen.getByTestId("run-model") as HTMLButtonElement).disabled);
  check("without the downloads runtime: no Download button, Copy CSV present", !document.querySelector("[data-download]") && document.body.textContent!.includes("Copy CSV"));
  cleanup();

  // Mocked downloads runtime: click the real Quarterly button
  const captured: { filename: string; data: Blob }[] = [];
  (globalThis as any).claude = { use: async (name: string) => (name === "downloads" ? { save: async (req: any) => { captured.push(req); return { status: "saved" }; } } : null) };
  render(<App data={data} initial={base} restoreDraft={false} />);
  fireEvent.click(screen.getByTestId("run-model"));
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });
  await waitFor(() => { if (!document.querySelector('[data-download="Towe_HMN_North_Quarterly.csv"]')) throw new Error("waiting for download button"); }, { timeout: 3000 });
  fireEvent.click(document.querySelector('[data-download="Towe_HMN_North_Quarterly.csv"]')!);
  await waitFor(() => { if (captured.length === 0) throw new Error("waiting for save"); }, { timeout: 3000 });
  const text = await captured[0].data.text();
  check("download request uses the deal-named file", captured[0].filename === "Towe_HMN_North_Quarterly.csv", captured[0].filename);
  check("downloaded quarterly CSV equals the CSV builder output", text === csv);
  check("annual, monthly download buttons present", !!document.querySelector('[data-download="Towe_HMN_North_Annual.csv"]') && !!document.querySelector('[data-download="Towe_HMN_North_Monthly_Production_Cash_Flow.csv"]'));
  fireEvent.click(screen.getByText("Sensitivities"));
  fireEvent.click(document.querySelector('[data-generate="dc_main"]')!);
  await waitFor(() => { if (!document.querySelector('[data-download$="_Sensitivity.csv"]')) throw new Error("waiting"); }, { timeout: 15000 });
  const sensBtn = document.querySelector('[data-download$="_Sensitivity.csv"]')!.getAttribute("data-download");
  check("sensitivity download filename includes deal and table name", sensBtn === "Towe_HMN_North_D&C_Costs_ft_vs_Acre_Bid_Sensitivity.csv", sensBtn ?? "");
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nUI downloads: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
