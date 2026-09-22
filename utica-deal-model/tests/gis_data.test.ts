/**
 * Reference GeoJSON assets: each tracked file loads, is EPSG:4326 lon/lat inside
 * the project region, has the expected feature counts and geometry class, carries
 * every attribute the registry's popups and labels read, and matches its manifest digest.
 */
import * as fs from "node:fs"; import * as path from "node:path"; import { createHash } from "node:crypto";
import { LAYER_REGISTRY, validateCollection, indexCollection, bboxWithin, bboxOfGeometry, OHIO_REGION_BBOX, unionBbox, hitTest, labelAnchor, pointInGeometry, placeLabels, operatorOf, type Bbox, type FeatureCollection } from "../gis/index";
import manifest from "../gis-data/manifest.json";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
console.log("\nGIS reference data");

const EXPECTED: Record<string, { count: number; geometry: string[] }> = {
  "ref.counties": { count: 10, geometry: ["Polygon"] },
  "ref.townships": { count: 168, geometry: ["Polygon", "MultiPolygon"] },
  "ref.phase_windows": { count: 19, geometry: ["Polygon"] },
  "opt.tc_areas": { count: 30, geometry: ["Polygon"] },
  "opt.odnr_units": { count: 789, geometry: ["Polygon", "MultiPolygon"] },
};

let union: Bbox | null = null;
const loaded: { def: (typeof LAYER_REGISTRY)[number]; data: ReturnType<typeof indexCollection> }[] = [];
for (const def of LAYER_REGISTRY) {
  if (def.source.kind !== "asset") continue;
  const entry = (manifest as any).layers[def.source.manifestKey];
  const file = path.join(root, entry.file);
  check(`${def.id}: tracked file exists`, fs.existsSync(file), entry.file);
  const buf = fs.readFileSync(file);
  check(`${def.id}: manifest sha256 matches file`, createHash("sha256").update(buf).digest("hex") === entry.sha256);
  const fc = JSON.parse(buf.toString("utf8")) as FeatureCollection;
  const issues = validateCollection(fc, def.geometry);
  check(`${def.id}: valid EPSG:4326 ${def.geometry} collection, no null geometry`, issues.length === 0, issues.slice(0, 3).map((i) => `#${i.feature} ${i.message}`).join("; "));
  const exp = EXPECTED[def.id];
  check(`${def.id}: feature count ${exp.count}`, fc.features.length === exp.count, String(fc.features.length));
  const types = [...new Set(fc.features.map((f) => f.geometry?.type))];
  check(`${def.id}: geometry types ${exp.geometry.join("/")}`, types.every((t) => exp.geometry.includes(t as string)), types.join(","));
  const data = indexCollection(def, fc);
  check(`${def.id}: feature ids unique (${def.idField})`, data.byId.size === fc.features.length, `${data.byId.size} ids`);
  check(`${def.id}: bbox inside project region`, bboxWithin(data.bbox, OHIO_REGION_BBOX), data.bbox.map((v) => v.toFixed(3)).join(","));
  const props = new Set(fc.features.flatMap((f) => Object.keys(f.properties ?? {})));
  const needed = [def.idField, def.nameField, ...def.popup.fields.map((f) => f.key), ...(def.label ? [def.label.field] : [])];
  const missing = needed.filter((k) => !props.has(k));
  check(`${def.id}: popup/label attributes present`, missing.length === 0, missing.join(",") || needed.join(","));
  const empty = fc.features.filter((f) => def.popup.fields.some((pf) => !pf.derive && (f.properties?.[pf.key] === undefined || f.properties?.[pf.key] === null)));
  check(`${def.id}: no feature is missing a popup value`, empty.length === 0, `${empty.length} features`);
  if (def.label) { const anchors = fc.features.map((f) => labelAnchor(f.geometry)); check(`${def.id}: label anchor inside its polygon for every feature`, anchors.every((a, i) => a && pointInGeometry(a, fc.features[i].geometry)), `${anchors.filter((a, i) => !(a && pointInGeometry(a, fc.features[i].geometry))).length} outside`); }
  union = union ? unionBbox(union, data.bbox) : data.bbox;
  loaded.push({ def, data });
}
check("registered: counties, townships, phase windows, type curve areas, ODNR units", Object.keys(EXPECTED).every((id) => LAYER_REGISTRY.some((l) => l.id === id)));
check("map default extent (union bbox) encompasses every reference layer", union !== null && loaded.every((l) => bboxWithin(l.data.bbox, union!)), union?.map((v) => v.toFixed(3)).join(","));

// Phase names all classify into the six legend classes.
const phase = loaded.find((l) => l.def.id === "ref.phase_windows")!;
const spec = phase.def.style as Extract<typeof phase.def.style, { kind: "categorical" }>;
const keys = phase.data.collection.features.map((f) => spec.classify!(f.properties!.Area, f));
check("every phase window maps to a legend class", keys.every((k) => spec.classes[k]), [...new Set(keys)].join("|"));

// ODNR units: every order status classifies into a legend class, and the ACRES attribute (carried over
// from the source Shape_STAr, in NAD83 Ohio South square feet) agrees with the reprojected EPSG:4326
// geometry. The area check is what would catch a bad reprojection: a wrong CRS still validates as lon/lat.
const odnr = loaded.find((l) => l.def.id === "opt.odnr_units")!;
const unitSpec = odnr.def.style as Extract<typeof odnr.def.style, { kind: "categorical" }>;
const statuses = [...new Set(odnr.data.collection.features.map((f) => String(f.properties!.STATUS)))];
check("every unit status maps to a legend class", statuses.every((s) => unitSpec.classes[s]), statuses.join("|"));
check("the tracked file stores raw ODNR status codes, not expanded names", statuses.every((s) => /^[A-Z]{3}$/.test(s)), statuses.join("|"));

// Operator canonicalization is a display-time map: the filed values stay in the tracked file.
const rawOperators = [...new Set(odnr.data.collection.features.map((f) => String(f.properties!.OPERATOR)))];
const canonical = [...new Set(rawOperators.map(operatorOf))];
check("the tracked file keeps every operator name as filed", ["Gulfport Energy Transferred to Gulfport Appalachia", "Gulfport Appalachia", "Gulfport Energy", "INR Onio", "INR Ohio", "EOG Ohio", "EOG Resources", "Eclipse", "OG Resources", "Rice Drilling D", "Tiburon", "Tiburon Oil and Gas Ohio"].every((v) => rawOperators.includes(v)), `${rawOperators.length} filed values`);
check("canonicalization merges the Gulfport, INR and EOG variants and nothing else", rawOperators.length === 20 && canonical.length === 14, `${rawOperators.length} filed → ${canonical.length} canonical`);
check("no filed operator is dropped or blanked by canonicalization", canonical.every((c) => c.length > 0) && rawOperators.every((r) => canonical.includes(operatorOf(r))));
const unitsPer = (name: string) => odnr.data.collection.features.filter((f) => operatorOf(f.properties!.OPERATOR) === name).length;
check("EOG Resources gathers all four filed spellings", unitsPer("EOG Resources") === 233, `${unitsPer("EOG Resources")} units`);
check("EQT holds the Rice Drilling D units", unitsPer("EQT") === 4, `${unitsPer("EQT")} units`);
const M_PER_DEG_LAT = 110574, M_PER_DEG_LON_AT = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
const ringM2 = (ring: number[][], lat0: number) => {
  const kx = M_PER_DEG_LON_AT(lat0);
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * M_PER_DEG_LAT) - ring[i][0] * kx * (ring[j][1] * M_PER_DEG_LAT);
  return Math.abs(a / 2);
};
const worstArea = odnr.data.collection.features.reduce((worst, f) => {
  const g = f.geometry!; const polys = g.type === "Polygon" ? [g.coordinates] : (g as any).coordinates;
  // Each polygon scales at its own latitude; one latitude for the whole layer costs ~2% across the play.
  const fb = bboxOfGeometry(g)!, lat0 = (fb[1] + fb[3]) / 2;
  const m2 = polys.reduce((s: number, rings: number[][][]) => s + ringM2(rings[0], lat0) - rings.slice(1).reduce((h: number, r: number[][]) => h + ringM2(r, lat0), 0), 0);
  const acres = m2 / 4046.8564224, rel = Math.abs(acres - (f.properties!.ACRES as number)) / (f.properties!.ACRES as number);
  return rel > worst.rel ? { rel, name: String(f.properties!.UNIT_NAME) } : worst;
}, { rel: 0, name: "" });
check("unit geometry area agrees with the ACRES attribute (reprojection sanity)", worstArea.rel < 0.02, `worst ${(worstArea.rel * 100).toFixed(2)}% on ${worstArea.name}`);

// Hit test at a known location: Carroll County seat (Carrollton) lies in Carroll County, Center Township.
const hits = hitTest([-81.0860, 40.5728], loaded.filter((l) => l.def.tier === "reference"));
check("hit test at Carrollton returns township, county and phase window in priority order", hits.map((h) => h.def.id).join(",") === "ref.townships,ref.counties,ref.phase_windows", hits.map((h) => `${h.def.id}:${h.feature.properties?.NAME ?? h.feature.properties?.Area}`).join(" | "));
check("hit test names Carroll County / Center township", hits.some((h) => h.def.id === "ref.counties" && h.feature.properties?.NAME === "Carroll") && hits.some((h) => h.def.id === "ref.townships" && h.feature.properties?.NAME === "Center"), hits.map((h) => String(h.feature.properties?.NAME ?? h.feature.properties?.Area)).join(","));
check("hit test outside every layer returns nothing", hitTest([-84.5, 39.1], loaded).length === 0);

// Type curve areas: TC_NUMBER labels 1..30, and greedy placement drops collisions instead of stacking them.
const tc = loaded.find((l) => l.def.id === "opt.tc_areas")!;
const nums = tc.data.collection.features.map((f) => f.properties!.TC_NUMBER as number).sort((a, b) => a - b);
check("TC_NUMBER runs 1..30 and is unique", nums.join(",") === Array.from({ length: 30 }, (_, i) => i + 1).join(","));
const tcHits = hitTest([-81.0860, 40.5728], loaded);
check("with type curve areas on, the TC polygon is the primary hit at Carrollton", tcHits[0]?.def.id === "opt.tc_areas", tcHits.map((h) => h.def.id).join(","));

// Inside a unit, the unit identifies first and the rest of the stack still resolves beneath it.
const inUnit = labelAnchor(odnr.data.byId.get("BOWERSTON_NORTH")!.geometry)!;
const unitHits = hitTest(inUnit, loaded);
check("inside Bowerston North the unit is the primary hit, over the TC area, township, county and phase window", unitHits.map((h) => h.def.id).join(",") === "opt.odnr_units,opt.tc_areas,ref.townships,ref.counties,ref.phase_windows", unitHits.map((h) => h.def.id).join(","));
check("Bowerston North resolves to its ODNR attributes", unitHits[0]?.feature.properties?.UNIT_NAME === "Bowerston North" && unitHits[0]?.feature.properties?.STATUS === "EFF" && unitHits[0]?.feature.properties?.OPERATOR === "EOG Ohio", JSON.stringify(unitHits[0]?.feature.properties));
const cands = tc.data.collection.features.map((f, i) => { const a = labelAnchor(f.geometry)!; return { id: String(i), x: (a[0] + 81.72) * 400, y: (40.87 - a[1]) * 400, width: 26, height: 20, priority: 1 }; });
const shown = placeLabels(cands, { width: 500, height: 520 });
check("label placement keeps a subset without overlaps at a small viewport", shown.size > 0 && shown.size < cands.length, `${shown.size}/${cands.length}`);
check("label placement keeps every label when the viewport is large", placeLabels(cands.map((c) => ({ ...c, x: c.x * 8, y: c.y * 8 })), { width: 4000, height: 4200 }).size === cands.length);

console.log(failures ? `\n${failures} GIS data check(s) FAILED` : "\nGIS data: all checks passed");
process.exit(failures ? 1 : 0);
