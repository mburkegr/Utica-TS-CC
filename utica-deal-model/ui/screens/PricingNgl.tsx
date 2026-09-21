import React from "react";
import { useApp } from "../state/context";
import { NumberField, MonthField, Section, Row, Toggle, Banner } from "../components/fields";
import { SlotTable, type SlotColumn } from "../components/SlotTable";
import { NGL_COMPONENTS, monthToIso, NGL_WTI_CALIBRATION_BASE } from "../../engine/index";
import type { NglComponents, NglProfile } from "../../engine/index";
import { fmtMonth, fmtPct } from "../format/format";
import { ConfirmButton, TextField } from "../components/fields";

type ComponentGroup = "content" | "recoverEthane" | "rejectEthane" | "nglShrink" | "nglPrices";
const GROUPS: { key: ComponentGroup; label: string; step: number; decimals: number; max?: number; prefix?: string }[] = [
  { key: "content", label: "Content %", step: 0.005, decimals: 3, max: 1 },
  { key: "recoverEthane", label: "Recover case %", step: 0.01, decimals: 3, max: 1 },
  { key: "rejectEthane", label: "Reject case %", step: 0.01, decimals: 3, max: 1 },
  { key: "nglShrink", label: "Shrink factor", step: 0.001, decimals: 5 },
  { key: "nglPrices", label: "Price ($/gal)", step: 0.01, decimals: 5, prefix: "$" },
];

/** One editable component table (used for the default profile and each named profile). */
function ComponentTable({ values, onChange, idPrefix }: { values: Record<ComponentGroup, NglComponents>; onChange: (g: ComponentGroup, c: keyof NglComponents, v: number) => void; idPrefix: string }) {
  const sum = NGL_COMPONENTS.reduce((a, c) => a + values.content[c], 0);
  return (
    <div className="table-wrap"><table className="comp-table" data-profile-table={idPrefix}>
      <thead><tr><th>Component</th>{GROUPS.map((g) => <th key={g.key}>{g.label}</th>)}</tr></thead>
      <tbody>{NGL_COMPONENTS.map((c) => (
        <tr key={c}><td className="cap">{c}</td>
          {GROUPS.map((g) => <td key={g.key}><NumberField value={values[g.key][c]} step={g.step} min={0} max={g.max} decimals={g.decimals} prefix={g.prefix} onChange={(v) => onChange(g.key, c, v)} /></td>)}
        </tr>))}
        <tr><td className="muted">content total</td><td className={`num ${Math.abs(sum - 1) > 1e-6 ? "warn-text" : "muted"}`} data-content-total={idPrefix}>{(sum * 100).toFixed(1)}%{Math.abs(sum - 1) > 1e-6 ? " (does not sum to 100%)" : ""}</td><td colSpan={4} /></tr>
      </tbody>
    </table></div>
  );
}

export function PricingNgl() {
  const { state, dispatch, data, tcOptions } = useApp();
  const d = state.inputs.deal;
  const deck = data.priceDeck;
  const set = (patch: Partial<typeof d>) => dispatch({ type: "SET_DEAL", patch });
  const setComp = (group: "content" | "recoverEthane" | "rejectEthane" | "nglShrink" | "nglPrices", comp: keyof NglComponents, v: number) => set({ [group]: { ...d[group], [comp]: v } });
  const maxSwitch = deck ? monthToIso(deck.lastMonth + 1) : undefined;
  const profiles = d.nglProfiles ?? [];
  const profileOptions = [{ value: "", label: "Default" }, ...profiles.map((p) => ({ value: p.id, label: p.name }))];
  const [selected, setSelected] = React.useState<Record<string, Set<number>>>({});
  const toggleSel = (pid: string, slotId: number) => setSelected((cur) => { const next = new Set(cur[pid] ?? []); next.has(slotId) ? next.delete(slotId) : next.add(slotId); return { ...cur, [pid]: next }; });
  const addProfile = () => {
    const n = profiles.length + 1;
    const prof: NglProfile = { id: `ngl-${Date.now().toString(36)}-${n}`, name: `Profile ${n}`, content: { ...d.content }, recoverEthane: { ...d.recoverEthane }, rejectEthane: { ...d.rejectEthane }, nglShrink: { ...d.nglShrink }, nglPrices: { ...d.nglPrices } };
    dispatch({ type: "ADD_NGL_PROFILE", profile: prof });
  };
  const usedBy = (pid: string | null) => state.inputs.slots.filter((x) => (x.nglProfileId ?? null) === pid).map((x) => x.slotId);
  const slotCols: SlotColumn[] = [
    { key: "tcName", label: "Type Curve", kind: "select", options: tcOptions, readOnly: true },
    { key: "oilDiff", label: "Oil Diff ($/bbl)", kind: "number", step: 0.25, decimals: 2, prefix: "$", help: "Additive to WTI" },
    { key: "gasDiff", label: "Gas Diff incl. GP&T ($/Mcf, residue)", kind: "number", step: 0.05, decimals: 2, prefix: "$", help: "Basis and GP&T combined; additive to the gas index; applied to residue (post-shrink) gas" },
    { key: "nglYield", label: "NGL Yield (GPM on raw gas)", kind: "number", step: 0.1, min: 0, decimals: 2 },
  ];
  const nglFactors = state.results.base?.slots.map((s) => ({ slotId: s.prepared.slotId, ...s.ngl }));
  return (
    <>
      <Section title="Index pricing">
        <Row>
          <Toggle label="Use monthly pricing file" checked={d.pricingMode === "file"} onChange={(v) => set({ pricingMode: v ? "file" : "flat" })} help="Off = flat oil and gas prices. On = deck until each commodity's switch month, then the flat price." />
          {deck && <span className="muted">Deck: {fmtMonth(monthToIso(deck.firstMonth))} to {fmtMonth(monthToIso(deck.lastMonth))}</span>}
          {!deck && d.pricingMode === "file" && <Banner kind="error">No price deck is loaded.</Banner>}
        </Row>
        <Row>
          <NumberField label={d.pricingMode === "file" ? "Flat oil after switch ($/bbl)" : "Oil price ($/bbl)"} value={d.oilPrice} step={1} min={0} decimals={2} prefix="$" onChange={(v) => set({ oilPrice: v })} />
          {d.pricingMode === "file" && <MonthField label="Oil switch to flat" value={d.oilFlatStartDate ?? ""} max={maxSwitch} onChange={(v) => set({ oilFlatStartDate: v })} help="The selected month uses the flat price; the deck is used only for earlier months" />}
          <NumberField label={d.pricingMode === "file" ? "Flat gas after switch ($/Mcf)" : "Gas price ($/Mcf)"} value={d.gasPrice} step={0.05} min={0} decimals={3} prefix="$" onChange={(v) => set({ gasPrice: v })} />
          {d.pricingMode === "file" && <MonthField label="Gas switch to flat" value={d.gasFlatStartDate ?? ""} max={maxSwitch} onChange={(v) => set({ gasFlatStartDate: v })} />}
        </Row>
      </Section>
      <Section title="Slot differentials and NGL yield" note="Gas differential and GP&T are one combined deduction applied to residue gas. NGL is priced as a fixed percent of WTI (no separate NGL differential).">
        <SlotTable slots={state.inputs.slots} columns={slotCols} include={state.ui.includeSlot} onChange={(id, patch) => dispatch({ type: "SET_SLOT", slotId: id, patch })}
          extraHeaders={["NGL profile", "Shrink (last run)", "NGL % of WTI (last run)", "Recovered fraction (last run)"]}
          extra={(s) => { const f = nglFactors?.find((x) => x.slotId === s.slotId); const rec = f ? f.detail.reduce((a, c) => a + c.contentPct * c.recoveryPct, 0) : null; return <>
            <td><select data-slot-profile={s.slotId} value={s.nglProfileId ?? ""} onChange={(e) => dispatch({ type: "ASSIGN_NGL_PROFILE", profileId: e.target.value || null, slotIds: [s.slotId] })}>{profileOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
            <td className="num derived">{f ? fmtPct(f.shrink, 2) : "-"}</td><td className="num derived">{f ? fmtPct(f.nglPctOfWti, 2) : "-"}</td><td className="num derived">{rec === null ? "-" : fmtPct(rec, 1)}</td></>; }} />
      </Section>
      <Section title="NGL component profiles"
        note={`Every slot uses the Default profile unless you assign it a named one. Basket price = sum(recovery x content x $/gal) x 42 / $${NGL_WTI_CALIBRATION_BASE} WTI calibration base, applied as a percent of the monthly oil index. Reported NGL volumes are theoretical yield (pre-recovery).`}>
        <div className="ngl-toolbar">
          <div className="ethane-switch" role="group" aria-label="Ethane mode">
            <span className="switch-label">Ethane mode, applies to every profile and slot</span>
            <div className="segmented">
              <button className={!d.ethaneRec ? "seg active" : "seg"} data-testid="ethane-reject" onClick={() => set({ ethaneRec: false })}>Reject ethane</button>
              <button className={d.ethaneRec ? "seg active" : "seg"} data-testid="ethane-recover" onClick={() => set({ ethaneRec: true })}>Recover ethane</button>
            </div>
            <span className="muted">{d.ethaneRec ? "Using each profile's Recover case recoveries." : "Using each profile's Reject case recoveries."}</span>
          </div>
          <div className="grow" />
          <button className="btn primary add-profile" data-testid="add-ngl-profile" onClick={addProfile}>+ Add NGL profile</button>
        </div>
        <div className="profile">
          <div className="profile-head"><b>Default</b><span className="muted">used by {usedBy(null).length ? `slot${usedBy(null).length > 1 ? "s" : ""} ${usedBy(null).join(", ")}` : "no slots"}</span>
            <span className="grow" /><ConfirmButton label="Apply to all slots" confirmLabel="Set every slot to Default" onConfirm={() => dispatch({ type: "ASSIGN_NGL_PROFILE", profileId: null, slotIds: "all" })} /></div>
          <ComponentTable idPrefix="default" values={{ content: d.content, recoverEthane: d.recoverEthane, rejectEthane: d.rejectEthane, nglShrink: d.nglShrink, nglPrices: d.nglPrices }} onChange={(g, c, v) => setComp(g, c, v)} />
        </div>
        {profiles.map((p) => {
          const sel = selected[p.id] ?? new Set<number>();
          return (
            <div className="profile" key={p.id} data-profile={p.id}>
              <div className="profile-head">
                <TextField value={p.name} onChange={(v) => dispatch({ type: "UPDATE_NGL_PROFILE", id: p.id, patch: { name: v } })} width={220} />
                <span className="muted">used by {usedBy(p.id).length ? `slot${usedBy(p.id).length > 1 ? "s" : ""} ${usedBy(p.id).join(", ")}` : "no slots"}</span>
                <span className="grow" />
                <span className="pick">{state.inputs.slots.map((x) => <label key={x.slotId} className="pick-slot" title={x.daleUnitId}><input type="checkbox" checked={sel.has(x.slotId)} onChange={() => toggleSel(p.id, x.slotId)} /> {x.slotId}</label>)}</span>
                <button className="btn secondary" data-apply-selected={p.id} disabled={sel.size === 0} onClick={() => dispatch({ type: "ASSIGN_NGL_PROFILE", profileId: p.id, slotIds: [...sel] })}>Apply to selected</button>
                <ConfirmButton label="Apply to all slots" confirmLabel={`Set every slot to ${p.name}`} onConfirm={() => dispatch({ type: "ASSIGN_NGL_PROFILE", profileId: p.id, slotIds: "all" })} />
                <ConfirmButton label="Remove" confirmLabel="Remove profile (slots revert to Default)" onConfirm={() => dispatch({ type: "REMOVE_NGL_PROFILE", id: p.id })} />
              </div>
              <ComponentTable idPrefix={p.id} values={{ content: p.content, recoverEthane: p.recoverEthane, rejectEthane: p.rejectEthane, nglShrink: p.nglShrink, nglPrices: p.nglPrices }}
                onChange={(g, c, v) => dispatch({ type: "UPDATE_NGL_PROFILE", id: p.id, patch: { [g]: { ...p[g], [c]: v } } })} />
            </div>
          );
        })}
      </Section>
    </>
  );
}
