import React from "react";
import { useApp } from "../state/context";
import { Section, Row, Select, Banner } from "../components/fields";
import { PeriodTableView } from "../components/PeriodTableView";
import { ProductionChart, CumulativeFcfChart } from "../charts/TimeCharts";
import { buildPeriodTable, calcSlotEur, productionSeries, cumulativeFcfSeries, windowSeries, dealSummary, monthToIso, EUR_LABELS } from "../../engine/index";
import type { DealResult, DisplayWindow } from "../../engine/index";
import type { ChartWindowKey } from "../state/types";
import { fmtNumber, fmtPct, fmtMultiple, fmtMonth, fmtThousands } from "../format/format";
import { ExportButtons } from "../components/ExportButtons";
import { periodTableCsv, monthlyDealCsv, safeFileStem } from "../format/csv";

function windowFor(key: ChartWindowKey, r: DealResult): DisplayWindow {
  const years = key === "5Y" ? 5 : key === "10Y" ? 10 : key === "20Y" ? 20 : null;
  return years === null ? {} : { endMonth: r.deal.calendarStart + years * 12 - 1 };
}

export function Results() {
  const { state, dispatch } = useApp();
  const r = state.results.base;
  if (!r) return (
    <div className="empty">
      <h3>No results yet</h3>
      <p>Results appear here after the model runs. To get a first answer:</p>
      <ol><li>Pick a type curve for each slot on Development and set acreage, spud month and $/acre.</li><li>Check pricing, costs and any carry or Dale terms on their tabs.</li><li>Click Run Model in the left rail.</li></ol>
      <p>Or load the C11 validation case from Deal Setup to see a complete example.</p>
    </div>
  );
  const s = dealSummary(r);
  const q = React.useMemo(() => buildPeriodTable(r, "quarter"), [r]);
  const y = React.useMemo(() => buildPeriodTable(r, "year"), [r]);
  const eur = React.useMemo(() => calcSlotEur(r), [r]);
  const win = windowFor(state.ui.chartWindow, r);
  const prod = React.useMemo(() => windowSeries(productionSeries(r), win), [r, state.ui.chartWindow]);
  const cum = React.useMemo(() => windowSeries(cumulativeFcfSeries(r), win), [r, state.ui.chartWindow]);
  const spuds = r.promote.slots.map((sf) => ({ month: sf.spudMonth, grossWells: sf.constants.grossWells }));
  const stem = safeFileStem(state.ui.opportunityName);
  return (
    <>
      <div className="band">
        <div className="band-returns">
          <div className="kpi"><div className="kpi-label">IRR</div><div className="kpi-value" data-testid="irr">{fmtPct(r.irr, 1)}</div></div>
          <div className="kpi"><div className="kpi-label">MOIC</div><div className="kpi-value" data-testid="moic">{fmtMultiple(r.moic)}</div></div>
        </div>
        <div className="band-stats">
          <div className="stat"><span>Net acres</span><b>{fmtNumber(s.totalNetAcres, 1)}</b></div>
          <div className="stat"><span>Acquisition</span><b>{fmtThousands(s.totalAcquisition, 0)}</b><em>{fmtNumber(s.blendedBidPerAcre, 0, "$")} per acre</em></div>
          <div className="stat"><span>Gross / net wells</span><b>{fmtNumber(s.grossWells, 1)} / {fmtNumber(s.netWells, 2)}</b></div>
          <div className="stat"><span>D&C, full life</span><b>{fmtThousands(s.totalDncCapex, 0)}</b></div>
          <div className="stat"><span>Payback</span><b data-testid="payback">{r.payback.paybackYears === null ? "N/A" : `${r.payback.paybackYears.toFixed(1)} yrs`}</b></div>
          <div className="stat"><span>Peak net Boe/d</span><b data-testid="peak-boepd">{fmtNumber(s.peakNetBoePerDay, 0)}</b><em>{s.peakNetBoeMonth === null ? "" : `${fmtMonth(monthToIso(s.peakNetBoeMonth))}, gross ${fmtNumber(s.peakGrossBoePerDay, 0)}`}</em></div>
        </div>
      </div>
      {s.promoteEnabled && (s.earliestPromoteEffective !== null
        ? <Banner kind="info">WI reversion becomes effective {fmtMonth(monthToIso(s.earliestPromoteEffective))} (earliest active Dale payout group): {fmtPct(r.settings.promoteWiReversionPct, 2)} of each party's then-current WI transfers after the {r.settings.promoteMultiple.toFixed(2)}x OCF hurdle.</Banner>
        : <Banner kind="info">WI reversion is enabled but no payout group reaches its investment multiple during the modeled life.</Banner>)}
      <Section title="Quarterly output, first 8 quarters from model start" note="All returns and tables use the full modeled economic life. Discounted values are not shown because the engine carries no discounting, matching the reference model." right={<ExportButtons filename={`${stem}_Quarterly.csv`} csv={() => periodTableCsv(q)} />}><PeriodTableView table={q} title="$ in thousands" /></Section>
      <Section title="Annual output, full economic life" right={<ExportButtons filename={`${stem}_Annual.csv`} csv={() => periodTableCsv(y)} />}><PeriodTableView table={y} title="$ in thousands" /></Section>
      <Section title="Type-curve outputs per slot" note="Single gross well, risked, through the economic limit. Gas is shown both pre-shrink (raw) and post-shrink (residue); NGL both as theoretical yield and recovered sales volume.">
        <div className="table-wrap"><table className="mini">
          <thead><tr><th>Slot</th><th>Type curve</th><th>Lateral (ft)</th><th>Months</th><th title={EUR_LABELS.oilEurPerFt}>Oil EUR/ft</th><th title={EUR_LABELS.rawGasEurPerFt}>Raw Gas EUR/ft (Pre-Shrink)</th><th title={EUR_LABELS.residueGasEurPerFt}>Residue Gas EUR/ft (Post-Shrink)</th><th title={EUR_LABELS.gasShrinkFraction}>Shrink</th><th title={EUR_LABELS.theoreticalNglBblPerFt}>Theoretical NGL bbl/ft (Pre-Recovery)</th><th title={EUR_LABELS.recoveredNglBblPerFt}>Recovered NGL bbl/ft (Post-Recovery)</th><th>Shut-in</th></tr></thead>
          <tbody>{eur.map((e, i) => { const sl = r.slots[i]; return (
            <tr key={e.slotId}><td>{e.slotId}</td><td>{sl.prepared.tcName}</td><td className="num">{fmtNumber(e.lateralLength, 0)}</td><td className="num">{e.monthsSummed}</td>
              <td className="num">{fmtNumber(e.oilEurPerFt, 1)}</td><td className="num">{fmtNumber(e.rawGasEurPerFt, 1)}</td><td className="num">{fmtNumber(e.residueGasEurPerFt, 1)}</td><td className="num">{fmtPct(e.gasShrinkFraction, 1)}</td>
              <td className="num">{fmtNumber(e.theoreticalNglBblPerFt, 2)}</td><td className="num">{fmtNumber(e.recoveredNglBblPerFt, 2)}</td><td>{sl.well.shutInPeriod === null ? "curve end" : `month ${sl.well.shutInPeriod}`}</td></tr>); })}</tbody>
        </table></div>
      </Section>
      <Section title="Charts" right={<Row>
        <Select label="Display window" value={state.ui.chartWindow} options={[{ value: "5Y", label: "5 years" }, { value: "10Y", label: "10 years" }, { value: "20Y", label: "20 years" }, { value: "FULL", label: "Full life" }]} onChange={(v) => dispatch({ type: "SET_UI", patch: { chartWindow: v } })} />
        <Select label="Production view" value={state.ui.productionView} options={[{ value: "stacked", label: "Stacked Mcfe/d" }, { value: "split", label: "Stream split" }]} onChange={(v) => dispatch({ type: "SET_UI", patch: { productionView: v } })} />
      </Row>} note="The display window only changes what is drawn. Payback, IRR, MOIC and the tables always use the full modeled life.">
        <CumulativeFcfChart series={cum} paybackDay={r.payback.paybackDayNumber} paybackYears={r.payback.paybackYears} spuds={spuds} />
        <ProductionChart series={prod} view={state.ui.productionView} />
      </Section>
      <MonthlyAudit r={r} stem={stem} />
    </>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return <div className="tile"><div className="tile-label">{label}</div><div className="tile-value" data-testid={testId}>{value}</div>{sub && <div className="tile-sub">{sub}</div>}</div>;
}

function MonthlyAudit({ r, stem }: { r: DealResult; stem: string }) {
  const [open, setOpen] = React.useState(false);
  const rows = r.deal.rows;
  const cols: [string, (m: typeof rows[number]) => string][] = [
    ["Month", (m) => fmtMonth(monthToIso(m.month))], ["Oil idx", (m) => fmtNumber(m.indexOilPrice, 2, "$", "", false)], ["Gas idx", (m) => fmtNumber(m.indexGasPrice, 3, "$", "", false)],
    ["Net oil (bbl)", (m) => fmtNumber(m.slotNetOilProduction, 1)], ["Net residue gas (Mcf)", (m) => fmtNumber(m.slotNetGasProduction, 1)], ["Net theor. NGL (bbl)", (m) => fmtNumber(m.slotNetNglProduction, 1)],
    ["Revenue", (m) => fmtNumber(m.slotTotalRevenue, 0, "$")], ["LOE", (m) => fmtNumber(m.slotLoe, 0, "$")], ["Tax", (m) => fmtNumber(m.slotTax, 0, "$")], ["Op. profit", (m) => fmtNumber(m.slotOperatingProfit, 0, "$")],
    ["D&C", (m) => fmtNumber(m.slotCapex, 0, "$")], ["Acquisition", (m) => fmtNumber(m.slotAssetPurchase, 0, "$")], ["Total CF", (m) => fmtNumber(m.slotTotalCashFlow, 0, "$")],
    ["Payout multiple", (m) => (m.promote ? `${m.promote.runningMultiple.toFixed(2)}x` : "")], ["Back-in active", (m) => (m.promote ? (m.promote.active ? "Yes" : "No") : "")],
  ];
  return (
    <Section title="Monthly production and cash-flow detail (full life)" right={<Row><button className="btn secondary" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} table</button><ExportButtons filename={`${stem}_Monthly_Production_Cash_Flow.csv`} csv={() => monthlyDealCsv(r.deal.rows)} /></Row>}>
      {open && <div className="table-wrap tall"><table className="mini"><thead><tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr></thead><tbody>{rows.map((m) => <tr key={m.month}>{cols.map((c) => <td key={c[0]} className="num">{c[1](m)}</td>)}</tr>)}</tbody></table></div>}
    </Section>
  );
}
