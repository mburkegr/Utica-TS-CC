/**
 * Working-draft recovery only (not a deal library). Saves the canonical model
 * inputs plus a few UI settings to localStorage with a schema version, restores
 * the most recent compatible draft on load.
 */
import type { AppState, ModelInputs, UiState } from "./types";
import { STATE_SCHEMA_VERSION } from "./types";

export const DRAFT_KEY = "utica-deal-model-draft";
export const DRAFT_DEBOUNCE_MS = 400;

export interface Draft { schemaVersion: string; savedAt: string; inputs: ModelInputs; ui: Pick<UiState, "includeSlot" | "opportunityName" | "chartWindow"> }

export function saveDraft(state: AppState): void {
  try {
    const d: Draft = { schemaVersion: STATE_SCHEMA_VERSION, savedAt: new Date().toISOString(), inputs: state.inputs,
      ui: { includeSlot: state.ui.includeSlot, opportunityName: state.ui.opportunityName, chartWindow: state.ui.chartWindow } };
    globalThis.localStorage?.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch { /* storage unavailable or full: ignore */ }
}

export function loadDraft(): Draft | null {
  try {
    const raw = globalThis.localStorage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (d.schemaVersion !== STATE_SCHEMA_VERSION || !d.inputs?.deal || !Array.isArray(d.inputs.slots)) return null;
    return d;
  } catch { return null; }
}

export function clearDraft(): void {
  try { globalThis.localStorage?.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
