/**
 * Unit lookup: search and operator filtering over the ODNR Units layer.
 *
 * Search indexes the three things a landman has to hand — the unit name, the
 * operator, the order number. Filtering narrows the layer itself to a chosen
 * set of operators, so the map draws only those units. Framework-free, so both run in
 * Node tests alongside the rest of gis/.
 *
 * Scoped to units deliberately. The reference layers are found by looking at
 * the map; units are 789 polygons you cannot pick out by eye. If a second
 * searchable layer arrives, generalise this then rather than guessing now.
 */
import type { Feature, LayerData, LayerDefinition } from "./layers/types";
import { operatorOf } from "./layers/registry";
import { indexCollection } from "./data/loaders";

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
export function searchUnits(index: readonly SearchEntry[], query: string, limit = DEFAULT_LIMIT, operators: readonly string[] = []): SearchHit[] {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY) return [];
  const terms = q.split(" ");
  const selected = operators.length ? new Set(operators) : null;
  const hits: SearchHit[] = [];
  for (const e of index) {
    // An active operator filter also narrows search, so a result can never be
    // a unit the map is currently hiding.
    if (selected && !selected.has(e.operator)) continue;
    if (!terms.every((t) => e.haystack.includes(t))) continue;
    const score = e.name_n === q ? 4 : e.name_n.startsWith(q) ? 3 : e.name_n.includes(q) ? 2 : 1;
    hits.push({ ...e, score });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Operator filter
// ---------------------------------------------------------------------------

export interface OperatorOption { operator: string; count: number }

/**
 * Canonical operators present in the data, most units first then alphabetical,
 * so the dropdown leads with the operators that actually hold acreage. Built
 * from the canonical name, so the Gulfport and EOG variants appear once each.
 */
export function operatorOptions(data: LayerData): OperatorOption[] {
  const counts = new Map<string, number>();
  for (const f of data.collection.features) {
    const op = operatorOf(f.properties?.OPERATOR);
    if (op) counts.set(op, (counts.get(op) ?? 0) + 1);
  }
  return [...counts].map(([operator, count]) => ({ operator, count }))
    .sort((a, b) => b.count - a.count || a.operator.localeCompare(b.operator));
}

/**
 * The layer narrowed to the selected operators, re-indexed so its bbox, byId
 * and feature count describe the subset — "zoom to layer" then frames that
 * selection's acreage, and the feature count reports what is actually drawn.
 * An empty selection means every operator and returns the original data, so
 * the unfiltered case allocates nothing.
 */
export function filterUnitsByOperators(def: LayerDefinition, data: LayerData, operators: readonly string[]): LayerData {
  if (operators.length === 0) return data;
  const selected = new Set(operators);
  const features = data.collection.features.filter((f) => selected.has(operatorOf(f.properties?.OPERATOR)));
  if (features.length === data.collection.features.length) return data;
  if (features.length === 0) return { collection: { ...data.collection, features }, bbox: data.bbox, featureCount: 0, byId: new Map() };
  return indexCollection(def, { ...data.collection, features });
}
