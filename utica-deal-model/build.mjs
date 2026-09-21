// Builds one self-contained HTML artifact: React UMD from cdnjs, inline CSS, inline engine+UI bundle with data.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("dist", { recursive: true });
const result = await build({
  entryPoints: ["ui/main.tsx"], bundle: true, format: "iife", platform: "browser", target: "es2020", minify: true, write: false,
  jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
  alias: { "react": "./ui/shims/react.mjs", "react-dom/client": "./ui/shims/react-dom-client.mjs" },
  loader: { ".json": "json" }, legalComments: "none",
});
const js = result.outputFiles[0].text;
const css = readFileSync("ui/styles.css", "utf8");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Utica Deal Model</title>
<style>${css}</style>
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,400..800;1,6..12,400..800&family=IBM+Plex+Mono:wght@500;600&display=swap">
</head><body><div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js.replace(/<\/script/g, "<\\/script")}</script>
</body></html>`;
writeFileSync("dist/index.html", html);
console.log(`dist/index.html: ${(html.length / 1024 / 1024).toFixed(2)} MB (js ${(js.length / 1024).toFixed(0)} KB)`);
