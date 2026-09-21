/**
 * UI integration test on a golden fixture (C11). The UI is populated with the
 * fixture inputs, the model is run by clicking Run Model, and the displayed
 * IRR / MOIC / table cells are asserted against the validated engine and the
 * Python fixture values.
 */
import "global-jsdom/register";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { App } from "../ui/App";
import { initialState } from "../ui/state/defaults";
import { prepareRun } from "../ui/adapters/prepareRun";
import { fmtPct, fmtMultiple, fmtNumber } from "../ui/format/format";
import { runDeal, buildPeriodTable, computeBases, buildStandardSpecs, runTwoWaySensitivity } from "../engine/index";
import { deck, lib } from "./adapters";
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";

const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };

async function main() {
  const L0 = loadJson("C11", "L00_inputs.json"); const L10 = loadJson("C11", "L10_returns.json"); const L11 = loadJson("C11", "L11_reporting.json"); const L12 = loadJson("C11", "L12_sensitivities.json");
  const inputs = { deal: toDealInputs(L0.run_deal_inputs_after_app_preprocessing), slots: toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame) };
  const state = { ...initialState(deck), inputs };

  // Engine reference through the identical adapter path the UI uses.
  const prep = prepareRun(inputs, state.ui);
  const ref = runDeal(prep.slots, prep.deal, data);
  const q = buildPeriodTable(ref, "quarter");

  console.log("\nUI integration (C11 golden fixture)");
  render(<App data={data} initial={state} restoreDraft={false} />);
  fireEvent.click(screen.getByTestId("run-model"));
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });

  const irrText = screen.getByTestId("irr").textContent!;
  const moicText = screen.getByTestId("moic").textContent!;
  check("displayed IRR equals engine result", irrText === fmtPct(ref.irr, 1), `${irrText} vs ${fmtPct(ref.irr, 1)}`);
  check("displayed IRR matches Python fixture at display precision", irrText === fmtPct(L10.irr, 1), `${irrText} vs python ${fmtPct(L10.irr, 1)}`);
  check("displayed MOIC equals engine result (full life)", moicText === fmtMultiple(ref.moic), `${moicText} vs ${fmtMultiple(ref.moic)}`);
  check("displayed MOIC within 0.01x of the Python legacy-calendar fixture", Math.abs(parseFloat(moicText) - L10.moic) <= 0.01, `${moicText} vs python ${fmtMultiple(L10.moic)} (360-month calendar)`);
  check("top bar IRR mirrors the tile", screen.getByTestId("topbar-irr").textContent === irrText);
  check("payback tile rendered", /yrs/.test(screen.getByTestId("payback").textContent ?? ""), screen.getByTestId("payback").textContent ?? "");

  // Quarterly table: first column (Q4 26) total revenue and free cash flow vs engine and vs Python legacy column.
  const tables = document.querySelectorAll("table.period-table");
  const qTable = tables[0] as HTMLTableElement;
  const header = [...qTable.querySelectorAll("thead th")].map((h) => h.textContent);
  check("quarterly table has 8 dynamic columns starting Q4 26", header.length === 9 && header[1] === "Q4 26" && header[8] === "Q3 28", header.join("|"));
  const rowByLabel = (label: string) => [...qTable.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("td")?.textContent === label)!;
  const revRow = rowByLabel("Total ($k)") ?? rowByLabel("Total");
  const cells = revRow ? [...revRow.querySelectorAll("td")].slice(1).map((c) => c.textContent) : [];
  const pyQ = L11.legacy_python_golden.quarterly_table_numeric; const pyCol = pyQ.columns.indexOf("Q4 27"); const pyRow = pyQ.index.indexOf("Revenues - Total");
  const qi = q.columns.findIndex((c) => c.label === "Q4 27");
  check("Q4 27 total revenue cell equals engine and Python", cells[qi] === fmtNumber(q.values.totalRevenueK[qi], 1, "$") && cells[qi] === fmtNumber(pyQ.rows[pyRow][pyCol], 1, "$"), `${cells[qi]} vs python ${fmtNumber(pyQ.rows[pyRow][pyCol], 1, "$")}`);
  const annual = tables[1] as HTMLTableElement;
  const yHeader = [...annual.querySelectorAll("thead th")].map((h) => h.textContent);
  check("annual table runs through economic life", yHeader[1] === "2026" && Number(yHeader[yHeader.length - 1]) >= 2057, `${yHeader[1]}..${yHeader[yHeader.length - 1]}`);
  check("EUR table shows raw vs residue gas and theoretical vs recovered NGL labels", /Raw Gas EUR\/ft \(Pre-Shrink\)/.test(document.body.textContent ?? "") && /Residue Gas EUR\/ft \(Post-Shrink\)/.test(document.body.textContent ?? "") && /Theoretical NGL/.test(document.body.textContent ?? "") && /Recovered NGL/.test(document.body.textContent ?? ""));

  // Standalone slot returns on the Development tab
  fireEvent.click(screen.getByText("Development"));
  const st = document.querySelector('[data-standalone-irr="1"]')!.textContent;
  check("standalone slot 1 IRR equals fixture at display precision", st === fmtPct(L10.standalone_slot_returns["1"].irr, 1), `${st}`);

  // Sensitivity: generate dc_main and compare the rendered base cell with the engine grid and the fixture grid
  fireEvent.click(screen.getByText("Sensitivities"));
  fireEvent.click(document.querySelector('[data-generate="dc_main"]')!);
  await waitFor(() => { if (!document.querySelector('svg.heatmap[data-metric="irr"]')) throw new Error("waiting"); }, { timeout: 15000 });
  const bases = computeBases(prep.slots, prep.deal, {}); const spec = buildStandardSpecs(bases, prep.deal, {}).find((s) => s.key === "dc_main")!;
  const grid = runTwoWaySensitivity({ slots: prep.slots, inputs: prep.deal }, spec, bases, data);
  const cell = document.querySelector('svg.heatmap[data-metric="irr"] [data-cell="4-4"]')!.textContent!;
  const pyCell = L12.grids.dc_main.irr.rows[4][4];
  check("heatmap base cell equals engine grid", cell === fmtPct(grid.irr[4][4], 1), `${cell} vs ${fmtPct(grid.irr[4][4], 1)}`);
  check("heatmap base cell within 0.1% of Python fixture (legacy calendar)", Math.abs(parseFloat(cell) / 100 - pyCell) < 0.001, `${cell} vs python ${fmtPct(pyCell, 2)}`);
  check("inputs unchanged by run and sensitivity (immutability)", JSON.stringify(inputs) === JSON.stringify({ deal: toDealInputs(L0.run_deal_inputs_after_app_preprocessing), slots: toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame) }));
  // Load C11 through the Deal Setup button (user path) and confirm the same IRR
  cleanup();
  render(<App data={data} initial={initialState(deck)} restoreDraft={false} />);
  fireEvent.click(screen.getByTestId("misc-disclosure"));
  fireEvent.click(screen.getByTestId("load-c11"));
  fireEvent.click(screen.getByTestId("load-c11-confirm"));
  fireEvent.click(screen.getByTestId("run-model"));
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });
  check("Load validation case C11 button reproduces the fixture IRR and MOIC", screen.getByTestId("irr").textContent === fmtPct(ref.irr, 1) && screen.getByTestId("moic").textContent === fmtMultiple(ref.moic), `${screen.getByTestId("irr").textContent} / ${screen.getByTestId("moic").textContent}`);
  console.log(failures ? `\n${failures} UI check(s) FAILED` : "\nUI integration: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
