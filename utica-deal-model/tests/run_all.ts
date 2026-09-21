// Runs every module reconciliation in the agreed order; exits non-zero on the first failing module.
import { spawnSync } from "node:child_process";
const modules = ["reconcile_pricing", "reconcile_ngl", "reconcile_ownership", "reconcile_well", "reconcile_layers", "reconcile_calendar", "reconcile_promote", "reconcile_returns", "reconcile_sensitivities", "reconcile_reporting", "regression_flowback_zero", "regression_ngl_profiles", "ui_boundary.test", "ui_integration.test", "ui_downloads.test", "ui_theme.test", "ui_ngl_profiles.test", "ui_footnotes.test", "ui_sensitivity_generate_all.test", "ui_shell.test", "gis_registry.test", "gis_data.test", "gis_store.test", "gis_ui.test"];
for (const m of modules) {
  const file = m.startsWith("ui_integration") || m.startsWith("ui_downloads") || m.startsWith("ui_ngl") || m.startsWith("ui_footnotes") || m.startsWith("ui_sensitivity") || m.startsWith("ui_shell") || m.startsWith("gis_ui") ? `tests/${m}.tsx` : `tests/${m}.ts`;
  const r = spawnSync("npx", ["tsx", file], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`\nSTOP: ${m} did not reconcile; later modules not run.`); process.exit(1); }
}
console.log("\nAll modules reconciled.");
