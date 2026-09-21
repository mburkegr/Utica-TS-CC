import React from "react";
import { useApp } from "../state/context";
import { NumberField, Section, Row, Toggle } from "../components/fields";
import { SlotTable, type SlotColumn } from "../components/SlotTable";
import { PCT_MODE_SEV_DEFAULTS, UNIT_MODE_SEV_DEFAULTS } from "../state/defaults";

export function CostsTaxes() {
  const { state, dispatch, tcOptions } = useApp();
  const d = state.inputs.deal;
  const set = (patch: Partial<typeof d>) => dispatch({ type: "SET_DEAL", patch });
  // Both severance entry sets are kept in UI state so toggling never loses values; only the active set reaches the engine.
  const [stash, setStash] = React.useState<{ unit: { oil: number; gas: number }; pct: { oil: number; gas: number } }>({ unit: UNIT_MODE_SEV_DEFAULTS, pct: PCT_MODE_SEV_DEFAULTS });
  const switchMode = (pct: boolean) => {
    const cur = { oil: d.oilSevTax, gas: d.gasSevTax };
    const next = pct ? { ...stash, unit: cur } : { ...stash, pct: cur };
    setStash(next);
    const use = pct ? next.pct : next.unit;
    set({ useSevTaxPct: pct, oilSevTax: use.oil, gasSevTax: use.gas });
  };
  const cols: SlotColumn[] = [
    { key: "tcName", label: "Type Curve", kind: "select", options: tcOptions, readOnly: true },
    { key: "oilOpexBbl", label: "Oil Opex ($/bbl)", kind: "number", step: 0.05, min: 0, decimals: 2, prefix: "$" },
    { key: "gasOpexMcf", label: "Gas Opex ($/residue Mcf)", kind: "number", step: 0.01, min: 0, decimals: 2, prefix: "$" },
    { key: "nglOpex", label: "NGL Opex ($/theoretical bbl)", kind: "number", step: 0.05, min: 0, decimals: 2, prefix: "$" },
    { key: "fixedLoe", label: "Fixed LOE ($/well/mo)", kind: "number", step: 50, min: 0, decimals: 0, prefix: "$" },
    { key: "dcCosts", label: "D&C ($/ft)", kind: "number", step: 25, min: 0, decimals: 0, prefix: "$" },
    { key: "bidPerAcre", label: "$/Acre Bid", kind: "number", step: 250, min: 1, decimals: 0, prefix: "$" },
  ];
  return (
    <>
      <Section title="Operating costs, D&C and acquisition (per slot)" note="Variable LOE applies to gross volumes and fixed LOE per gross well per month; both scale by net wells. D&C = $/ft x lateral, 100% at spud. Acquisition = net acres x $/acre at the effective date.">
        <SlotTable slots={state.inputs.slots} columns={cols} include={state.ui.includeSlot} onChange={(id, patch) => dispatch({ type: "SET_SLOT", slotId: id, patch })} />
      </Section>
      <Section title="Deal-level overrides" note="When enabled, an override replaces the slot value on every included slot for the base case and sensitivities.">
        <Row>
          <Toggle label="D&C override for all slots" checked={d.useDcOverride} onChange={(v) => set({ useDcOverride: v })} />
          <NumberField label="D&C override ($/ft)" value={d.dcOverride} step={25} min={0} decimals={0} prefix="$" disabled={!d.useDcOverride} onChange={(v) => set({ dcOverride: v })} />
          <Toggle label="$/acre override for all slots" checked={d.useBidOverride} onChange={(v) => set({ useBidOverride: v })} />
          <NumberField label="$/acre override" value={d.bidOverride} step={250} min={1} decimals={0} prefix="$" disabled={!d.useBidOverride} onChange={(v) => set({ bidOverride: v })} />
        </Row>
      </Section>
      <Section title="Taxes" note="Severance has two mutually exclusive methods; only the selected one reaches the engine. NGL revenue is not subject to severance in either method. Ad valorem applies to total net revenue including NGL.">
        <Row>
          <Toggle label="Severance as % of net revenue" checked={d.useSevTaxPct} onChange={switchMode} help="Off = $/bbl and $/Mcf (gas on wellhead volume). On = whole percent of net oil and net gas revenue." />
          {d.useSevTaxPct ? (
            <><NumberField label="Oil severance (% of net oil revenue)" value={d.oilSevTax} step={0.1} min={0} decimals={3} suffix="%" onChange={(v) => set({ oilSevTax: v })} />
              <NumberField label="Gas severance (% of net gas revenue)" value={d.gasSevTax} step={0.1} min={0} decimals={3} suffix="%" onChange={(v) => set({ gasSevTax: v })} /></>
          ) : (
            <><NumberField label="Oil severance ($/bbl)" value={d.oilSevTax} step={0.01} min={0} decimals={5} prefix="$" onChange={(v) => set({ oilSevTax: v })} />
              <NumberField label="Gas severance ($/wellhead Mcf)" value={d.gasSevTax} step={0.001} min={0} decimals={5} prefix="$" onChange={(v) => set({ gasSevTax: v })} /></>
          )}
          <NumberField label="Ad valorem (decimal of net revenue)" value={d.adValTax} step={0.001} min={0} decimals={5} onChange={(v) => set({ adValTax: v })} help="0.025 = 2.5%" />
        </Row>
      </Section>
    </>
  );
}
