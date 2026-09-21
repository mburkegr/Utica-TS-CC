/**
 * Month arithmetic. The engine represents every model date as an integer
 * month index (year * 12 + month0). Calendar strings are produced only at the
 * boundaries (fixtures, XIRR, display). This reproduces pandas
 * `to_period("M").to_timestamp()` normalization and `DateOffset(months=n)`
 * without any dependence on JavaScript Date/timezone behavior.
 */

export type MonthIndex = number; // year * 12 + (month - 1)

export function monthIndex(year: number, month1: number): MonthIndex {
  return year * 12 + (month1 - 1);
}

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS...' and normalize to month start. */
export function parseMonth(iso: string): MonthIndex {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Invalid date string: ${iso}`);
  return monthIndex(Number(m[1]), Number(m[2]));
}

export function monthToIso(mi: MonthIndex): string {
  const year = Math.floor(mi / 12);
  const month1 = (mi - year * 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}-01`;
}

export function monthYear(mi: MonthIndex): number {
  return Math.floor(mi / 12);
}

export function monthOfYear1(mi: MonthIndex): number {
  return (mi - Math.floor(mi / 12) * 12) + 1;
}

export function monthRange(start: MonthIndex, endInclusive: MonthIndex): MonthIndex[] {
  const out: MonthIndex[] = [];
  for (let m = start; m <= endInclusive; m++) out.push(m);
  return out;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(mi: MonthIndex): number {
  const y = monthYear(mi);
  const m1 = monthOfYear1(mi);
  if (m1 === 2 && isLeapYear(y)) return 29;
  return DAYS_IN_MONTH[m1 - 1];
}

/** Days since 1970-01-01 for the first day of the month (proleptic Gregorian, integer arithmetic). */
export function monthStartDayNumber(mi: MonthIndex): number {
  const y = monthYear(mi);
  const m1 = monthOfYear1(mi);
  return civilToDays(y, m1, 1);
}

/** Howard Hinnant's days-from-civil algorithm. */
export function civilToDays(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
