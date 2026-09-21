import React from "react";
import { useApp } from "../state/context";
import { Section, Row, Toggle, NumberField, Banner } from "../components/fields";
import { Heatmap } from "../charts/Heatmap";
import { ScenarioMatrix } from "../charts/ScenarioMatrix";
import { computeBases, buildStandardSpecs, buildCarryEntrySpecs, runTwoWaySensitivity, runScenarioMatrix, SCENARIO_DC_STEP } from "../../engine/index";
import type { SensitivitySpec } from "../../engine/index";
import { prepareRun } from "../adapters/prepareRun";
import { ExportButtons } from "../components/ExportButtons";
import { sensitivityGridCsv, scenarioCsv, safeFileStem } from "../format/csv";

export function Sensitivities() {
  const { state, dispatch, data, busy, setBusy } = useApp();
  const base = state.results.base;
  const stale = state.results.signature !== null && state.results.signature !== currentSignature(state);
  const stem = safeFileStem(state.ui.opportunityName);
  if (!base || state.results.signature === null) return <Banner kind="info">Run the base model first.</Banner>;

  // Sensitivity cases are built from the same prepared inputs the base run used; the engine copies them per run.
  const run = prepareRun(state.inputs, state.ui);
  const caseInputs = { slots: run.slots, inputs: run.deal };
  const toggles = { useTcRiskAsMain: state.ui.useTcRiskAsMain, useDcPctSteps: state.ui.useDcPctSteps, carryStartPct: state.ui.carryStartPct, carryStepPct: state.ui.carryStepPct, bidStart: state.ui.bidStart ?? undefined, bidStep: state.ui.bidStep };
  const bases = computeBases(run.slots, run.deal, toggles);
  const specs = buildStandardSpecs(bases, run.deal, toggles);
  const customs = buildCarryEntrySpecs(bases);
  const carryValid = state.ui.carryStartPct + 6 * state.ui.carryStepPct <= 100;
  const sig = state.results.signature;
  const specSig = (s: SensitivitySpec) => `${sig}|${s.key}|${JSON.stringify(s.xValues)}|${JSON.stringify(s.yValues)}|${s.xVariable}|${s.yVariable}`;
  const generatedCount = [...specs, ...customs].filter((x) => state.results.grids[x.key]?.signature === specSig(x)).length
    + (state.results.scenario?.signature === `${sig}|scenario` ? 1 : 0);

  // Each generate call captures the base-run signature it was started from; the reducer drops the result
  // if a newer base run completed in between, so partial or stale grids never overwrite the latest run.
  // One control builds every table in sequence, yielding to the browser between
  // tables so the progress line paints. Each result carries the base-run
  // signature it started from, so a newer base run discards stale grids.
  const allSpecs = (): SensitivitySpec[] => [...specs, ...customs.filter((c) => c.key !== "carry_dc_custom" || carryValid)];
  const generateAll = (includeScenario: boolean) => {
    if (busy) return;
    const baseSignature = sig;
    const queue = allSpecs();
    const total = queue.length + (includeScenario ? 1 : 0);
    let done = 0;
    const step = () => {
      const spec = queue.shift();
      if (spec) {
        setBusy(`${spec.title} (${done + 1} of ${total})`);
        setTimeout(() => {
          try { const grid = runTwoWaySensitivity(caseInputs, spec, bases, data); dispatch({ type: "SET_GRID", key: spec.key, result: { grid, signature: specSig(spec) }, baseSignature }); }
          finally { done += 1; step(); }
        }, 0);
        return;
      }
      if (includeScenario) {
        setBusy(`Scenario matrix (${total} of ${total})`);
        setTimeout(() => {
          try { const r = runScenarioMatrix(caseInputs, bases, data); dispatch({ type: "SET_SCENARIO", result: { ...r, signature: `${sig}|scenario` }, baseSignature }); }
          finally { setBusy(null); }
        }, 0);
        return;
      }
      setBusy(null);
    };
    step();
  };

  const generate = (s: SensitivitySpec) => {
    if (busy) return;
    const baseSignature = sig;
    setBusy(s.key);
    setTimeout(() => {
      try { const grid = runTwoWaySensitivity(caseInputs, s, bases, data); dispatch({ type: "SET_GRID", key: s.key, result: { grid, signature: specSig(s) }, baseSignature }); }
      finally { setBusy(null); }
    }, 10);
  };
  const generateScenario = () => {
    if (busy) return;
    const baseSignature = sig;
    setBusy("scenario");
    setTimeout(() => {
      try { const r = runScenarioMatrix(caseInputs, bases, data); dispatch({ type: "SET_SCENARIO", result: { ...r, signature: `${sig}|scenario` }, baseSignature }); }
      finally { setBusy(null); }
    }, 10);
  };

  const card = (s: SensitivitySpec, enabled = true) => {
    const saved = state.results.grids[s.key];
    const current = saved && saved.signature === specSig(s);
    return (
      <Section key={s.key} title={s.title} note={s.caption} right={<Row>
        {current
          ? <ExportButtons filename={`${stem}_${safeFileStem(s.title.replace(/ Sensitivity$/, ""))}_Sensitivity.csv`} csv={() => sensitivityGridCsv(saved.grid)} />
          : <span className="status">{saved ? "Needs refresh" : !enabled ? "Carry range out of bounds" : "Not generated"}</span>}
        <button className="btn secondary" data-generate={s.key} disabled={stale || !enabled || busy !== null} onClick={() => generate(s)} title="Recalculate just this table">{current ? "Refresh" : "Generate"}</button></Row>}>
        {current ? <div className="two-up"><Heatmap grid={saved.grid} metric="irr" title="IRR" reverseY={Boolean(s.forcing)} /><Heatmap grid={saved.grid} metric="moic" title="MOIC" reverseY={Boolean(s.forcing)} /></div>
          : <p className="muted">{stale ? "Rerun the base model, then generate the tables." : !enabled ? "Adjust the carry range so all seven levels are 100% or less." : "Not calculated yet."}</p>}
      </Section>
    );
  };

  return (
    <>
      {stale && <Banner kind="warn">Inputs have changed since the model was last run. Rerun the base model before generating sensitivities.</Banner>}
      <Section title="Sensitivity tables" note={`D&C, TC risk and NGL yield sensitivities add the same delta to every slot's own value, and axis labels show the net-acre-weighted base.${run.deal.pricingMode === "file" ? " In monthly pricing mode, oil and gas sensitivities shift the entire deck by the change from the base terminal price and apply the sensitivity value as the new terminal flat price." : ""}`}>
        <Row>
          <button className="btn primary generate-all" data-testid="generate-all" disabled={stale || busy !== null} onClick={() => generateAll(true)}>
            {busy ? <><span className="spinner dark" /> Generating...</> : `Generate all tables (${allSpecs().length + 1})`}
          </button>
          <button className="btn secondary" data-testid="generate-all-no-scenario" disabled={stale || busy !== null} onClick={() => generateAll(false)} title="Skip the 189-run scenario matrix">Tables only</button>
          <span className="progress">{busy ? busy : `${generatedCount} of ${allSpecs().length + 1} current`}</span>
        </Row>
        <Row>
          <Toggle label="Use TC risk as the main (row) variable" checked={state.ui.useTcRiskAsMain} onChange={(v) => dispatch({ type: "SET_UI", patch: { useTcRiskAsMain: v } })} help="Off = $/acre bid is the row variable" />
          <Toggle label="Use 5% D&C steps" checked={state.ui.useDcPctSteps} onChange={(v) => dispatch({ type: "SET_UI", patch: { useDcPctSteps: v } })} help="Off = $50/ft increments" />
        </Row>

      </Section>
      {specs.map((s) => card(s))}
      <Section title="Carry / entry sensitivities" note="Seven user-defined carry or $/acre levels. Carry vs D&C forces acquisition to $1/acre; $/acre vs D&C forces carry off on every slot.">
        <Row>
          <NumberField label="Starting carry (%)" value={state.ui.carryStartPct} step={1} min={0} max={100} decimals={1} suffix="%" onChange={(v) => dispatch({ type: "SET_UI", patch: { carryStartPct: v } })} />
          <NumberField label="Carry step (%)" value={state.ui.carryStepPct} step={0.5} min={0.1} decimals={1} suffix="%" onChange={(v) => dispatch({ type: "SET_UI", patch: { carryStepPct: v } })} />
          <NumberField label="Starting $/acre" value={state.ui.bidStart ?? bases.baseBid} step={250} min={1} decimals={0} prefix="$" onChange={(v) => dispatch({ type: "SET_UI", patch: { bidStart: v } })} />
          <NumberField label="$/acre step" value={state.ui.bidStep} step={50} min={1} decimals={0} prefix="$" onChange={(v) => dispatch({ type: "SET_UI", patch: { bidStep: v } })} />
        </Row>
        {!carryValid && <Banner kind="warn">Starting carry + six carry steps must be 100% or less.</Banner>}
      </Section>
      {customs.map((s) => card(s, s.key !== "carry_dc_custom" || carryValid))}
      <Section title={`Scenario matrix: IRR vs $/acre bid (color = D&C at base ±$${SCENARIO_DC_STEP.toFixed(0)}/ft, size = TC risk 80/100/120%, pricing ±$5 oil / ±$0.25 gas)`}
        right={<Row><span className="status">{state.results.scenario?.signature === `${sig}|scenario` ? "Generated" : "Not generated"}</span>
          {state.results.scenario?.signature === `${sig}|scenario` && <ExportButtons filename={`${stem}_Scenario_Matrix.csv`} csv={() => scenarioCsv(state.results.scenario!.points)} />}
          <button className="btn secondary" data-generate="scenario" disabled={stale || busy !== null} onClick={generateScenario} title="Recalculate just the scenario matrix">{state.results.scenario?.signature === `${sig}|scenario` ? "Refresh" : "Generate"}</button></Row>}>
        {state.results.scenario?.signature === `${sig}|scenario`
          ? <ScenarioMatrix points={state.results.scenario.points} dcLabels={state.results.scenario.dcLabels} pricingLabels={state.results.scenario.pricingLabels} baseBid={bases.baseBid} baseTcRisk={bases.baseTcRisk} />
          : <p className="muted">Not calculated yet. 189 model runs, about two seconds.</p>}
      </Section>
    </>
  );
}

import { inputSignature } from "../state/signature";
import type { AppState } from "../state/types";
function currentSignature(s: AppState) { return inputSignature(s.inputs, s.ui.includeSlot); }
