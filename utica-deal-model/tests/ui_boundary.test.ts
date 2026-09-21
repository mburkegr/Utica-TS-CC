/**
 * Layer boundaries (resolved import paths):
 *  - ui/ may import the engine only through engine/index, never engine internals;
 *  - ui/ may import the GIS library only through gis/index;
 *  - ui/gis and gis/ import nothing from engine/;
 *  - gis/ (framework-free GIS library) imports nothing from ui/ and not React;
 *  - engine/ imports nothing from gis/ or ui/.
 */
import * as fs from "node:fs"; import * as path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const files = (d: string): string[] => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
const inDir = (p: string, dir: string) => p.startsWith(path.join(root, dir) + path.sep);
const bad: string[] = []; let scanned = 0;
for (const dir of ["ui", "gis", "engine"]) for (const f of files(path.join(root, dir))) {
  scanned++;
  for (const m of fs.readFileSync(f, "utf8").matchAll(/from\s+"([^"]+)"/g)) {
    const spec = m[1]; const target = spec.startsWith(".") ? path.resolve(path.dirname(f), spec) : null;
    const flag = (why: string) => bad.push(`${path.relative(root, f)}: ${spec} (${why})`);
    if (dir === "ui" && target && inDir(target, "engine") && path.basename(target) !== "index") flag("engine internals");
    if (dir === "ui" && target && inDir(target, "gis") && path.basename(target) !== "index") flag("gis internals; import from gis/index");
    if (inDir(f, "ui/gis") && target && inDir(target, "engine")) flag("GIS UI must not touch the engine");
    if (dir === "gis" && target && (inDir(target, "engine") || inDir(target, "ui"))) flag("GIS library must not depend on engine or ui");
    if (dir === "gis" && spec === "react") flag("GIS library is framework-free");
    if (dir === "engine" && target && (inDir(target, "gis") || inDir(target, "ui"))) flag("engine must stay isolated");
  }
}
console.log(`\nLayer boundary: ${scanned} files scanned, ${bad.length} violations`); for (const b of bad) console.log("  FAIL", b);
process.exit(bad.length ? 1 : 0);
