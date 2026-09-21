import React from "react";
import type { ScenarioPoint } from "../../engine/index";
import { fmtPct } from "../format/format";

const DC_COLOR: Record<string, string> = { Low: "var(--gas)", Base: "var(--ngl)", High: "var(--oil)" };
const TC_SIZE: Record<string, number> = { "0.8": 4, "1": 7, "1.2": 10 };

export function ScenarioMatrix({ points, dcLabels, pricingLabels, baseBid, baseTcRisk }: { points: ScenarioPoint[]; dcLabels: Record<string, string>; pricingLabels: Record<string, string>; baseBid: number; baseTcRisk: number }) {
  const panels: ScenarioPoint["pricingCase"][] = ["Downside", "Base", "Upside"];
  const valid = points.filter((p) => p.irr !== null);
  const irrs = valid.map((p) => p.irr as number);
  const yMin = Math.min(0, ...irrs), yMax = Math.max(0.1, ...irrs) * 1.05;
  const bids = [...new Set(points.map((p) => p.bid))].sort((a, b) => a - b);
  const pw = 300, ph = 260, left = 56, bottom = 40, top = 30, gap = 24;
  const w = left + 3 * pw + 2 * gap + 12, h = top + ph + bottom + 44;
  const x = (bid: number, i: number) => left + i * (pw + gap) + ((bid - bids[0]) / Math.max(1, bids[bids.length - 1] - bids[0])) * (pw - 30) + 15;
  const y = (irr: number) => top + ph - ((irr - yMin) / (yMax - yMin)) * ph;
  const nearest = (arr: number[], t: number) => arr.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  const baseTc = nearest([0.8, 1.0, 1.2], Math.round(baseTcRisk * 100) / 100);
  const baseBidV = nearest(bids, baseBid);
  return (
    <svg className="scatter" viewBox={`0 0 ${w} ${h}`} aria-label="Scenario matrix: IRR vs $/acre bid">
      {panels.map((pc, i) => {
        const x0 = left + i * (pw + gap);
        const pts = valid.filter((p) => p.pricingCase === pc);
        return (
          <g key={pc}>
            <text x={x0 + pw / 2} y={16} textAnchor="middle" className="sc-title">{pricingLabels[pc]}</text>
            <rect x={x0} y={top} width={pw} height={ph} fill="var(--chart-bg)" stroke="var(--line)" />
            {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = yMin + f * (yMax - yMin); return <g key={f}><line x1={x0} x2={x0 + pw} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" />{i === 0 && <text x={x0 - 6} y={y(v) + 4} textAnchor="end" className="sc-tick">{fmtPct(v, 0)}</text>}</g>; })}
            {bids.map((b) => <text key={b} x={x(b, i)} y={top + ph + 14} textAnchor="middle" className="sc-tick">${(b / 1000).toFixed(1)}k</text>)}
            <text x={x0 + pw / 2} y={top + ph + 30} textAnchor="middle" className="sc-axis">$/Acre Bid</text>
            {pts.map((p, k) => <circle key={k} cx={x(p.bid, i)} cy={y(p.irr as number)} r={TC_SIZE[String(p.tcRisk)] ?? 6} fill={DC_COLOR[p.dcCase]} fillOpacity={0.7} stroke="var(--band-edge)" strokeWidth={0.5}><title>{`Bid $${p.bid.toFixed(0)} | IRR ${fmtPct(p.irr, 1)} | ${p.dcLabel} | TC ${fmtPct(p.tcRisk, 0)} | Oil $${p.oilPrice.toFixed(0)} Gas $${p.gasPrice.toFixed(2)}`}</title></circle>)}
            {pc === "Base" && pts.filter((p) => p.dcCase === "Base" && p.tcRisk === baseTc && p.bid === baseBidV).map((p, k) => <circle key={`b${k}`} cx={x(p.bid, i)} cy={y(p.irr as number)} r={9} fill="none" stroke="var(--text)" strokeWidth={2.5} />)}
          </g>
        );
      })}
      <text x={left} y={top + ph + 46} className="sc-axis">IRR</text>
      {(["Low", "Base", "High"] as const).map((k, i) => <g key={k}><circle cx={left + 120 + i * 190} cy={h - 22} r={6} fill={DC_COLOR[k]} /><text x={left + 132 + i * 190} y={h - 18} className="sc-tick">{dcLabels[k]}</text></g>)}
      {[0.8, 1.0, 1.2].map((t, i) => <g key={t}><circle cx={left + 3 * pw - 120 + i * 90} cy={h - 22} r={TC_SIZE[String(t)]} fill="var(--muted)" /><text x={left + 3 * pw - 106 + i * 90} y={h - 18} className="sc-tick">TC {Math.round(t * 100)}%</text></g>)}
    </svg>
  );
}
