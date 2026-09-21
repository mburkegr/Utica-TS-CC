/**
 * Returns. Mirrors model.calc_financial_irr (pyxirr.xirr), calc_financial_moic,
 * and the payback interpolation in build_cumulative_fcf_chart (full life, no
 * 2040 display cutoff; the UI may window the chart separately).
 *
 * XIRR: rate r solving sum cf_i / (1+r)^((d_i - d_0)/365) = 0, Actual/365F
 * on first-of-month dates. Newton-Raphson from 0.1, falling back to a
 * bracketed bisection, mirroring pyxirr. Returns null when there is no sign
 * change in the cash flows or no root is found (Python returns None).
 *
 * MOIC: sum of positive monthly deal cash flows / -sum of negative ones, on
 * the deal-level netted series (methodology preserved; flagged for later
 * review). null when nothing is invested.
 */

import { type MonthIndex, monthStartDayNumber } from "./months";

export const XIRR_GUESS = 0.1;
const NEWTON_TOL = 1e-10;
const NEWTON_MAX_ITER = 100;

export function xnpv(rate: number, dayFractions: number[], cfs: number[]): number {
  let s = 0.0;
  for (let i = 0; i < cfs.length; i++) s += cfs[i] / Math.pow(1.0 + rate, dayFractions[i]);
  return s;
}

function dxnpv(rate: number, dayFractions: number[], cfs: number[]): number {
  let s = 0.0;
  for (let i = 0; i < cfs.length; i++) s += (-dayFractions[i] * cfs[i]) / Math.pow(1.0 + rate, dayFractions[i] + 1.0);
  return s;
}

export function xirr(months: MonthIndex[], cfs: number[], guess = XIRR_GUESS): number | null {
  if (months.length !== cfs.length || cfs.length === 0) return null;
  let hasPos = false, hasNeg = false;
  for (const c of cfs) { if (c > 0) hasPos = true; if (c < 0) hasNeg = true; }
  if (!hasPos || !hasNeg) return null; // pyxirr InvalidPaymentsError -> Python None

  const d0 = monthStartDayNumber(months[0]);
  const t = months.map((m) => (monthStartDayNumber(m) - d0) / 365.0);

  // Newton-Raphson
  let r = guess;
  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    const f = xnpv(r, t, cfs);
    const df = dxnpv(r, t, cfs);
    if (!Number.isFinite(f) || !Number.isFinite(df) || df === 0) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= -1.0) break;
    if (Math.abs(next - r) < NEWTON_TOL) return next;
    r = next;
  }
  // Fallback: bracket scan then bisection (pyxirr falls back to a bracketed method).
  const grid = [-0.9999, -0.99, -0.9, -0.5, -0.25, 0.0, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 100.0];
  for (let i = 1; i < grid.length; i++) {
    let lo = grid[i - 1], hi = grid[i];
    let flo = xnpv(lo, t, cfs), fhi = xnpv(hi, t, cfs);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) continue;
    for (let k = 0; k < 300; k++) {
      const mid = 0.5 * (lo + hi);
      const fm = xnpv(mid, t, cfs);
      if (fm === 0 || (hi - lo) < 1e-14) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return 0.5 * (lo + hi);
  }
  return null;
}

export function moic(cfs: number[]): number | null {
  let invested = 0.0, returned = 0.0;
  for (const c of cfs) { if (c < 0) invested -= c; else if (c > 0) returned += c; }
  if (invested === 0) return null;
  return returned / invested;
}

export interface Payback {
  /** Days since 1970-01-01 (fractional), or null if cumulative FCF never turns non-negative. */
  paybackDayNumber: number | null;
  paybackYears: number | null;
  startMonth: MonthIndex;
}

/** Same interpolation as build_cumulative_fcf_chart: cumulative FCF in $k, first negative->non-negative crossing. */
export function payback(months: MonthIndex[], cfs: number[], cutoffMonth?: MonthIndex): Payback {
  const idx = months.map((_, i) => i).filter((i) => cutoffMonth === undefined || months[i] <= cutoffMonth);
  const start = months[idx[0]];
  let cum = 0.0;
  const cums: number[] = [];
  for (const i of idx) { cum += cfs[i] / 1000.0; cums.push(cum); }
  const startDay = monthStartDayNumber(start);
  for (let k = 1; k < cums.length; k++) {
    const prev = cums[k - 1], curr = cums[k];
    if (prev < 0 && 0 <= curr) {
      const prevDay = monthStartDayNumber(months[idx[k - 1]]);
      const currDay = monthStartDayNumber(months[idx[k]]);
      const frac = curr === prev ? 0 : (0 - prev) / (curr - prev);
      const payDay = prevDay + (currDay - prevDay) * frac;
      // pandas Timedelta.days truncates to whole days before / 365.25
      const years = Math.floor(payDay - startDay) / 365.25;
      return { paybackDayNumber: payDay, paybackYears: years, startMonth: start };
    }
  }
  return { paybackDayNumber: null, paybackYears: null, startMonth: start };
}
