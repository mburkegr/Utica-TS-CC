/** Footnotes: section explanations render as numbered notes with superscript markers in reading order. */
import "global-jsdom/register";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { App } from "../ui/App";
import { initialState } from "../ui/state/defaults";
import { deck, lib } from "./adapters";
const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? "  (" + d + ")" : ""}`); if (!ok) failures++; };
console.log("\nUI footnotes");
render(<App data={data} initial={initialState(deck)} restoreDraft={false} />);
const marks = () => [...document.querySelectorAll(".fn-mark a")].map((a) => a.textContent);
const items = () => [...document.querySelectorAll(".footnotes li")];
check("markers appear beside section headings", marks().length > 0, marks().join(","));
check("marker numbers run 1..n in reading order", marks().join(",") === marks().map((_, i) => String(i + 1)).join(","), marks().join(","));
check("a note list renders with one item per marker", items().length === marks().length, `${items().length} items / ${marks().length} marks`);
check("each marker's href targets its list item id", [...document.querySelectorAll(".fn-mark a")].every((a, i) => a.getAttribute("href") === `#fn-${i + 1}` && items()[i].id === `fn-${i + 1}`));
check("explanations no longer print under the heading", document.querySelectorAll("p.note").length === 0);
const before = marks().length;
fireEvent.click(screen.getByTestId("misc-disclosure"));
check("opening Misc adds its notes to the list", marks().length > before && items().length === marks().length, `${before} -> ${marks().length}`);
cleanup();
// Another screen numbers independently from 1
render(<App data={data} initial={{ ...initialState(deck), ui: { ...initialState(deck).ui, tab: "costs" } }} restoreDraft={false} />);
check("second screen renumbers from 1", marks()[0] === "1" && items().length === marks().length, marks().join(","));
console.log(failures ? `\n${failures} check(s) FAILED` : "\nUI footnotes: all checks passed");
process.exit(failures ? 1 : 0);
