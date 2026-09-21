import React from "react";
import { useApp } from "../state/context";
import { SlotTable, type SlotColumn } from "../components/SlotTable";
import { Section, Row, NumberField, TextField, MonthField, Banner, ConfirmButton, Disclosure } from "../components/fields";
import { fmtPct, fmtMultiple, fmtNumber, fmtMonth } from "../format/format";
import { cleanTcName, dealSummary, monthToIso, runDealMetrics } from "../../engine/index";
import { clearDraft } from "../state/draft";
import { C11_DEAL, C11_SLOTS, C11_NAME } from "../validation/c11";
import { ExportButtons } from "../components/ExportButtons";
import { inputsJson, safeFileStem } from "../format/csv";
import { prepareRun } from "../adapters/prepareRun";

export function Development() {
  const { state, dispatch, tcOptions, data } = useApp();
  const { deal, slots } = state.inputs;
  const summary = state.results.base ? dealSummary(state.results.base) : null;
  const [notice, setNotice] = React.useState<string | null>(null);
  const [parity, setParity] = React.useState<{ full?: { irr: number | null; moic: number | null }; legacy?: { irr: number | null; moic: number | null }; error?: string } | null>(null);

  const curveInfo = (name: string) => {
    const c = data.typeCurves.get(cleanTcName(name));
    if (!c) return "-";
    const gor = c.oil[0] > 0 ? (c.gas[0] / c.oil[0]).toFixed(1) : "gas only";
    return `${fmtNumber(c.baseLateral, 0)} ft base, mo 1 ${fmtNumber(c.oil[0], 0)} bbl / ${fmtNumber(c.gas[0], 0)} Mcf, GOR ${gor}`;
  };
  const cols: SlotColumn[] = [
    { key: "tcName", label: "Type Curve", kind: "select", options: tcOptions },
    { key: "grossWells", label: "Gross Wells", kind: "number", step: 0.25, min: 0, decimals: 2 },
    { key: "netAcres", label: "Net Acres", kind: "number", step: 1, min: 0, decimals: 2 },
    { key: "unitAcres", label: "Unit Acres", kind: "number", step: 10, min: 0, decimals: 0 },
    { key: "useCalcUnitAcres", label: "Calc Unit Acres", kind: "bool", help: "Unit acres = gross wells x lateral length / 50" },
    { key: "pctUnitized", label: "% Unitized", kind: "number", step: 0.01, min: 0, max: 1, decimals: 2, help: "Decimal: 0.90 = 90%. Reduces WI, not acquisition." },
    { key: "netRevenueInterest", label: "NRI", kind: "number", step: 0.01, min: 0, max: 1, decimals: 4, help: "Decimal lease NRI" },
    { key: "lateralLength", label: "Lateral (ft)", kind: "number", step: 500, min: 0, decimals: 0 },
    { key: "drillingSpudMonth", label: "Spud Month", kind: "month" },
    { key: "flowbackDelay", label: "Flowback Delay (mo)", kind: "number", step: 1, min: 0, decimals: 0, help: "Whole months from spud to first production; 0 = production begins in the spud month" },
    { key: "tcRisk", label: "TC Risk", kind: "number", step: 0.01, min: 0, decimals: 2, help: "Multiplier on the type curve, e.g. 0.97" },
    { key: "bidPerAcre", label: "$/Acre Bid", kind: "number", step: 250, min: 1, decimals: 0, prefix: "$" },
    { key: "dcCosts", label: "D&C ($/ft)", kind: "number", step: 25, min: 0, decimals: 0, prefix: "$" },
  ];
  const st = state.results.standalone;

  return (
    <>
      <Section title="Deal">
        <Row>
          <ConfirmButton label="Reset Model" confirmLabel="Reset all inputs to defaults" testId="reset-model" onConfirm={() => { dispatch({ type: "RESET_MODEL", deck: data.priceDeck }); setNotice("Inputs reset to defaults. The saved draft is kept until you clear it."); }} />
          <ConfirmButton label="Clear Draft" confirmLabel="Clear the saved draft" testId="clear-draft" onConfirm={() => { clearDraft(); setNotice("Draft cleared. Current inputs stay on screen until you reload or reset."); }} />
          <span className="muted">Inputs autosave to this browser as a working draft, for recovery only.</span>
        </Row>
        <Row>
          <TextField label="Opportunity name" value={state.ui.opportunityName} onChange={(v) => dispatch({ type: "SET_UI", patch: { opportunityName: v } })} placeholder="Fill name here" width={280} />
          <MonthField label="Effective date (acquisition month)" value={deal.effectiveDate} onChange={(v) => dispatch({ type: "SET_DEAL", patch: { effectiveDate: v } })} />
        </Row>
        {notice && <Banner kind="info">{notice}</Banner>}
        {state.results.error && <Banner kind="error">{state.results.error}</Banner>}
      </Section>

      <Section title="Slots and units" note="Each row is a slot (a unit or well tranche). Slot and Unit identify the row on every tab. The curve column shows base lateral and month-1 rates for the selected type curve; standalone IRR and MOIC are each slot run as its own deal.">
        <Row>
          <NumberField label="Number of slots" value={slots.length} step={1} min={1} max={60} decimals={0} width={140} onChange={(v) => dispatch({ type: "SET_SLOT_COUNT", count: v })} help="Adds default rows or trims from the end; use Dup and Del on a row for finer control" />
        </Row>
        <SlotTable slots={slots} columns={cols} include={state.ui.includeSlot}
          onChange={(id, patch) => dispatch({ type: "SET_SLOT", slotId: id, patch })}
          onInclude={(id, inc) => dispatch({ type: "SET_INCLUDE", slotId: id, include: inc })}
          extraHeaders={["Selected curve (per well, unrisked)", "Standalone IRR", "Standalone MOIC"]}
          extra={(s) => <><td className="derived curve-info">{curveInfo(s.tcName)}</td><td className="num derived" data-standalone-irr={s.slotId}>{st?.[s.slotId] ? fmtPct(st[s.slotId].irr, 1) : "-"}</td><td className="num derived">{st?.[s.slotId] ? fmtMultiple(st[s.slotId].moic) : "-"}</td></>}
          actions={(s) => <><button className="link" onClick={() => dispatch({ type: "DUPLICATE_SLOT", slotId: s.slotId })}>Dup</button><button className="link" onClick={() => dispatch({ type: "REMOVE_SLOT", slotId: s.slotId })}>Del</button></>}
        />
      </Section>

      <Disclosure title="Misc" note="model basis, validation case, reconciliation tools" testId="misc-disclosure">
        <Section title="How the model treats ownership" note="Slot WI and net acres are the original working interest before any Dale interest. Dale's initial interest comes off first. A carry means we fund 100% of the D&C for the remaining interest and, in exchange, give up the carry percentage of our working interest to the carried party from first production onward; the carried party can be anyone. The Dale back-in, if it vests, then comes out of each party's then-current WI. Acquisition cost is net acres x $/acre and is not reduced by unitization or by any of these interests.">
          <div className="kv">
            <div><span>Type curves</span><b>{data.typeCurves.size} in library</b></div>
            <div><span>Price deck</span><b>{data.priceDeck ? `${fmtMonth(monthToIso(data.priceDeck.firstMonth))} to ${fmtMonth(monthToIso(data.priceDeck.lastMonth))}` : "not loaded"}</b></div>
            <div><span>Horizon</span><b>Full type-curve life; production ends at the economic limit</b></div>
          </div>
        </Section>
        {summary && (
          <Section title="Last run">
            <div className="kv">
              <div><span>Gross / net wells</span><b>{fmtNumber(summary.grossWells, 1)} / {fmtNumber(summary.netWells, 2)}</b></div>
              <div><span>Total net acres</span><b>{fmtNumber(summary.totalNetAcres, 1)}</b></div>
              <div><span>Acquisition</span><b>{fmtNumber(summary.totalAcquisition, 0, "$")}</b></div>
              <div><span>Blended $/acre</span><b>{fmtNumber(summary.blendedBidPerAcre, 0, "$")}</b></div>
              <div><span>Economic life</span><b>{fmtMonth(monthToIso(summary.calendarStart))} to {fmtMonth(monthToIso(summary.economicCalendarEnd))}</b></div>
            </div>
          </Section>
        )}
        <Section title="Validation case" note="Loads the C11 golden-fixture inputs used to reconcile the engine against the Python model (three slots, monthly pricing file). Expected after Run Model: IRR 35.6%, MOIC 2.10x (full life; the Python 360-month reference is 2.09x).">
          <Row><ConfirmButton label="Load validation case C11" confirmLabel="Replace current inputs with C11" testId="load-c11" onConfirm={() => { dispatch({ type: "LOAD_INPUTS", inputs: { deal: { ...C11_DEAL }, slots: C11_SLOTS.map((x) => ({ ...x })) }, ui: { opportunityName: C11_NAME, includeSlot: {} } }); setNotice("Validation case C11 loaded. Click Run Model."); }} /></Row>
        </Section>
        <Section title="Reconciliation: parity mode and input export"
          note="Parity mode runs the identical inputs on the legacy 360-month master calendar the Python model uses, so the two can be compared directly. The full-life run is the production result. Use Download inputs JSON to send the exact inputs for a monthly cash-flow comparison."
          right={<ExportButtons filename={`${safeFileStem(state.ui.opportunityName)}_Inputs.json`} csv={() => inputsJson(state.inputs, state.ui.opportunityName, { includeSlot: state.ui.includeSlot })} label="inputs JSON" />}>
          <Row><button className="btn secondary" data-testid="parity-run" onClick={() => {
            const prep = prepareRun(state.inputs, state.ui);
            if (prep.errors.length) { setParity({ error: prep.errors.join(" ") }); return; }
            try {
              const full = runDealMetrics(prep.slots, prep.deal, data);
              const legacy = runDealMetrics(prep.slots, prep.deal, data, { calendarMonths: 360 });
              setParity({ full, legacy });
            } catch (e) { setParity({ error: e instanceof Error ? e.message : String(e) }); }
          }}>Compare full life vs 360-month parity mode</button></Row>
          {parity?.error && <Banner kind="error">{parity.error}</Banner>}
          {parity?.full && parity.legacy && (
            <div className="table-wrap"><table className="mini"><thead><tr><th>Mode</th><th>IRR</th><th>MOIC</th></tr></thead><tbody>
              <tr><td>Full life (production)</td><td className="num" data-testid="parity-full-irr">{fmtPct(parity.full.irr, 2)}</td><td className="num">{fmtMultiple(parity.full.moic)}</td></tr>
              <tr><td>360-month parity (Python calendar)</td><td className="num" data-testid="parity-legacy-irr">{fmtPct(parity.legacy.irr, 2)}</td><td className="num">{fmtMultiple(parity.legacy.moic)}</td></tr>
              <tr className="bold"><td>Difference (full life - 360)</td><td className="num">{parity.full.irr !== null && parity.legacy.irr !== null ? `${((parity.full.irr - parity.legacy.irr) * 100).toFixed(2)} pts` : "n/a"}</td><td className="num">{parity.full.moic !== null && parity.legacy.moic !== null ? `${(parity.full.moic - parity.legacy.moic).toFixed(3)}x` : "n/a"}</td></tr>
            </tbody></table></div>
          )}
        </Section>
      </Disclosure>
    </>
  );
}
