/** Display formatting only. Accounting style: negatives in parentheses, zero as a dash. */
const isZero = (x: number) => Math.abs(x) < 1e-9;
export function fmtNumber(x: number | null | undefined, decimals = 1, prefix = "", suffix = "", zeroDash = true): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "";
  if (zeroDash && isZero(x)) return "-";
  const t = `${prefix}${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  return x < 0 ? `(${t})` : t;
}
export function fmtPct(x: number | null | undefined, decimals = 1, zeroDash = false): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "N/A";
  if (zeroDash && isZero(x)) return "-";
  const t = `${(Math.abs(x) * 100).toFixed(decimals)}%`;
  return x < 0 ? `(${t})` : t;
}
export function fmtMultiple(x: number | null | undefined, decimals = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "N/A";
  return `${x.toFixed(decimals)}x`;
}
export function fmtThousands(x: number | null | undefined, decimals = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "";
  if (isZero(x)) return "-";
  const t = `$${Math.abs(x / 1000).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}k`;
  return x < 0 ? `(${t})` : t;
}
export function fmtProduction(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "";
  if (isZero(x)) return "-";
  return fmtNumber(x, Math.abs(x) >= 10 ? 0 : 2);
}
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m] = iso.split("-");
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1]} ${y}`;
}
export function fmtDayNumber(d: number | null | undefined): string {
  if (d === null || d === undefined) return "-";
  const date = new Date(Math.floor(d) * 86400000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}
