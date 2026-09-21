import React from "react";
import type { ProductionSeriesPoint, CumulativeFcfPoint, MonthIndex } from "../../engine/index";
import { monthYear } from "../../engine/index";
import { fmtDayNumber } from "../format/format";

const OIL = "var(--oil)", NGL = "var(--ngl)", GAS = "var(--gas)";
const W = 900, H = 320, L = 64, R = 20, T = 28, B = 44;

function yearTicks(months: MonthIndex[]): MonthIndex[] {
  const out: MonthIndex[] = [];
  for (const m of months) if (m % 12 === 0) out.push(m);
  return out;
}

export function ProductionChart({ series, view }: { series: ProductionSeriesPoint[]; view: "stacked" | "split" }) {
  if (series.length === 0) return null;
  const m0 = series[0].month, m1 = series[series.length - 1].month;
  const maxY = Math.max(1, ...series.map((p) => (view === "stacked" ? p.totalMcfePerDay : Math.max(p.oilMcfePerDay, p.nglMcfePerDay, p.residueGasMcfePerDay)))) * 1.05;
  const x = (m: MonthIndex) => L + ((m - m0) / Math.max(1, m1 - m0)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) - (v / maxY) * (H - T - B);
  const area = (top: (p: ProductionSeriesPoint) => number, bottom: (p: ProductionSeriesPoint) => number) =>
    `M${series.map((p) => `${x(p.month)},${y(top(p))}`).join("L")}L${[...series].reverse().map((p) => `${x(p.month)},${y(bottom(p))}`).join("L")}Z`;
  const line = (f: (p: ProductionSeriesPoint) => number) => `M${series.map((p) => `${x(p.month)},${y(f(p))}`).join("L")}`;
  return (
    <svg className="tchart" viewBox={`0 0 ${W} ${H}`} aria-label="Net production profile">
      <defs>
        <linearGradient id="gOil" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: "var(--oil)", stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: "var(--oil)", stopOpacity: 0.8 }} /></linearGradient>
        <linearGradient id="gNgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: "var(--ngl)", stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: "var(--ngl)", stopOpacity: 0.78 }} /></linearGradient>
        <linearGradient id="gGas" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: "var(--gas)", stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: "var(--gas)", stopOpacity: 0.75 }} /></linearGradient>
      </defs>
      <text x={L} y={16} className="tc-title">{view === "stacked" ? "Net Production Profile (Mcfe/d): oil, theoretical NGL, residue gas" : "Net Production Stream Split (Mcfe/d)"}</text>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(f * maxY)} y2={y(f * maxY)} stroke="var(--grid-line)" /><text x={L - 6} y={y(f * maxY) + 4} textAnchor="end" className="tc-tick">{Math.round(f * maxY).toLocaleString()}</text></g>)}
      {view === "stacked" ? (
        <>
          <path d={area((p) => p.oilMcfePerDay, () => 0)} fill="url(#gOil)" />
          <path d={area((p) => p.oilMcfePerDay + p.nglMcfePerDay, (p) => p.oilMcfePerDay)} fill="url(#gNgl)" />
          <path d={area((p) => p.totalMcfePerDay, (p) => p.oilMcfePerDay + p.nglMcfePerDay)} fill="url(#gGas)" />
        </>
      ) : (
        <>
          <path d={line((p) => p.oilMcfePerDay)} stroke={OIL} strokeWidth={2.5} fill="none" />
          <path d={line((p) => p.nglMcfePerDay)} stroke={NGL} strokeWidth={2.5} fill="none" />
          <path d={line((p) => p.residueGasMcfePerDay)} stroke={GAS} strokeWidth={2.5} fill="none" />
        </>
      )}
      {yearTicks(series.map((p) => p.month)).map((m) => <text key={m} x={x(m)} y={H - B + 16} textAnchor="middle" className="tc-tick">{monthYear(m)}</text>)}
      <g className="legend">{[["Oil", OIL], ["NGL (theoretical yield)", NGL], ["Residue gas (post-shrink)", GAS]].map(([l, c], i) => <g key={l}><rect x={L + i * 210} y={H - 14} width={12} height={12} fill={c} /><text x={L + 16 + i * 210} y={H - 4} className="tc-tick">{l}</text></g>)}</g>
    </svg>
  );
}

export function CumulativeFcfChart({ series, paybackDay, paybackYears, spuds }: { series: CumulativeFcfPoint[]; paybackDay: number | null; paybackYears: number | null; spuds: { month: MonthIndex; grossWells: number }[] }) {
  if (series.length === 0) return null;
  const m0 = series[0].month, m1 = series[series.length - 1].month;
  const vals = series.map((p) => p.cumulativeFcfK);
  const minY = Math.min(0, ...vals) * 1.05, maxY = Math.max(1, ...vals) * 1.05;
  const x = (m: MonthIndex) => L + ((m - m0) / Math.max(1, m1 - m0)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) - ((v - minY) / (maxY - minY)) * (H - T - B);
  const dayToX = (d: number) => { const dm = m0 + (d - monthStartDays(m0)) / 30.4375; return x(dm); };
  return (
    <svg className="tchart" viewBox={`0 0 ${W} ${H}`} aria-label="Cumulative free cash flow">
      <defs><linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: "var(--ngl)", stopOpacity: 0.55 }} /><stop offset="100%" style={{ stopColor: "var(--ngl)", stopOpacity: 0.05 }} /></linearGradient></defs>
      <text x={W / 2} y={16} textAnchor="middle" className="tc-title bold">Cumulative Free Cash Flow ($ thousands)</text>
      {spuds.filter((s) => s.month >= m0 && s.month <= m1).map((s, i) => <g key={i}><rect x={x(s.month)} y={T} width={Math.max(2, x(s.month + 1) - x(s.month))} height={H - T - B} fill="var(--accent-fill)" /><text transform={`translate(${x(s.month) + 10} ${T + 40}) rotate(-90)`} className="tc-tick" textAnchor="end">{s.grossWells.toFixed(1)} gross wells</text></g>)}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = minY + f * (maxY - minY); return <g key={f}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="tc-tick">{Math.round(v).toLocaleString()}</text></g>; })}
      <path d={`M${series.map((p) => `${x(p.month)},${y(p.cumulativeFcfK)}`).join("L")}L${x(m1)},${y(0)}L${x(m0)},${y(0)}Z`} fill="url(#cumFill)" />
      <path d={`M${series.map((p) => `${x(p.month)},${y(p.cumulativeFcfK)}`).join("L")}`} stroke="var(--ngl)" strokeWidth={2.5} fill="none" />
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="4 3" />
      {paybackDay !== null && dayToX(paybackDay) <= W - R && (
        <g><line x1={dayToX(paybackDay)} x2={dayToX(paybackDay)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="2 3" />
          <text x={dayToX(paybackDay)} y={T - 8} textAnchor="middle" className="tc-title bold">Payback = {paybackYears?.toFixed(1)} years ({fmtDayNumber(paybackDay)})</text></g>
      )}
      {yearTicks(series.map((p) => p.month)).map((m) => <text key={m} x={x(m)} y={H - B + 16} textAnchor="middle" className="tc-tick">{monthYear(m)}</text>)}
    </svg>
  );
}

function monthStartDays(m: MonthIndex): number {
  const y = Math.floor(m / 12), mo = m - y * 12 + 1;
  return Math.floor(Date.UTC(y, mo - 1, 1) / 86400000);
}
