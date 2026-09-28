/** Layer registry: consistent definitions, every asset key resolves through the manifest, every style token is defined for light and dark, legend order covers the phase classes. */
import * as fs from "node:fs"; import * as path from "node:path";
import { LAYER_REGISTRY, REFERENCE_LAYERS, OPTIONAL_LAYERS, PHASE_ORDER, UNIT_STATUS_ORDER, UNIT_STATUS_LABELS, OPERATOR_ALIASES, getLayer, validateRegistry, styleTokens, layersInDrawOrder, legendFor, phaseOf, regionOf, unitStatusLabel, operatorOf, dcPerFt, lateralFt, hearingDate, dcBand, DC_BANDS, resolveSourceUrl } from "../gis/index";
import manifest from "../gis-data/manifest.json";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
console.log("\nGIS layer registry");

const issues = validateRegistry(LAYER_REGISTRY, manifest as any);
check("registry validates", issues.length === 0, issues.join("; "));
// Reference layers identify by name alone: the drawer's full attribute list
// still carries GEOID and land area for anyone who wants them.
check("townships, counties and phase windows show a name and no summary rows", ["ref.townships", "ref.counties", "ref.phase_windows"].every((id) => getLayer(id).popup.fields.length === 0));
check("a title-only popup still names its feature", getLayer("ref.counties").popup.title({ NAMELSAD: "Carroll County" }) === "Carroll County" && getLayer("ref.phase_windows").popup.title({ Area: "North Lean Condensate" }) === "North Lean Condensate");
check("the phase legend still classifies, even with the rows gone", phaseOf("North Lean Condensate") === "Lean Condensate" && regionOf("North Lean Condensate") === "North");
check("a popup with no title is still rejected", validateRegistry([{ ...getLayer("ref.counties"), popup: { fields: [] } } as any], manifest as any).some((i) => /needs a title/.test(i)));
check("three reference layers; type curve areas, ODNR units and unit D&C are the optional layers", REFERENCE_LAYERS.length === 3 && OPTIONAL_LAYERS.map((l) => l.id).join(",") === "opt.tc_areas,opt.odnr_units,opt.unit_dc");
check("every optional layer is off by default and lazy", OPTIONAL_LAYERS.every((l) => l.defaultVisible === false && l.loading === "lazy"));
check("Type Curve Areas: labeled by TC_NUMBER with collision avoidance, above every reference layer in the selection stack", getLayer("opt.tc_areas").label?.field === "TC_NUMBER" && getLayer("opt.tc_areas").label?.avoidCollisions === true && getLayer("opt.tc_areas").selectionPriority > Math.max(...REFERENCE_LAYERS.map((l) => l.selectionPriority)));
check("every manifest layer is referenced by exactly one registry entry", Object.keys((manifest as any).layers).every((k) => LAYER_REGISTRY.filter((l) => l.source.kind === "asset" && l.source.manifestKey === k).length === 1));
check("draw order: phase windows, townships, counties, then operational layers on top", layersInDrawOrder().map((l) => l.id).join(",") === "ref.phase_windows,ref.townships,ref.counties,opt.tc_areas,opt.odnr_units,opt.unit_dc");
check("selection priority: unit D&C, ODNR units, type curve areas, townships, counties, phase windows", [...LAYER_REGISTRY].sort((a, b) => b.selectionPriority - a.selectionPriority).map((l) => l.id).join(",") === "opt.unit_dc,opt.odnr_units,opt.tc_areas,ref.townships,ref.counties,ref.phase_windows");
check("county labels on by default, township labels behind a toggle with a minimum zoom", LAYER_REGISTRY.find((l) => l.id === "ref.counties")!.label!.defaultOn === true && LAYER_REGISTRY.find((l) => l.id === "ref.townships")!.label!.defaultOn === false && (LAYER_REGISTRY.find((l) => l.id === "ref.townships")!.label!.minZoom ?? 0) >= 9);
check("phase legend lists six classes in geological order", legendFor(LAYER_REGISTRY.find((l) => l.id === "ref.phase_windows")!).map((e) => e.key).join("|") === PHASE_ORDER.join("|"));
check("phase classifier strips region and merges Dry Gas East/West", phaseOf("North Rich Condensate") === "Rich Condensate" && phaseOf("Core Dry Gas East") === "Dry Gas" && phaseOf("South Oil") === "Oil" && regionOf("Core Wet Gas") === "Core");

// ODNR Units: the unit layer is canvas-rendered (789 polygons), keyed on UNIT_ID and styled by order status.
const units = getLayer("opt.odnr_units");
check("ODNR Units: canvas renderer, unlabeled, drawn and selected above the type curve areas", units.renderer === "canvas" && units.label === undefined && units.zIndex > getLayer("opt.tc_areas").zIndex && units.selectionPriority > getLayer("opt.tc_areas").selectionPriority);
check("ODNR Units: identity UNIT_ID, name UNIT_NAME, category units", units.idField === "UNIT_ID" && units.nameField === "UNIT_NAME" && units.category === "units");
check("ODNR Units legend is keyed on the raw status codes in process order", legendFor(units).map((e) => e.key).join("|") === UNIT_STATUS_ORDER.join("|"));
check("ODNR Units popup carries operator, order, status, formation, acres and vintage", units.popup.fields.map((f) => f.key).join(",") === "OPERATOR,ORDER_NO,STATUS,FORMATION,ACRES,EDIT_DATE");

// Status: the raw code keys the style; every reader-facing surface shows the official ODNR expansion.
check("legend shows the expanded ODNR status names, not the codes", legendFor(units).map((e) => e.label).join("|") === "Pending|Effective|Chief's Order Issued|No Longer Effective", legendFor(units).map((e) => e.label).join("|"));
check("status expansions match the ODNR mappings", unitStatusLabel("PEN") === "Pending" && unitStatusLabel("EFF") === "Effective" && unitStatusLabel("COI") === "Chief's Order Issued" && unitStatusLabel("NLE") === "No Longer Effective");
check("status lookup tolerates case and padding, and passes an unknown code through", unitStatusLabel(" eff ") === "Effective" && unitStatusLabel("XYZ") === "XYZ" && unitStatusLabel("") === "Unknown" && unitStatusLabel(null) === "Unknown");
check("the popup derives the expanded status and leaves STATUS untouched", units.popup.fields.find((f) => f.key === "STATUS")!.derive!({ STATUS: "COI" }) === "Chief's Order Issued");
check("NLE is registered with a style although the current extract has none", Object.keys(UNIT_STATUS_LABELS).every((c) => (units.style as any).classes[c]) && (units.style as any).classes.NLE.dashArray !== undefined);

// Operator: an alias map, not an edit to the source. Aliases are approved explicitly, never inferred.
check("approved operator aliases canonicalize", operatorOf("Gulfport Energy Transferred to Gulfport Appalachia") === "Gulfport Appalachia" && operatorOf("Gulfport Appalachia") === "Gulfport Appalachia" && operatorOf("Gulfport Energy") === "Gulfport Appalachia" && operatorOf("INR Onio") === "INR Ohio" && operatorOf("INR Ohio") === "INR Ohio");
check("operator matching ignores case and collapses whitespace", operatorOf("  gulfport   energy  ") === "Gulfport Appalachia" && operatorOf("inr onio") === "INR Ohio");
check("EOG Ohio, EOG Resources, Eclipse and OG Resources are one operator", ["EOG Ohio", "EOG Resources", "Eclipse", "OG Resources"].every((v) => operatorOf(v) === "EOG Resources"));
check("Rice Drilling D files under EQT", operatorOf("Rice Drilling D") === "EQT");
check("an unaliased operator passes through as filed", operatorOf("Ascent") === "Ascent" && operatorOf("Hilcorp Energy") === "Hilcorp Energy");
check("Tiburon is an operator in its own right, not folded into Tiburon Oil and Gas Ohio", operatorOf("Tiburon") === "Tiburon" && operatorOf("Tiburon Oil and Gas Ohio") === "Tiburon Oil and Gas Ohio");
check("the alias map holds only the approved entries", Object.keys(OPERATOR_ALIASES).length === 10, Object.keys(OPERATOR_ALIASES).join(" | "));
check("the popup derives the canonical operator and leaves OPERATOR untouched", units.popup.fields.find((f) => f.key === "OPERATOR")!.derive!({ OPERATOR: "Gulfport Energy" }) === "Gulfport Appalachia");

// Unit D&C: the layer exists to show a number on the map, so its label is on by default.
const dc = getLayer("opt.unit_dc");
check("Unit D&C: canvas renderer, drawn and selected above the units layer", dc.renderer === "canvas" && dc.zIndex > getLayer("opt.odnr_units").zIndex && dc.selectionPriority > getLayer("opt.odnr_units").selectionPriority);
check("Unit D&C: labels on by default, with collision avoidance and no toggle needed", dc.label?.defaultOn === true && dc.label?.avoidCollisions === true && dc.label?.field === "DC_PER_FT");
check("the label reads dollars per foot, rounded", dc.label!.derive!({ DC_PER_FT: 747.51 }) === "$748/ft" && dc.label!.derive!({ DC_PER_FT: 1307.54 }) === "$1,308/ft");
check("a missing D&C labels as n/a rather than NaN", dcPerFt(undefined) === "n/a" && dcPerFt(null) === "n/a" && dcPerFt("747") === "n/a");
check("Unit D&C popup leads with D&C then the hearing date, and carries the unit acreage", dc.popup.fields.map((f) => f.key).join(",") === "DC_PER_FT,HEARING_DATE,WELLS,AVG_LATERAL_FT,ACRES,OPERATOR,STATUS");
check("hearing dates render short, without a timezone shifting the day", hearingDate("2025-06-18") === "6/18/25" && hearingDate("2026-10-21") === "10/21/26" && hearingDate("2024-01-01") === "1/1/24" && hearingDate("2025-12-31") === "12/31/25");
check("a malformed or missing hearing date degrades rather than throwing", hearingDate("") === "n/a" && hearingDate(null) === "n/a" && hearingDate("not a date") === "not a date");
check("lateral length carries its unit", lateralFt(18595) === "18,595 ft" && lateralFt(undefined) === "n/a");
// The heatmap: six cost bands, cheapest first, with an exclusive upper bound.
check("the legend lists six cost bands cheapest first", legendFor(dc).map((e) => e.label).join(" | ") === "< $500/ft | $500 - 600/ft | $600 - 700/ft | $700 - 800/ft | $800 - 900/ft | $900+/ft", legendFor(dc).map((e) => e.label).join(" | "));
check("a cost lands in the band the legend names", dcBand(412) === "u500" && dcBand(550) === "d500" && dcBand(650) === "d600" && dcBand(750) === "d700" && dcBand(850) === "d800" && dcBand(1307.54) === "d900");
check("band edges are exclusive upper bounds, so 600 is a 600-700 unit", dcBand(499.99) === "u500" && dcBand(500) === "d500" && dcBand(599.99) === "d500" && dcBand(600) === "d600" && dcBand(900) === "d900");
check("a missing or non-numeric cost falls through to the fallback style", dcBand(undefined) === "unknown" && dcBand(null) === "unknown" && dcBand("700") === "unknown" && dcBand(NaN) === "unknown");
check("every band has its own fill token and they are all distinct", (() => { const fills = DC_BANDS.map((b) => (dc.style as any).classes[b.key].fill); return new Set(fills).size === 6 && fills.every((f: string) => /^--gis-dc-[a-z0-9]+-fill$/.test(f)); })());
check("bands share one outline, so the fill alone carries the value", DC_BANDS.every((b) => (dc.style as any).classes[b.key].stroke === "--gis-dc-line"));
check("the D&C popup derives operator and status the same way the units layer does", dc.popup.fields.find((f) => f.key === "OPERATOR")!.derive!({ OPERATOR: "EOG Ohio" }) === "EOG Resources" && dc.popup.fields.find((f) => f.key === "STATUS")!.derive!({ STATUS: "EFF" }) === "Effective");

// Style tokens defined in ui/gis/gis.css for light, system dark and forced dark.
const css = fs.readFileSync(path.join(root, "ui/gis/gis.css"), "utf8");
const blockOf = (re: RegExp) => { const m = re.exec(css); return m ? m[0] : ""; };
const light = blockOf(/^:root\{[\s\S]*?\}/m), sysDark = blockOf(/@media \(prefers-color-scheme: dark\)\{[\s\S]*?\n\}/), attrDark = blockOf(/:root\[data-theme="dark"\]\{[\s\S]*?\}/);
const tokens = styleTokens().concat(["--gis-highlight-line", "--gis-highlight-fill", "--gis-label-tc-text", "--gis-label-tc-bg", "--gis-label-tc-ring", "--gis-label-dc-text", "--gis-label-dc-bg", "--gis-label-dc-ring"]);
const missing = (b: string) => tokens.filter((t) => !b.includes(`${t}:`));
check("every registry style token is defined for light", missing(light).length === 0, missing(light).join(","));
check("every registry style token is defined for system dark", missing(sysDark).length === 0, missing(sysDark).join(","));
check("every registry style token is defined for forced dark", missing(attrDark).length === 0, missing(attrDark).join(","));
check("system dark block guarded against a viewer-forced light theme", sysDark.includes(':root:not([data-theme="light"])'));

// Asset resolution: unpublished layers resolve to null (surfaced as "not published"), published ones to /_blob/<id>.
const c = LAYER_REGISTRY[0];
const unpub = { layers: { [(c.source as any).manifestKey]: { file: "", sha256: "", asset: { id: "", url: "" } } } };
const pub = { layers: { [(c.source as any).manifestKey]: { file: "", sha256: "", asset: { id: "abc", url: "/_blob/abc" } } } };
check("unpublished asset resolves to null", resolveSourceUrl(c, unpub as any) === null);
check("published asset resolves to its /_blob url", resolveSourceUrl(c, pub as any) === "/_blob/abc");
const published = Object.values((manifest as any).layers).filter((l: any) => l.asset.url).length;
console.log(`  info  manifest: ${published}/${Object.keys((manifest as any).layers).length} layers have published asset urls`);

console.log(failures ? `\n${failures} registry check(s) FAILED` : "\nGIS registry: all checks passed");
process.exit(failures ? 1 : 0);
