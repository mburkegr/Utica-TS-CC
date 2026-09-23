/**
 * Unit search: a small in-memory index over the ODNR Units layer, matching the
 * three things a landman has to hand — the unit name, the operator, the order
 * number. Framework-free, so it runs in Node tests alongside the rest of gis/.
 *
 * Scoped to units deliberately. The reference layers are found by looking at
 * the map; units are 789 polygons you cannot pick out by eye. If a second
 * searchable layer arrives, generalise this then rather than guessing now.
 */
import type { Feature, LayerData } from "./layers/types";
import { operatorOf } from "./layers/registry";

/** Case- and punctuation-insensitive: "2016-237" and "2016 237" are the same query. */
export function normalizeQuery(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface SearchEntry {
  id: string; feature: Feature;
  /** Display fields, as the result row shows them. */
  name: string; operator: string; order: string; status: string; acres: number | null;
  /** Normalized name, plus every other matchable field, for term matching. */
  name_n: string; haystack: string;
}

export interface SearchHit extends SearchEntry { score: number }

/** Minimum query length: one character matches most of the play and is not a search. */
export const MIN_QUERY = 2;
export const DEFAULT_LIMIT = 20;

export function buildUnitIndex(data: LayerData): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const [id, feature] of data.byId) {
    const p = feature.properties ?? {};
    const name = String(p.UNIT_NAME ?? "");
    const filed = String(p.OPERATOR ?? "");
    const operator = operatorOf(filed);
    const order = String(p.ORDER_NO ?? "");
    const acres = typeof p.ACRES === "number" ? p.ACRES : null;
    const name_n = normalizeQuery(name);
    out.push({
      id, feature, name, operator, order, status: String(p.STATUS ?? ""), acres, name_n,
      // The filed operator is indexed too, so searching "Gulfport Energy" still
      // finds units the UI labels "Gulfport Appalachia".
      haystack: [name_n, normalizeQuery(operator), normalizeQuery(filed), normalizeQuery(order)].join(" "),
    });
  }
  return out;
}

/**
 * Every term must appear somewhere in the entry, so "eog 2016" narrows rather
 * than widens. Ranking puts name matches above operator/order matches, and an
 * exact or leading name match above a match in the middle of a name; ties break
 * alphabetically so the order is stable for a given query.
 */
export function searchUnits(index: readonly SearchEntry[], query: string, limit = DEFAULT_LIMIT): SearchHit[] {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY) return [];
  const terms = q.split(" ");
  const hits: SearchHit[] = [];
  for (const e of index) {
    if (!terms.every((t) => e.haystack.includes(t))) continue;
    const score = e.name_n === q ? 4 : e.name_n.startsWith(q) ? 3 : e.name_n.includes(q) ? 2 : 1;
    hits.push({ ...e, score });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}
