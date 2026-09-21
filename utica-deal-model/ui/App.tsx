import React from "react";
import type { EngineData } from "../engine/index";
import { runDeal, runStandaloneSlotReturns } from "../engine/index";
import { AppContext } from "./state/context";
import { reducer } from "./state/reducer";
import { initialState } from "./state/defaults";
import type { AppState, TabKey } from "./state/types";
import { inputSignature } from "./state/signature";
import { loadDraft, saveDraft, DRAFT_DEBOUNCE_MS } from "./state/draft";
import { prepareRun } from "./adapters/prepareRun";
import { Development } from "./screens/Development";
import { PricingNgl } from "./screens/PricingNgl";
import { CostsTaxes } from "./screens/CostsTaxes";
import { CarryDale } from "./screens/CarryDale";
import { Results } from "./screens/Results";
import { Sensitivities } from "./screens/Sensitivities";
import { Banner } from "./components/fields";
import { FootnoteScope, FootnoteList } from "./components/footnotes";
import { Logo } from "./components/Logo";
import { fmtPct, fmtMultiple } from "./format/format";

const TABS: { key: TabKey; label: string }[] = [
  { key: "development", label: "Development" }, { key: "pricing", label: "Pricing & NGL" },
  { key: "costs", label: "Costs & Taxes" }, { key: "carry", label: "Carry & Dale" }, { key: "results", label: "Results" }, { key: "sensitivities", label: "Sensitivities" },
];

export function App({ data, initial, restoreDraft = true }: { data: EngineData; initial?: AppState; restoreDraft?: boolean }) {
  const [state, dispatch] = React.useReducer(reducer, undefined, () => {
    const base = initial ?? initialState(data.priceDeck);
    if (initial || !restoreDraft) return base;
    const d = loadDraft();
    return d ? { ...base, inputs: d.inputs, ui: { ...base.ui, ...d.ui } } : base;
  });
  const [restored] = React.useState(() => !initial && restoreDraft && loadDraft() !== null);

  // Debounced working-draft autosave of the canonical inputs.
  React.useEffect(() => {
    const t = setTimeout(() => saveDraft(state), DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.inputs, state.ui.includeSlot, state.ui.opportunityName, state.ui.chartWindow]);

  // Dropdown shows base lateral and month-1 rates so a mis-picked curve is visible before running.
  const tcOptions = React.useMemo(() => [...data.typeCurves.values()].map((c) => ({
    value: c.name,
    label: `${c.rawName}  (${(c.baseLateral / 1000).toFixed(1)}k ft, mo 1: ${(c.oil[0] / 1000).toFixed(1)} Mbbl / ${(c.gas[0] / 1000).toFixed(0)} MMcf)`,
  })).sort((a, b) => a.label.localeCompare(b.label)), [data]);
  const signature = inputSignature(state.inputs, state.ui.includeSlot);
  const stale = state.results.signature !== null && state.results.signature !== signature;
  const [busy, setBusy] = React.useState<string | null>(null);
  const running = busy === "base";
  const setRunning = (b: boolean) => setBusy(b ? "base" : null);

  const runModel = () => {
    const prep = prepareRun(state.inputs, state.ui);
    if (prep.errors.length) { dispatch({ type: "RUN_FAILED", error: prep.errors.join(" "), validation: prep.errors }); return; }
    setRunning(true);
    setTimeout(() => {
      try {
        const base = runDeal(prep.slots, prep.deal, data);
        const standalone = runStandaloneSlotReturns(prep.slots, prep.deal, data);
        dispatch({ type: "RUN_DONE", signature, base, standalone });
        dispatch({ type: "SET_UI", patch: { tab: "results" } });
      } catch (e) {
        dispatch({ type: "RUN_FAILED", error: e instanceof Error ? e.message : String(e), validation: [] });
      } finally { setRunning(false); }
    }, 10);
  };

  const r = state.results.base;
  const visited = (k: TabKey) => (k === "results" || k === "sensitivities" ? Boolean(r) : true);
  return (
    <AppContext.Provider value={{ state, dispatch, data, tcOptions, busy, setBusy }}>
      <div className="app">
        <aside className="rail">
          <div className="brand"><Logo size={134} /><div className="brand-text">Utica Deal Model<small>Acreage underwriting</small></div></div>
          <div className="rail-run"><button className="btn primary run" data-testid="run-model" onClick={runModel} disabled={busy !== null}>{running ? "Running..." : "Run Model"}</button></div>
          <div className="rail-status">
            {busy ? <span className="running"><span className="spinner" /> {busy === "base" ? "Base model" : busy}</span>
              : stale ? <span className="stale">Inputs changed since last run</span>
              : r ? <span>Last run <b data-testid="topbar-irr">{fmtPct(r.irr, 1)}</b> IRR, <b>{fmtMultiple(r.moic)}</b></span>
              : <span>Not run yet</span>}
          </div>
          <nav>{TABS.map((t) => <button key={t.key} className={`tab${t.key === state.ui.tab ? " active" : ""}${visited(t.key) ? " done" : ""}`} onClick={() => dispatch({ type: "SET_UI", patch: { tab: t.key } })}><span>{t.label}</span><span className="dot" /></button>)}</nav>
          <div className="rail-foot">Full type-curve life, economic-limit termination. Reconciled to the Python reference model.</div>
        </aside>
        <div className="main">
          <header className="topbar">
            <h1>{TABS.find((t) => t.key === state.ui.tab)?.label}{state.ui.opportunityName ? <span className="opp"> for {state.ui.opportunityName}</span> : null}</h1>
            <div className="quick">
              {r && !stale && <><span className="q-item">IRR<b>{fmtPct(r.irr, 1)}</b></span><span className="q-item">MOIC<b>{fmtMultiple(r.moic)}</b></span><span className="q-item">Payback<b>{r.payback.paybackYears === null ? "N/A" : `${r.payback.paybackYears.toFixed(1)} yrs`}</b></span></>}
              {stale && <span className="q-item stale">inputs changed, rerun to refresh</span>}
            </div>
          </header>
          <main className="content">
            <FootnoteScope resetKey={state.ui.tab}>
            {restored && state.ui.tab === "development" && <Banner kind="info">Restored your saved working draft from this browser.</Banner>}
            {state.results.error && state.ui.tab !== "development" && <Banner kind="error">{state.results.error}</Banner>}
            {stale && (state.ui.tab === "results") && <Banner kind="warn">Inputs have changed since the model was last run. These results are from the previous inputs; run the model to refresh them.</Banner>}
            {state.ui.tab === "development" && <Development />}
            {state.ui.tab === "pricing" && <PricingNgl />}
            {state.ui.tab === "costs" && <CostsTaxes />}
            {state.ui.tab === "carry" && <CarryDale />}
            {state.ui.tab === "results" && <Results />}
            {state.ui.tab === "sensitivities" && <Sensitivities />}
            <FootnoteList />
            </FootnoteScope>
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
