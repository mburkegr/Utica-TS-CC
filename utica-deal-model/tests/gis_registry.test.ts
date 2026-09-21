/** Layer registry: consistent definitions, every asset key resolves through the manifest, every style token is defined for light and dark, legend order covers the phase classes. */
import * as fs from "node:fs"; import * as path from "node:path";
import { LAYER_REGISTRY, REFERENCE_LAYERS, OPTIONAL_LAYERS, PHASE_ORDER, UNIT_STATUS_ORDER, getLayer, validateRegistry, styleTokens, layersInDrawOrder, legendFor, phaseOf, regionOf, resolveSourceUrl } from "../gis/index";
import manifest from "../gis-data/manifest.json";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
console.log("\nGIS layer registry");

const issues = validateRegistry(LAYER_REGISTRY, manifest as any);
check("registry validates", issues.length === 0, issues.join("; "));
check("three reference layers; Type Curve Areas and ODNR Units are the optional layers", REFERENCE_LAYERS.length === 3 && OPTIONAL_LAYERS.map((l) => l.id).join(",") === "opt.tc_areas,opt.odnr_units");
check("every optional layer is off by default and lazy", OPTIONAL_LAYERS.every((l) => l.defaultVisible === false && l.loading === "lazy"));
check("Type Curve Areas: labeled by TC_NUMBER with collision avoidance, above every reference layer in the selection stack", getLayer("opt.tc_areas").label?.field === "TC_NUMBER" && getLayer("opt.tc_areas").label?.avoidCollisions === true && getLayer("opt.tc_areas").selectionPriority > Math.max(...REFERENCE_LAYERS.map((l) => l.selectionPriority)));
check("every manifest layer is referenced by exactly one registry entry", Object.keys((manifest as any).layers).every((k) => LAYER_REGISTRY.filter((l) => l.source.kind === "asset" && l.source.manifestKey === k).length === 1));
check("draw order: phase windows, townships, counties, then operational layers on top", layersInDrawOrder().map((l) => l.id).join(",") === "ref.phase_windows,ref.townships,ref.counties,opt.tc_areas,opt.odnr_units");
check("selection priority: ODNR units, type curve areas, townships, counties, phase windows", [...LAYER_REGISTRY].sort((a, b) => b.selectionPriority - a.selectionPriority).map((l) => l.id).join(",") === "opt.odnr_units,opt.tc_areas,ref.townships,ref.counties,ref.phase_windows");
check("county labels on by default, township labels behind a toggle with a minimum zoom", LAYER_REGISTRY.find((l) => l.id === "ref.counties")!.label!.defaultOn === true && LAYER_REGISTRY.find((l) => l.id === "ref.townships")!.label!.defaultOn === false && (LAYER_REGISTRY.find((l) => l.id === "ref.townships")!.label!.minZoom ?? 0) >= 9);
check("phase legend lists six classes in geological order", legendFor(LAYER_REGISTRY.find((l) => l.id === "ref.phase_windows")!).map((e) => e.key).join("|") === PHASE_ORDER.join("|"));
check("phase classifier strips region and merges Dry Gas East/West", phaseOf("North Rich Condensate") === "Rich Condensate" && phaseOf("Core Dry Gas East") === "Dry Gas" && phaseOf("South Oil") === "Oil" && regionOf("Core Wet Gas") === "Core");

// ODNR Units: the unit layer is canvas-rendered (789 polygons), keyed on UNIT_ID and styled by order status.
const units = getLayer("opt.odnr_units");
check("ODNR Units: canvas renderer, unlabeled, drawn and selected above the type curve areas", units.renderer === "canvas" && units.label === undefined && units.zIndex > getLayer("opt.tc_areas").zIndex && units.selectionPriority > getLayer("opt.tc_areas").selectionPriority);
check("ODNR Units: identity UNIT_ID, name UNIT_NAME, category units", units.idField === "UNIT_ID" && units.nameField === "UNIT_NAME" && units.category === "units");
check("ODNR Units legend lists the three status codes in order", legendFor(units).map((e) => e.key).join("|") === UNIT_STATUS_ORDER.join("|"));
check("ODNR Units popup carries operator, order, status, formation, acres and vintage", units.popup.fields.map((f) => f.key).join(",") === "OPERATOR,ORDER_NO,STATUS,FORMATION,ACRES,EDIT_DATE");

// Style tokens defined in ui/gis/gis.css for light, system dark and forced dark.
const css = fs.readFileSync(path.join(root, "ui/gis/gis.css"), "utf8");
const blockOf = (re: RegExp) => { const m = re.exec(css); return m ? m[0] : ""; };
const light = blockOf(/^:root\{[\s\S]*?\}/m), sysDark = blockOf(/@media \(prefers-color-scheme: dark\)\{[\s\S]*?\n\}/), attrDark = blockOf(/:root\[data-theme="dark"\]\{[\s\S]*?\}/);
const tokens = styleTokens().concat(["--gis-highlight-line", "--gis-highlight-fill", "--gis-label-tc-text", "--gis-label-tc-bg", "--gis-label-tc-ring"]);
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
