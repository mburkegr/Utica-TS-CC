/**
 * Unit search over the real ODNR layer: term matching across name, operator
 * (canonical and as filed) and order number, ranking, and the guards that keep
 * a one-character query from returning half the play.
 */
import * as fs from "node:fs"; import * as path from "node:path";
import { getLayer, indexCollection, buildUnitIndex, searchUnits, normalizeQuery, MIN_QUERY, DEFAULT_LIMIT, type FeatureCollection } from "../gis/index";
import manifest from "../gis-data/manifest.json";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
console.log("\nUnit search");

const def = getLayer("opt.odnr_units");
const fc = JSON.parse(fs.readFileSync(path.join(root, (manifest as any).layers.odnr_units.file), "utf8")) as FeatureCollection;
const index = buildUnitIndex(indexCollection(def, fc));
const names = (q: string) => searchUnits(index, q).map((h) => h.name);

check("indexes every unit", index.length === 789, String(index.length));

// Name matching, and the ranking that puts a whole-name match first.
check("exact name is the first result", names("Bowerston North")[0] === "Bowerston North", names("Bowerston North").slice(0, 3).join(" | "));
check("partial name finds the unit", names("bowerston").includes("Bowerston North"), names("bowerston").join(" | "));
check("matching is case- and punctuation-insensitive", names("BOWERSTON  north")[0] === "Bowerston North");
check("a leading-name match outranks a mid-name match", (() => {
  const hits = searchUnits(index, "north");
  const lead = hits.findIndex((h) => h.name_n.startsWith("north"));
  const mid = hits.findIndex((h) => !h.name_n.startsWith("north") && h.name_n.includes("north"));
  return lead === -1 || mid === -1 || lead < mid;
})());

// Order number: the source writes "2016-237"; punctuation must not matter.
check("order number finds its unit", searchUnits(index, "2016-237").some((h) => h.name === "Bowerston North"), searchUnits(index, "2016-237").map((h) => h.name).join(" | "));
check("order number without the dash also finds it", searchUnits(index, "2016 237").some((h) => h.name === "Bowerston North"));

// Operator: canonical name and the name as ODNR filed it both hit.
const gulfportCanonical = searchUnits(index, "gulfport appalachia", 1000);
const gulfportFiled = searchUnits(index, "gulfport energy", 1000);
check("canonical operator name finds all its units", gulfportCanonical.length === 114, `${gulfportCanonical.length} hits`);
check("the operator name as filed also finds units", gulfportFiled.length > 0, `${gulfportFiled.length} hits`);
check("every Gulfport hit carries the canonical operator", gulfportCanonical.every((h) => h.operator === "Gulfport Appalachia"));
check("searching EOG finds the folded variants", searchUnits(index, "eog resources", 1000).length === 233, `${searchUnits(index, "eog resources", 1000).length} hits`);

// Terms narrow rather than widen.
const eogOnly = searchUnits(index, "eog", 1000).length;
const eogNorth = searchUnits(index, "eog north", 1000);
check("extra terms narrow the result set", eogNorth.length < eogOnly && eogNorth.length > 0, `${eogOnly} → ${eogNorth.length}`);
check("every term must match", eogNorth.every((h) => h.haystack.includes("eog") && h.haystack.includes("north")));
check("a query matching nothing returns nothing", searchUnits(index, "zzzznotaunit").length === 0);

// Guards and shape.
check(`a query under ${MIN_QUERY} characters returns nothing`, searchUnits(index, "b").length === 0 && searchUnits(index, "").length === 0);
check("results are capped at the default limit", searchUnits(index, "north").length <= DEFAULT_LIMIT, String(searchUnits(index, "north").length));
check("the cap is liftable for callers that want every match", searchUnits(index, "north", 1000).length > DEFAULT_LIMIT);
check("normalizeQuery folds case and punctuation", normalizeQuery(" Smith-Jones #2 ") === "smith jones 2" && normalizeQuery(null) === "");

// Result rows carry what the list renders, and the feature the map needs.
const hit = searchUnits(index, "Bowerston North")[0];
check("a hit carries name, operator, order, status, acres and its feature", hit.name === "Bowerston North" && hit.operator === "EOG Resources" && hit.order === "2016-237" && hit.status === "EFF" && hit.acres === 866.2 && hit.feature.geometry !== null, JSON.stringify({ o: hit.operator, ord: hit.order, ac: hit.acres }));
check("a hit's id round-trips to the layer index", indexCollection(def, fc).byId.get(hit.id)?.properties?.UNIT_NAME === "Bowerston North", hit.id);
check("results are stable for a repeated query", searchUnits(index, "north").map((h) => h.id).join(",") === searchUnits(index, "north").map((h) => h.id).join(","));

console.log(failures ? `\n${failures} unit search check(s) FAILED` : "\nUnit search: all checks passed");
process.exit(failures ? 1 : 0);
