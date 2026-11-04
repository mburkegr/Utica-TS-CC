/**
 * Unit selection for analysis: the units a user has picked on the map, joined
 * across every loaded unit layer by unit id, and summarised.
 *
 * The join is generic: a unit's attributes are the union of its properties in
 * each layer passed in, first non-empty value wins. The ODNR units layer gives
 * every unit its operator; the D&C layer adds hearing date, wells, average
 * lateral and $/ft where the workbook has them. A unit the workbook does not
 * cover keeps those fields null rather than borrowing a value from elsewhere.
 * Framework-free, so it runs in Node tests with the rest of gis/.
 */
import type { LayerData } from "./layers/types";
import { operatorOf } from "./layers/registry";

export interface UnitAnalysisRow {
  id: string;
  name: string;
  operator: string;
  /** ISO date of the ODNR unit hearing, as stored; null when the D&C workbook has no row for the unit. */
  hearingDate: string | null;
  hearingYear: number | null;
  wells: number | null;
  avgLateralFt: number | null;
  dcPerFt: number | null;
  acres: number | null;
}

export interface UnitAnalysisSummary {
  units: number;
  /** Units that carry a D&C cost (and with it wells and lateral). */
  unitsWithDc: number;
  /** Wells across units with D&C data. */
  wells: number;
  /** Lateral feet per well across those units: sum(wells x lateral) / sum(wells). */
  avgLateralFt: number | null;
  /** Cost per lateral foot across those units: sum(wells x lateral x $/ft) / sum(wells x lateral). */
  dcPerFt: number | null;
}

const filled = (v: unknown) => v !== null && v !== undefined && v !== "";
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Add the id if absent, remove it if present; order of selection is kept. */
export function toggleUnitId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** One row per selected id found in any layer, in selection order; ids no layer has are skipped. */
export function unitAnalysisRows(ids: readonly string[], layers: readonly (LayerData | null)[]): UnitAnalysisRow[] {
  const ready = layers.filter((l): l is LayerData => l !== null);
  const rows: UnitAnalysisRow[] = [];
  for (const id of ids) {
    const p: Record<string, unknown> = {};
    for (const l of ready) {
      const props = l.byId.get(id)?.properties ?? {};
      for (const [k, v] of Object.entries(props)) if (!filled(p[k]) && filled(v)) p[k] = v;
    }
    if (Object.keys(p).length === 0) continue;
    const date = typeof p.HEARING_DATE === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.HEARING_DATE) ? p.HEARING_DATE : null;
    rows.push({
      id, name: String(p.UNIT_NAME ?? id), operator: operatorOf(p.OPERATOR),
      hearingDate: date, hearingYear: date ? Number(date.slice(0, 4)) : null,
      wells: num(p.WELLS), avgLateralFt: num(p.AVG_LATERAL_FT), dcPerFt: num(p.DC_PER_FT), acres: num(p.ACRES),
    });
  }
  return rows;
}

/**
 * Footage-weighted, so a four-well unit counts four times a one-well unit and
 * a long lateral counts for its length: the blended $/ft is total cost over
 * total lateral feet, the number a per-foot AFE comparison wants.
 */
export function unitAnalysisSummary(rows: readonly UnitAnalysisRow[]): UnitAnalysisSummary {
  let wells = 0, feet = 0, cost = 0, withDc = 0;
  for (const r of rows) {
    if (r.dcPerFt === null || r.wells === null || r.avgLateralFt === null) continue;
    withDc++; wells += r.wells; feet += r.wells * r.avgLateralFt; cost += r.wells * r.avgLateralFt * r.dcPerFt;
  }
  return { units: rows.length, unitsWithDc: withDc, wells, avgLateralFt: wells > 0 ? feet / wells : null, dcPerFt: feet > 0 ? cost / feet : null };
}
