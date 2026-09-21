/** Theme tokens: every color is a token defined for light, system dark and viewer-forced dark; no hardcoded colors leak into components. */
import * as fs from "node:fs"; import * as path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const css = fs.readFileSync(path.join(root, "ui/styles.css"), "utf8");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failures++; };
console.log("\nTheme tokens");

const blockOf = (re: RegExp) => { const m = re.exec(css); return m ? m[0] : ""; };
const light = blockOf(/^:root\{[\s\S]*?\}/m);
const sysDark = blockOf(/@media \(prefers-color-scheme: dark\)\{[\s\S]*?\n\}/);
const attrDark = blockOf(/:root\[data-theme="dark"\]\{[\s\S]*?\}/);
const tokens = (b: string) => new Set([...b.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
const L = tokens(light), S = tokens(sysDark), A = tokens(attrDark);
check("light token block present", L.size > 20, `${L.size} tokens`);
check("system dark block guarded against a viewer-forced light theme", sysDark.includes(':root:not([data-theme="light"])'));
check("viewer data-theme=dark block present", A.size > 20, `${A.size} tokens`);
check("dark blocks cover the same tokens", [...S].every((t) => A.has(t)) && [...A].every((t) => S.has(t)), `${S.size} vs ${A.size}`);
const themeable = [...L].filter((t) => !/^(navy|slate|sky|pale|grey)-\d+$/.test(t));
const missing = themeable.filter((t) => !A.has(t));
check("every themeable light token is redefined for dark", missing.length === 0, missing.join(", "));
check("html and body carry an explicit background and color", /html,body\{background:var\(--bg\);color:var\(--text\)\}/.test(css));
check("inputs set explicit background and text color", /\.field-input input[\s\S]{0,200}background:var\(--input-bg\);color:var\(--input-text\)/.test(css));
check("svg text fills are explicit tokens", /\.hm-cell\{[^}]*fill:var\(--hm-cell-text\)/.test(css) && /\.tc-tick\{[^}]*fill:var\(--axis-text\)/.test(css) && /\.sc-tick\{[^}]*fill:var\(--text\)/.test(css));

// No hardcoded hex/rgb colors in components or charts (tokens only), apart from the amber "stale/running" accent in CSS.
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk(path.join(root, "ui"));
const offenders: string[] = [];
for (const f of files) { const src = fs.readFileSync(f, "utf8"); for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) offenders.push(`${path.relative(root, f)}: ${m[0]}`); }
check("no hardcoded colors in UI components", offenders.length === 0, offenders.slice(0, 6).join(" | "));

// Build output declares both schemes and forces neither.
const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
check("built page declares light dark color-scheme", /<meta name="color-scheme" content="light dark">/.test(html));
check("built page does not force a single color-scheme", !/color-scheme:\s*light\b(?!\s*dark)/.test(html.replace('content="light dark"', "")));
console.log(failures ? `\n${failures} theme check(s) FAILED` : "\nTheme: all checks passed");
process.exit(failures ? 1 : 0);
