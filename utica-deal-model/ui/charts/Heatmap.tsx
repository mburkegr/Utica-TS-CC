import React from "react";
import type { SensitivityGrid } from "../../engine/index";
import { monthToIso } from "../../engine/index";
import { fmtMonth, fmtPct, fmtMultiple } from "../format/format";

/**
 * IRR / MOIC heatmap. Thresholds still drive the color family (below, at, above
 * target) but each family shades continuously within its range, so gradients
 * read as a surface rather than three flat blocks. Colors are theme tokens.
 */
const BANDS = {
  irr: { lo: 0.15, hi: 0.25, floor: -0.05, ceil: 0.45 },
  moic: { lo: 1.5, hi: 1.8, floor: 0.8, ceil: 2.6 },
} as const;

function shade(metric: "irr" | "moic", v: number | null): { fill: string; weight: number } {
  if (v === null || Number.isNaN(v)) return { fill: "var(--hm-null)", weight: 0 };
  const b = BANDS[metric];
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (v < b.lo) {
    const t = clamp((v - b.floor) / (b.lo - b.floor)); // 0 = worst, 1 = just below target
    return { fill: `color-mix(in oklab, var(--hm-red-2) ${Math.round((1 - t) * 100)}%, var(--hm-red-1))`, weight: 1 - t };
  }
  if (v < b.hi) {
    const t = clamp((v - b.lo) / (b.hi - b.lo));
    return { fill: `color-mix(in oklab, var(--hm-amber-2) ${Math.round(t * 100)}%, var(--hm-amber-1))`, weight: 0.5 };
  }
  const t = clamp((v - b.hi) / (b.ceil - b.hi));
  return { fill: `color-mix(in oklab, var(--hm-green-2) ${Math.round(t * 100)}%, var(--hm-green-1))`, weight: t };
}

function closest(values: number[], target: number | undefined): number {
  if (target === undefined) return -1;
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - target) < Math.abs(values[best] - target)) best = i;
  return best;
}

export function axisLabel(v: number, format: string): string {
  switch (format) {
    case "dollar": return Number.isInteger(v) ? `$${v.toLocaleString("en-US")}` : `$${v.toFixed(2)}`;
    case "percent": return `${(v * 100).toFixed(0)}%`;
    case "percent1": return `${(v * 100).toFixed(1)}%`;
    case "float2": return v.toFixed(2);
    case "date": return fmtMonth(monthToIso(v)).replace(" ", "-").replace(/(\w+)-(\d{4})/, (_m, a, y) => `${a}-${String(y).slice(2)}`);
    default: return String(v);
  }
}

export function Heatmap({ grid, metric, title, reverseY = false }: { grid: SensitivityGrid; metric: "irr" | "moic"; title: string; reverseY?: boolean }) {
  const { spec } = grid;
  const data = metric === "irr" ? grid.irr : grid.moic;
  const nx = spec.xValues.length, ny = spec.yValues.length;
  const cw = 76, ch = 32, gap = 2, left = 104, top = 62;
  const w = left + nx * cw + 10, h = top + ny * ch + 30;
  const bx = closest(spec.xValues as number[], spec.baseX), by = closest(spec.yValues as number[], spec.baseY);
  const yOrder = reverseY ? [...Array(ny).keys()].reverse() : [...Array(ny).keys()];
  const target = metric === "irr" ? "15% / 25% IRR" : "1.50x / 1.80x MOIC";
  return (
    <figure className="hm-figure">
      <figcaption className="hm-cap"><span className="hm-cap-title">{title}</span><span className="hm-legend" aria-label={`Color bands at ${target}`}>
        <i className="sw sw-red" /> below target<i className="sw sw-amber" /> at target<i className="sw sw-green" /> above
      </span></figcaption>
      <svg className="heatmap" viewBox={`0 0 ${w} ${h}`} role="table" aria-label={title} data-metric={metric}>
        <text x={left + (nx * cw) / 2} y={20} className="hm-axis" textAnchor="middle">{spec.xTitle}</text>
        {spec.xValues.map((x, i) => <text key={i} x={left + i * cw + cw / 2} y={top - 10} className="hm-tick" textAnchor="middle">{axisLabel(x as number, spec.xFormat)}</text>)}
        <text transform={`translate(16 ${top + (ny * ch) / 2}) rotate(-90)`} className="hm-axis" textAnchor="middle">{spec.yTitle}</text>
        {yOrder.map((yi, r) => (
          <g key={yi}>
            <text x={left - 12} y={top + r * ch + ch / 2 + 4} className={yi === by ? "hm-tick base" : "hm-tick"} textAnchor="end">{axisLabel(spec.yValues[yi] as number, spec.yFormat)}</text>
            {spec.xValues.map((_x, xi) => {
              const v = data[yi][xi];
              const { fill } = shade(metric, v);
              const isBase = xi === bx && yi === by;
              return (
                <g key={xi}>
                  <rect x={left + xi * cw + gap / 2} y={top + r * ch + gap / 2} width={cw - gap} height={ch - gap} rx={5} fill={fill} />
                  <text x={left + xi * cw + cw / 2} y={top + r * ch + ch / 2 + 4} className={isBase ? "hm-cell base" : "hm-cell"} textAnchor="middle" data-cell={`${yi}-${xi}`}>
                    {v === null ? "" : metric === "irr" ? fmtPct(v, 1) : fmtMultiple(v)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        {bx >= 0 && by >= 0 && (
          <g>
            <rect x={left + bx * cw + gap / 2} y={top + yOrder.indexOf(by) * ch + gap / 2} width={cw - gap} height={ch - gap} rx={5} fill="none" stroke="var(--hm-base-ring)" strokeWidth={2} />
            <text x={left + bx * cw + cw / 2} y={h - 10} className="hm-tick base" textAnchor="middle">base case</text>
          </g>
        )}
      </svg>
    </figure>
  );
}
