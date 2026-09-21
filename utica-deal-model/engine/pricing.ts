/**
 * Pricing. Mirrors model.build_index_price_series and _load_price_file_cached.
 *
 * Flat mode: the entered oil and gas prices for every month.
 * File mode: deck price (plus the sensitivity shift) before each commodity's
 * flat-start month, and the terminal flat price from that month on. The
 * shift (terminal - base) parallel-shifts the whole deck during sensitivities.
 */

import { type MonthIndex, monthToIso, parseMonth } from "./months";
import type { GlobalAssumptions, PriceDeck, PriceDeckRow } from "./types";

export interface PriceDeckJson {
  rows: { month: string; oil_price: number; gas_price: number }[];
}

/** Build and validate a price deck from the JSON data contract (same rules as the Python loader). */
export function loadPriceDeck(json: PriceDeckJson): PriceDeck {
  if (!json.rows || json.rows.length === 0) {
    throw new Error("The pricing file does not contain any pricing rows.");
  }
  const rows: PriceDeckRow[] = json.rows.map((r) => {
    const month = parseMonth(r.month); // normalizes any day to month start
    const oilPrice = Number(r.oil_price);
    const gasPrice = Number(r.gas_price);
    if (!Number.isFinite(oilPrice) || !Number.isFinite(gasPrice)) {
      throw new Error("The pricing file contains one or more invalid oil or gas prices.");
    }
    return { month, oilPrice, gasPrice };
  });
  rows.sort((a, b) => a.month - b.month);
  const dupes = new Set<MonthIndex>();
  for (let i = 1; i < rows.length; i++) if (rows[i].month === rows[i - 1].month) dupes.add(rows[i].month);
  if (dupes.size) {
    throw new Error(`The pricing file contains duplicate months: ${[...dupes].map(monthToIso).join(", ")}`);
  }
  const missing: MonthIndex[] = [];
  for (let m = rows[0].month; m <= rows[rows.length - 1].month; m++) {
    if (!rows.some((r) => r.month === m)) missing.push(m);
  }
  if (missing.length) {
    throw new Error(`The pricing file is missing monthly pricing for: ${missing.map(monthToIso).join(", ")}`);
  }
  return { rows, firstMonth: rows[0].month, lastMonth: rows[rows.length - 1].month };
}

export interface IndexPriceRow {
  month: MonthIndex;
  indexOilPrice: number;
  indexGasPrice: number;
}

export function buildIndexPriceSeries(
  months: MonthIndex[],
  g: GlobalAssumptions,
  deck: PriceDeck | null,
): IndexPriceRow[] {
  const terminalOil = g.oilPrice;
  const terminalGas = g.gasPrice;

  if (g.pricingMode === "flat") {
    return months.map((m) => ({ month: m, indexOilPrice: terminalOil, indexGasPrice: terminalGas }));
  }
  if (g.pricingMode !== "file") throw new Error(`Unsupported pricing mode: ${g.pricingMode}`);
  if (!deck) throw new Error("File pricing mode requires a price deck.");

  const oilShift = terminalOil - g.baseOilPrice;
  const gasShift = terminalGas - g.baseGasPrice;
  const byMonth = new Map<MonthIndex, PriceDeckRow>();
  for (const r of deck.rows) byMonth.set(r.month, r);

  const out: IndexPriceRow[] = [];
  const missingOil: MonthIndex[] = [];
  const missingGas: MonthIndex[] = [];
  for (const m of months) {
    const row = byMonth.get(m);
    let oil: number;
    let gas: number;
    if (m >= g.oilFlatStartDate) oil = terminalOil;
    else if (row) oil = row.oilPrice + oilShift;
    else { oil = NaN; missingOil.push(m); }
    if (m >= g.gasFlatStartDate) gas = terminalGas;
    else if (row) gas = row.gasPrice + gasShift;
    else { gas = NaN; missingGas.push(m); }
    out.push({ month: m, indexOilPrice: oil, indexGasPrice: gas });
  }
  if (missingOil.length) {
    throw new Error(
      "The pricing file does not contain oil pricing for " +
        uniqueLabels(missingOil).slice(0, 5).join(", ") +
        ". Either add those months to the file or select an earlier oil flat-pricing date.",
    );
  }
  if (missingGas.length) {
    throw new Error(
      "The pricing file does not contain gas pricing for " +
        uniqueLabels(missingGas).slice(0, 5).join(", ") +
        ". Either add those months to the file or select an earlier gas flat-pricing date.",
    );
  }
  return out;
}

function uniqueLabels(months: MonthIndex[]): string[] {
  const seen = new Set<MonthIndex>();
  const out: string[] = [];
  for (const m of months) if (!seen.has(m)) { seen.add(m); out.push(monthToIso(m)); }
  return out;
}
