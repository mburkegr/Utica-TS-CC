import React from "react";
import { useApp } from "../state/context";
import { NumberField, Section, Row, Toggle, Banner } from "../components/fields";
import { SlotTable, type SlotColumn } from "../components/SlotTable";
import { prepareRun } from "../adapters/prepareRun";
import { fmtMonth, fmtPct } from "../format/format";
import { monthToIso } from "../../engine/index";

export function CarryDale() {
  const { state, dispatch, tcOptions } = useApp();
  const d = state.inputs.deal;
  const set = (patch: Partial<typeof d>) => dispatch({ type: "SET_DEAL", patch });
  const cols: SlotColumn[] = [
    { key: "tcName", label: "Type Curve", kind: "select", options: tcOptions, readOnly: true },
    { key: "carryEnabled", label: "Carry", kind: "bool", help: "We fund 100% of this slot's D&C and give up the carry % of our WI to the carried party from first production" },
    { key: "carryWiReversionPct", label: "Carry: WI given up (%)", kind: "number", step: 1, min: 0, max: 100, decimals: 1, suffix: "%", help: "Percent of our post-Dale WI transferred to the carried party. Example: 20 means we keep 80% of our production share while paying 100% of D&C" },
    { key: "dalePromote", label: "Dale", kind: "bool", help: "Include this slot in its Dale payout group" },
    { key: "daleUnitId", label: "Dale Unit", kind: "text", help: "Physical unit id; only one first-well flag per unit" },
    { key: "dalePayoutGroup", label: "Payout Group", kind: "text", help: "Pool id when several units share one payout test" },
    { key: "daleFirstWellCarry", label: "Dale 1st Well", kind: "bool", help: "Adds D&C for Dale's initial interest on one gross well in this unit" },
  ];
  const errors = prepareRun(state.inputs, state.ui).errors.filter((e) => /Dale|carry/i.test(e));
  const promote = state.results.base?.promote;
  return (
    <>
      <Section title="Carry and Dale eligibility (per slot)" note="A carry is us carrying another party: we pay 100% of the D&C on our interest and give up the entered percent of our working interest to that party from first production. Order of layers: Dale initial interest comes off the original WI first, then the carry reduces our production share from period 1, then the Dale back-in comes out of each party's then-current WI after payout.">
        <SlotTable slots={state.inputs.slots} columns={cols} include={state.ui.includeSlot} onChange={(id, patch) => dispatch({ type: "SET_SLOT", slotId: id, patch })} />
        {errors.map((e, i) => <Banner key={i} kind="warn">{e}</Banner>)}
      </Section>
      <Section title="Deal-level carry and Dale settings" note="Dale eligibility and the first-well carry are set per slot in the table above; there is no deal-level eligibility override, so a slot is only Dale-eligible when its row says so.">
        <Row>
          <Toggle label="Carry override: same carry % on every slot" checked={d.useCarryOverride} onChange={(v) => set({ useCarryOverride: v })} />
          <NumberField label="Carry override (%)" value={d.carryOverridePct} step={1} min={0} max={100} decimals={1} suffix="%" disabled={!d.useCarryOverride} onChange={(v) => set({ carryOverridePct: v })} />
        </Row>
        <Row>
          <NumberField label="Initial Dale lease interest (% of WI)" value={d.daleInitialInterestPct} step={0.25} min={0} max={99} decimals={2} suffix="%" onChange={(v) => set({ daleInitialInterestPct: v })} />
          <NumberField label="Additional WI given up at payout (%)" value={d.promoteWiReversionPct} step={0.25} min={0} max={100} decimals={2} suffix="%" onChange={(v) => set({ promoteWiReversionPct: v })} />
          <NumberField label="Dale payout multiple" value={d.promoteMultiple} step={0.05} min={0.01} decimals={2} suffix="x" onChange={(v) => set({ promoteMultiple: v })} help="Cumulative positive OCF / (acquisition + funded D&C incl. first-well carry), per payout group" />
        </Row>
      </Section>
      {promote?.enabled && (
        <Section title="Payout groups (last run)">
          <div className="table-wrap"><table className="mini"><thead><tr><th>Group</th><th>Hurdle reached</th><th>Back-in effective</th><th>Final multiple</th></tr></thead>
            <tbody>{[...new Set(promote.schedule.map((r) => r.payoutGroup))].map((g) => { const rows = promote.schedule.filter((r) => r.payoutGroup === g); const last = rows[rows.length - 1]; return <tr key={g}><td>{g}</td><td>{last.hurdleDate === null ? "never" : fmtMonth(monthToIso(last.hurdleDate))}</td><td>{last.effectiveDate === null ? "never" : fmtMonth(monthToIso(last.effectiveDate))}</td><td className="num">{last.runningMultiple.toFixed(2)}x</td></tr>; })}</tbody></table></div>
          <p className="muted">Back-in transfers {fmtPct(state.results.base!.settings.promoteWiReversionPct, 2)} of each party's then-current WI the month after the hurdle month, permanently.</p>
        </Section>
      )}
    </>
  );
}
