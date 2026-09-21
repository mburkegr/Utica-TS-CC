/** Layer boundary: UI files may import the engine only through engine/index, and never engine internals. */
import * as fs from "node:fs"; import * as path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "ui");
let bad: string[] = [], files = 0;
const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) { files++; const src = fs.readFileSync(p, "utf8"); for (const m of src.matchAll(/from\s+"([^"]+)"/g)) { const spec = m[1]; if (spec.includes("engine/") && !/engine\/index$/.test(spec)) bad.push(`${path.relative(root, p)}: ${spec}`); } } } };
walk(root);
console.log(`\nUI boundary: ${files} files scanned, ${bad.length} violations`); for (const b of bad) console.log("  FAIL", b);
process.exit(bad.length ? 1 : 0);
