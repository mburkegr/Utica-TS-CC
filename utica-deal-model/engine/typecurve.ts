/**
 * Type-curve library. Mirrors model._load_type_curve_library_cached on the
 * JSON data contract, plus the validations agreed for the TypeScript loader
 * (months start at 1, contiguous, finite non-negative volumes).
 */

import type { TypeCurve, TypeCurveLibrary } from "./types";

/** Identical to model.clean_tc_name: str(name).strip().lower().replace(" ", "_"). */
export function cleanTcName(name: string): string {
  return String(name).trim().toLowerCase().split(" ").join("_");
}

export interface TypeCurveLibraryJson {
  curves: Record<string, { raw_name: string; base_lateral: number; months: number[]; oil: number[]; gas: number[] }>;
}

export function loadTypeCurveLibrary(json: TypeCurveLibraryJson): TypeCurveLibrary {
  const lib: TypeCurveLibrary = new Map();
  for (const [key, c] of Object.entries(json.curves)) {
    const name = cleanTcName(key);
    const n = c.months.length;
    if (n === 0) throw new Error(`Type curve '${name}' has no months`);
    if (c.oil.length !== n || c.gas.length !== n) throw new Error(`Type curve '${name}' has ragged columns`);
    // Sort by month (Python sorts), then validate contiguity from 1.
    const idx = c.months.map((_, i) => i).sort((a, b) => c.months[a] - c.months[b]);
    const months = idx.map((i) => Math.trunc(c.months[i]));
    const oil = idx.map((i) => c.oil[i]);
    const gas = idx.map((i) => c.gas[i]);
    for (let i = 0; i < n; i++) {
      if (months[i] !== i + 1) throw new Error(`Type curve '${name}' months are not contiguous from 1 (position ${i} has month ${months[i]})`);
      if (!Number.isFinite(oil[i]) || !Number.isFinite(gas[i]) || oil[i] < 0 || gas[i] < 0) {
        throw new Error(`Type curve '${name}' has an invalid volume at month ${months[i]}`);
      }
    }
    const baseLateral = Number(c.base_lateral);
    if (!Number.isFinite(baseLateral) || baseLateral <= 0) throw new Error(`Type curve '${name}' has invalid base_lateral`);
    lib.set(name, { name, rawName: c.raw_name, baseLateral, months, oil, gas });
  }
  return lib;
}

export function getTypeCurve(lib: TypeCurveLibrary, tcName: string): TypeCurve {
  const tc = lib.get(cleanTcName(tcName));
  if (!tc) throw new Error(`Type curve not found: ${tcName}`);
  return tc;
}
