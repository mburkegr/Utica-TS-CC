/**
 * Unit selection for analysis over the real unit layers: the join by unit id
 * across ODNR Units and Unit D&C, blanks for units the D&C workbook does not
 * cover, the footage-weighted summary, and toggling.
 */
import * as fs from "node:fs"; import * as path from "node:path";
import { getLayer, indexCollection, unitAnalysisRows, unitAnalysisSummary, toggleUnitId, operatorOf, type FeatureCollection } from "../gis/index";
import manifest from "../gis-data/manifest.json";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
const near = (a: number | null, b: number, tol = 1e-6) => a !== null && Math.abs(a - b) <= tol;
console.log("\nUnit selection for analysis");

const load = (id: string, key: string) => indexCollection(getLayer(id), JSON.parse(fs.readFileSync(path.join(root, (manifest as any).layers[key].file), "utf8")) as FeatureCollection);
const units = load("opt.odnr_units", "odnr_units");
const dc = load("opt.unit_dc", "unit_dc");

// Two D&C units (4 and 3 wells) and one the workbook does not cover.
const picks = ["ANGEL_HWS_A", "BEARCATS_NB_BUF", "BOWERSTON_NORTH"];
const rows = unitAnalysisRows(picks, [units, dc]);
check("one row per pick, in selection order", rows.map((r) => r.id).join(",") === picks.join(","), rows.map((r) => r.id).join(","));
const [angel, bearcats, bowerston] = rows;
check("D&C unit carries hearing date and year, wells, lateral and $/ft from the workbook",
  angel.hearingDate === "2024-11-13" && angel.hearingYear === 2024 && angel.wells === 4 && angel.avgLateralFt === 14300 && angel.dcPerFt === 658.75, JSON.stringify(angel));
check("operator is the canonical name from ODNR Units", angel.operator === operatorOf("EOG Resources") && bearcats.operator === operatorOf("EOG Ohio"), `${angel.operator} / ${bearcats.operator}`);
check("unit outside the workbook keeps its operator and acres, everything else null",
  bowerston.operator === operatorOf("EOG Ohio") && bowerston.acres !== null && [bowerston.hearingDate, bowerston.hearingYear, bowerston.wells, bowerston.avgLateralFt, bowerston.dcPerFt].every((v) => v === null), JSON.stringify(bowerston));

// The join must not depend on which layer is loaded: with only ODNR Units the D&C fields are blank, not wrong.
const unitsOnly = unitAnalysisRows(picks, [units, null]);
check("with Unit D&C not loaded, D&C fields are null rather than missing rows", unitsOnly.length === 3 && unitsOnly.every((r) => r.dcPerFt === null && r.operator !== ""));
const dcOnly = unitAnalysisRows(picks, [null, dc]);
check("with only Unit D&C loaded, the uncovered unit is skipped and the others still join", dcOnly.map((r) => r.id).join(",") === "ANGEL_HWS_A,BEARCATS_NB_BUF");
check("an id no layer has is skipped", unitAnalysisRows(["NO_SUCH_UNIT"], [units, dc]).length === 0);

// Every D&C unit round-trips its workbook values through the join.
const allDc = unitAnalysisRows([...dc.byId.keys()], [units, dc]);
const mismatched = allDc.filter((r) => { const p = dc.byId.get(r.id)!.properties!; return r.dcPerFt !== p.DC_PER_FT || r.wells !== p.WELLS || r.avgLateralFt !== p.AVG_LATERAL_FT || r.hearingDate !== p.HEARING_DATE; });
check("all 363 D&C units join with their workbook values", allDc.length === 363 && mismatched.length === 0, `${allDc.length} rows, ${mismatched.length} mismatched`);

// Summary: footage-weighted, D&C units only. Hand-computed:
//   feet = 4 x 14,300 + 3 x 20,492 = 118,676; lateral/well = 118,676 / 7 = 16,953.71
//   cost = 57,200 x 658.75 + 61,476 x 775.91 = 85,380,343.16; $/ft = 719.44 (a plain mean would be 717.33)
const s = unitAnalysisSummary(rows);
check("summary counts units and units with D&C", s.units === 3 && s.unitsWithDc === 2 && s.wells === 7, JSON.stringify(s));
check("lateral is averaged per well", near(s.avgLateralFt, 118676 / 7), String(s.avgLateralFt));
check("D&C is total cost over total lateral feet, not a plain mean", near(s.dcPerFt, 85380343.16 / 118676) && !near(s.dcPerFt, (658.75 + 775.91) / 2, 0.01), String(s.dcPerFt));
const none = unitAnalysisSummary([bowerston]);
check("summary of units without D&C is blank, not zero", none.units === 1 && none.unitsWithDc === 0 && none.avgLateralFt === null && none.dcPerFt === null);

check("toggle adds, then removes, keeping order", toggleUnitId(["A", "B"], "C").join() === "A,B,C" && toggleUnitId(["A", "B", "C"], "B").join() === "A,C");

if (failures) { console.error(`\n${failures} unit selection check(s) failed`); process.exit(1); }
console.log("  unit selection: all checks passed");
