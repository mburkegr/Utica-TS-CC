/**
 * Master shell: `Deal Model | GIS` are peer modules. Switching hides the
 * inactive module but keeps it mounted, so Deal Model results survive a trip
 * through GIS and back. The Deal Model itself is exercised by ui_integration.
 */
import "global-jsdom/register";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppShell } from "../ui/shell/AppShell";
import { MODULES, MODULE_STORAGE_KEY } from "../ui/shell/moduleRegistry";
import { initialState } from "../ui/state/defaults";
import { deck, lib } from "./adapters";

const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
const frame = (k: string) => document.querySelector(`.app[data-module="${k}"]`) as HTMLElement | null;

async function main() {
  console.log("\nMaster shell");
  check("module registry lists Deal Model and GIS as peers", MODULES.map((m) => m.key).join("|") === "deal|gis");
  render(<AppShell data={data} initial={initialState(deck)} restoreDraft={false} initialModule="deal" />);
  check("Deal Model frame visible by default", frame("deal") !== null && !frame("deal")!.classList.contains("hidden"));
  check("GIS not mounted until first opened", frame("gis") === null);
  check("module nav rendered inside the Deal Model rail", frame("deal")!.querySelector(".rail .module-nav") !== null);

  // Run the model, switch to GIS, come back: results must still be there.
  fireEvent.click(screen.getByTestId("misc-disclosure"));
  fireEvent.click(screen.getByTestId("load-c11"));
  fireEvent.click(screen.getByTestId("load-c11-confirm"));
  fireEvent.click(screen.getByTestId("run-model"));
  await waitFor(() => screen.getByTestId("irr"), { timeout: 5000 });
  const irr = screen.getByTestId("irr").textContent;

  fireEvent.click(screen.getAllByTestId("module-gis")[0]);
  check("GIS frame mounted and visible after switching", frame("gis") !== null && !frame("gis")!.classList.contains("hidden"));
  check("Deal Model frame hidden but still mounted", frame("deal")!.classList.contains("hidden") && screen.getByTestId("irr") !== null);
  check("module nav rendered inside the GIS rail too", frame("gis")!.querySelector(".rail .module-nav") !== null);
  check("module choice persisted", globalThis.localStorage.getItem(MODULE_STORAGE_KEY) === "gis");

  fireEvent.click(frame("gis")!.querySelector('[data-testid="module-deal"]') as HTMLElement);
  check("Deal Model visible again with results intact", !frame("deal")!.classList.contains("hidden") && screen.getByTestId("irr").textContent === irr, `${irr}`);
  check("GIS stays mounted (hidden) after switching back", frame("gis") !== null && frame("gis")!.classList.contains("hidden"));

  console.log(failures ? `\n${failures} shell check(s) FAILED` : "\nMaster shell: all checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
