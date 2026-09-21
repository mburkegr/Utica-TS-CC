#!/usr/bin/env node
/**
 * Maintains gis-data/manifest.json.
 *   node gis-data/scripts/manifest.mjs verify              exit 1 if any sha256 differs from the tracked file
 *   node gis-data/scripts/manifest.mjs digest              rewrite every sha256 from the tracked files
 *   node gis-data/scripts/manifest.mjs set-asset <key> <id>  record the published asset id (url = /_blob/<id>)
 * Asset ids come from uploading the .geojson (as .json) to the artifact's asset store.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const path = resolve(root, "gis-data/manifest.json");
const m = JSON.parse(readFileSync(path, "utf8"));
const digest = (f) => createHash("sha256").update(readFileSync(resolve(root, f))).digest("hex");
const [cmd, key, id] = process.argv.slice(2);
if (cmd === "verify") {
  let bad = 0;
  for (const [k, l] of Object.entries(m.layers)) { const d = digest(l.file); const ok = d === l.sha256; console.log(`${ok ? "ok  " : "DIFF"} ${k} ${l.file}`); if (!ok) bad++; }
  process.exit(bad ? 1 : 0);
} else if (cmd === "digest") {
  for (const l of Object.values(m.layers)) l.sha256 = digest(l.file);
} else if (cmd === "set-asset") {
  if (!m.layers[key]) { console.error(`unknown layer key ${key}`); process.exit(1); }
  m.layers[key].asset = { id, url: `/_blob/${id}` };
} else { console.error("usage: manifest.mjs verify | digest | set-asset <key> <id>"); process.exit(1); }
writeFileSync(path, JSON.stringify(m, null, 2) + "\n");
console.log(`wrote ${path}`);
