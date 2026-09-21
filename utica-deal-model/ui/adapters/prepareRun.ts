/**
 * Pre-run adapter: include flags, derived promoteEnabled, and the first-well
 * carry validations. Dale eligibility is per slot only; there is no deal-level
 * eligibility override, so a flag is never applied to slots implicitly.
 * No economics here; output is exactly the engine input schema.
 */
import type { DealInputs, SlotInput } from "../../engine/index";
import type { ModelInputs, UiState } from "../state/types";

export interface PreparedRun { slots: SlotInput[]; deal: DealInputs; errors: string[] }

export function prepareRun(inputs: ModelInputs, ui: Pick<UiState, "includeSlot">): PreparedRun {
  const errors: string[] = [];
  let slots = inputs.slots.filter((s) => ui.includeSlot[s.slotId] !== false).map((s) => ({ ...s }));
  if (slots.length === 0) errors.push("Include at least one slot before running the model.");
  const missingTc = slots.filter((s) => !s.tcName);
  if (missingTc.length) errors.push(`Select a type curve for slot(s): ${missingTc.map((s) => s.slotId).join(", ")}.`);
  const invalidFirst = slots.filter((s) => s.daleFirstWellCarry && !s.dalePromote);
  if (invalidFirst.length) errors.push(`A Dale first-well carry is checked on a slot that is not Dale eligible: ${invalidFirst.map((s) => s.slotId).join(", ")}.`);
  const perUnit = new Map<string, number>();
  for (const s of slots) if (s.dalePromote && s.daleFirstWellCarry) perUnit.set(s.daleUnitId, (perUnit.get(s.daleUnitId) ?? 0) + 1);
  const dup = [...perUnit.entries()].filter(([, n]) => n > 1).map(([u]) => u);
  if (dup.length) errors.push(`More than one first-well carry is flagged for Dale unit(s): ${dup.join(", ")}.`);
  for (const s of slots) if (!Number.isInteger(s.flowbackDelay) || s.flowbackDelay < 0) errors.push(`Slot ${s.slotId}: flowback delay must be a whole number of months (0 allowed).`);
  const promoteEnabled = slots.some((s) => s.dalePromote);
  const deal: DealInputs = { ...inputs.deal, baseOilPrice: inputs.deal.oilPrice, baseGasPrice: inputs.deal.gasPrice, promoteEnabled,
    promoteWiReversionPct: promoteEnabled ? inputs.deal.promoteWiReversionPct : 0.0, promoteMultiple: promoteEnabled ? inputs.deal.promoteMultiple : 0.0 };
  return { slots, deal, errors };
}
