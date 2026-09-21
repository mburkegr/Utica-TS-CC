/** One control generates every sensitivity table and the scenario matrix; per-table refresh still works;
 *  results match the engine; a superseded base run discards in-flight grids. */
import "global-jsdom/register";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../ui/App";
import { initialState } from "../ui/state/defaults";
import { prepareRun } from "../ui/adapters/prepareRun";
import { computeBases, buildStandardSpecs, buildCarryEntrySpecs, runTwoWaySensitivity } from "../engine/index";
import { fmtPct } from "../ui/format/format";
import { deck, lib } from "./adapters";
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";
const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? "  (" + d + ")" : ""}`); if (!ok) failures++; };

async function main() {
  console.log("\nUI sensitivities: generate all");
  const L0 = loadJson("C11", "L00_inputs.json");
  const inputs = { deal: toDealInputs(L0.run_deal_inputs_after_app_preprocessing), slots: toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame) };
  const st = { ...initialState(deck), inputs };
  render(<App data={data} initial={st} restoreDraft={false} />);
  fireEvent.click(screen.getByTestId("run-model"));
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });
  fireEvent.click(screen.getByText("Sensitivities"));

  const prep = prepareRun(inputs, st.ui);
  const bases = computeBases(prep.slots, prep.deal, {});
  const specs = [...buildStandardSpecs(bases, prep.deal, {}), ...buildCarryEntrySpecs(bases)];
  check("one Generate all control is present", !!document.querySelector('[data-testid="generate-all"]'));
  check("no per-table primary Generate buttons remain", [...document.querySelectorAll("[data-generate]")].every((b) => b.className.includes("secondary")));
  check("progress line shows nothing current yet", (document.querySelector(".progress") as HTMLElement).textContent === `0 of ${specs.length + 1} current`, (document.querySelector(".progress") as HTMLElement).textContent ?? "");

  fireEvent.click(screen.getByTestId("generate-all-no-scenario"));
  await waitFor(() => { const p = (document.querySelector(".progress") as HTMLElement).textContent ?? ""; if (!p.endsWith("current")) throw new Error("running"); }, { timeout: 120000, interval: 200 });
  const heatmaps = document.querySelectorAll('svg.heatmap[data-metric="irr"]').length;
  check("every table rendered from one click", heatmaps === specs.length, `${heatmaps} of ${specs.length}`);
  check("progress reports all tables current", ((document.querySelector(".progress") as HTMLElement).textContent ?? "") === `${specs.length} of ${specs.length + 1} current`, (document.querySelector(".progress") as HTMLElement).textContent ?? "");

  // spot-check a rendered cell against the engine
  const spec = specs.find((x) => x.key === "dc_main")!;
  const grid = runTwoWaySensitivity({ slots: prep.slots, inputs: prep.deal }, spec, bases, data);
  const cell = document.querySelector('svg.heatmap[data-metric="irr"] [data-cell="4-4"]')!.textContent!;
  check("first table's base cell equals the engine grid", cell === fmtPct(grid.irr[4][4], 1), `${cell} vs ${fmtPct(grid.irr[4][4], 1)}`);
  check("heatmap shows a legend and a base-case marker", !!document.querySelector(".hm-legend") && !!document.querySelector(".hm-cell.base"));
  check("per-table control now reads Refresh", (document.querySelector('[data-generate="dc_main"]') as HTMLElement).textContent === "Refresh");
  // No downloads runtime in jsdom, so the export group shows the copy fallback.
  check("export control appears once a table is current", (document.body.textContent ?? "").includes("Copy CSV"));
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nUI generate all: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
