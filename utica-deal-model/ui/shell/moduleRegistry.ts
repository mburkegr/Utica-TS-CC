/**
 * Top-level modules of the Utica platform. Deal Model and GIS are peers; a
 * future module (Deal Library, Offset Analysis, Production) is one more entry
 * here plus its component in AppShell. Nothing in this file touches the engine.
 */
export type ModuleKey = "deal" | "gis";

export interface ModuleDefinition { key: ModuleKey; label: string; subtitle: string }

export const MODULES: readonly ModuleDefinition[] = [
  { key: "deal", label: "Deal Model", subtitle: "Acreage underwriting" },
  { key: "gis", label: "GIS", subtitle: "Map and spatial reference" },
];

export const MODULE_STORAGE_KEY = "utica-master-module";
export const DEFAULT_MODULE: ModuleKey = "deal";

export function isModuleKey(v: unknown): v is ModuleKey { return MODULES.some((m) => m.key === v); }

export function loadModuleChoice(): ModuleKey {
  try { const v = globalThis.localStorage?.getItem(MODULE_STORAGE_KEY); return isModuleKey(v) ? v : DEFAULT_MODULE; } catch { return DEFAULT_MODULE; }
}
export function saveModuleChoice(k: ModuleKey): void {
  try { globalThis.localStorage?.setItem(MODULE_STORAGE_KEY, k); } catch { /* ignore */ }
}
