/**
 * The two price decks.
 *
 * `data/validation_price_deck.json` is frozen: it is the deck the Python golden
 * fixtures were generated from, so the reconciliation suite reads it and a
 * price refresh cannot move a reconciliation result. Its sha256 is pinned here
 * so refreshing the wrong file fails loudly rather than silently invalidating
 * every fixture comparison.
 *
 * `data/price_file_library.json` is the live deck the app bundles. Nothing
 * pins its values, but it has to load under the engine's own rules and has to
 * agree with `data/source/price_deck.csv`, the tracked rows it is generated
 * from.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadPriceDeck } from "../engine/pricing";
import { monthToIso } from "../engine/months";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
console.log("\nPrice decks");

// ---- the frozen validation deck ----
// Pinned on 2026-10-07, when the live deck was first refreshed away from it.
// Changing this hash means the fixtures no longer describe the deck they were
// generated from: regenerate the Python fixtures, do not edit the hash.
const FROZEN_SHA = "4978269cb99da7c43983d9fc8dc3bc1ed73f3a90ba69fd71d58d5954cb2dbcec";
const frozenText = read("data/validation_price_deck.json");
const frozenSha = crypto.createHash("sha256").update(frozenText).digest("hex");
check("validation deck is byte-for-byte the frozen one", frozenSha === FROZEN_SHA, frozenSha.slice(0, 16));

const frozen = loadPriceDeck(JSON.parse(frozenText));
check("validation deck loads under the engine rules", frozen.rows.length === 84, `${frozen.rows.length} months`);
check("validation deck spans 2026-01 to 2032-12",
  monthToIso(frozen.firstMonth) === "2026-01-01" && monthToIso(frozen.lastMonth) === "2032-12-01",
  `${monthToIso(frozen.firstMonth)} .. ${monthToIso(frozen.lastMonth)}`);

// ---- the live deck the app ships ----
const liveJson = JSON.parse(read("data/price_file_library.json"));
// loadPriceDeck throws on an empty deck, a non-finite price, a duplicate month
// or a gap, so reaching the next line is itself the assertion.
const live = loadPriceDeck(liveJson);
check("live deck loads under the engine rules", live.rows.length > 0, `${live.rows.length} months`);
check("live deck is contiguous end to end",
  live.lastMonth - live.firstMonth + 1 === live.rows.length,
  `${monthToIso(live.firstMonth)} .. ${monthToIso(live.lastMonth)}`);
check("every live price is positive", live.rows.every((r) => r.oilPrice > 0 && r.gasPrice > 0));
check("live deck records the source workbook", /^[0-9a-f]{64}$/.test(String(liveJson.source_sha256 ?? "")), String(liveJson.source_sha256 ?? "").slice(0, 16));
check("live deck carries its units", liveJson.units?.oil_price === "$/bbl WTI index" && liveJson.units?.gas_price === "$/Mcf Henry Hub index");

// The economics only ever read the deck through a deal's effective date, so a
// deck that starts after the fixtures' effective dates would strand every case.
check("live deck still starts no later than the validation deck",
  live.firstMonth <= frozen.firstMonth,
  `live ${monthToIso(live.firstMonth)} vs frozen ${monthToIso(frozen.firstMonth)}`);

// ---- the live deck agrees with the tracked rows it is built from ----
const lines = read("data/source/price_deck.csv").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
const header = lines.shift();
check("tracked rows carry the expected header", header === "month,oil_price,gas_price", String(header));
const csv = lines.map((l) => { const [month, oil, gas] = l.split(","); return { month, oil: Number(oil), gas: Number(gas) }; });
check("tracked rows and built deck have the same month count", csv.length === live.rows.length, `csv ${csv.length} vs json ${live.rows.length}`);
const mismatches = csv.filter((r, i) => {
  const j = live.rows[i];
  return !j || monthToIso(j.month) !== r.month || j.oilPrice !== r.oil || j.gasPrice !== r.gas;
});
check("every tracked row matches the built deck exactly", mismatches.length === 0,
  mismatches.slice(0, 3).map((m) => m.month).join(", "));

// ---- the split stays wired the way it is documented ----
// Pointing a reconciliation module back at the live deck would make every
// fixture comparison depend on whatever prices happened to be committed.
for (const f of ["tests/adapters.ts", "tests/reconcile_pricing.ts", "tests/reconcile_well.ts"]) {
  const src = read(f);
  check(`${f} reads the validation deck`, src.includes('new URL("../data/validation_price_deck.json"'));
  // Only an actual read counts; the modules are free to name the live deck in a note.
  check(`${f} does not read the live deck`, !src.includes('new URL("../data/price_file_library.json"'));
}
// The app, conversely, must ship the live deck.
check("ui/main.tsx bundles the live deck", read("ui/main.tsx").includes("../data/price_file_library.json"));
check("ui/main.tsx does not bundle the validation deck", !read("ui/main.tsx").includes("validation_price_deck"));

console.log(failures === 0 ? "\nPrice decks OK." : `\n${failures} price-deck check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
