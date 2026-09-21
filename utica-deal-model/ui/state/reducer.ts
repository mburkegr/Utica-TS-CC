import type { DealInputs, SlotInput, NglProfile } from "../../engine/index";
import type { AppState, ModelInputs, UiState, GridResult, ScenarioResult, ResultsState } from "./types";
import { defaultSlot, defaultUi, defaultInputs } from "./defaults";
import type { PriceDeck, DealResult } from "../../engine/index";

export type Action =
  | { type: "SET_DEAL"; patch: Partial<DealInputs> }
  | { type: "SET_SLOT"; slotId: number; patch: Partial<SlotInput> }
  | { type: "SET_SLOT_COUNT"; count: number }
  | { type: "DUPLICATE_SLOT"; slotId: number }
  | { type: "REMOVE_SLOT"; slotId: number }
  | { type: "SET_INCLUDE"; slotId: number; include: boolean }
  | { type: "SET_UI"; patch: Partial<UiState> }
  | { type: "ADD_NGL_PROFILE"; profile: NglProfile }
  | { type: "UPDATE_NGL_PROFILE"; id: string; patch: Partial<Omit<NglProfile, "id">> }
  | { type: "REMOVE_NGL_PROFILE"; id: string }
  | { type: "ASSIGN_NGL_PROFILE"; profileId: string | null; slotIds: number[] | "all" }
  | { type: "RUN_DONE"; signature: string; base: DealResult; standalone: ResultsState["standalone"] }
  | { type: "RUN_FAILED"; error: string; validation: string[] }
  | { type: "SET_GRID"; key: string; result: GridResult; baseSignature: string }
  | { type: "SET_SCENARIO"; result: ScenarioResult; baseSignature: string }
  | { type: "LOAD_INPUTS"; inputs: ModelInputs; ui?: Partial<UiState> }
  | { type: "RESET_MODEL"; deck: PriceDeck | null };

const emptyResults = (): ResultsState => ({ signature: null, base: null, standalone: null, grids: {}, scenario: null, error: null, validation: [] });

function renumber(slots: SlotInput[]): SlotInput[] {
  return slots.map((s, i) => {
    const id = i + 1;
    const wasDefaultUnit = s.daleUnitId === `UNIT-${s.slotId}`;
    const wasDefaultGroup = s.dalePayoutGroup === s.daleUnitId;
    const daleUnitId = wasDefaultUnit ? `UNIT-${id}` : s.daleUnitId;
    return { ...s, slotId: id, daleUnitId, dalePayoutGroup: wasDefaultGroup ? daleUnitId : s.dalePayoutGroup };
  });
}

/** Every branch returns new objects; engine inputs are never mutated in place. */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_DEAL":
      return { ...state, inputs: { ...state.inputs, deal: { ...state.inputs.deal, ...action.patch } } };
    case "SET_SLOT":
      return { ...state, inputs: { ...state.inputs, slots: state.inputs.slots.map((s) => (s.slotId === action.slotId ? { ...s, ...action.patch } : s)) } };
    case "SET_SLOT_COUNT": {
      const n = Math.max(1, Math.trunc(action.count));
      const cur = state.inputs.slots;
      let slots = cur.slice(0, n);
      const spud = cur[0]?.drillingSpudMonth ?? state.inputs.deal.effectiveDate;
      for (let i = cur.length; i < n; i++) slots.push(defaultSlot(i + 1, spud));
      return { ...state, inputs: { ...state.inputs, slots: renumber(slots) } };
    }
    case "DUPLICATE_SLOT": {
      const idx = state.inputs.slots.findIndex((s) => s.slotId === action.slotId);
      if (idx < 0) return state;
      const copy = { ...state.inputs.slots[idx] };
      const slots = [...state.inputs.slots.slice(0, idx + 1), copy, ...state.inputs.slots.slice(idx + 1)];
      return { ...state, inputs: { ...state.inputs, slots: renumber(slots) } };
    }
    case "REMOVE_SLOT": {
      if (state.inputs.slots.length <= 1) return state;
      return { ...state, inputs: { ...state.inputs, slots: renumber(state.inputs.slots.filter((s) => s.slotId !== action.slotId)) } };
    }
    case "SET_INCLUDE":
      return { ...state, ui: { ...state.ui, includeSlot: { ...state.ui.includeSlot, [action.slotId]: action.include } } };
    case "SET_UI":
      return { ...state, ui: { ...state.ui, ...action.patch } };
    case "ADD_NGL_PROFILE":
      return { ...state, inputs: { ...state.inputs, deal: { ...state.inputs.deal, nglProfiles: [...(state.inputs.deal.nglProfiles ?? []), action.profile] } } };
    case "UPDATE_NGL_PROFILE":
      return { ...state, inputs: { ...state.inputs, deal: { ...state.inputs.deal, nglProfiles: (state.inputs.deal.nglProfiles ?? []).map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)) } } };
    case "REMOVE_NGL_PROFILE": {
      // Slots on the removed profile fall back to the deal default.
      const slots = state.inputs.slots.map((s) => (s.nglProfileId === action.id ? { ...s, nglProfileId: null } : s));
      return { ...state, inputs: { deal: { ...state.inputs.deal, nglProfiles: (state.inputs.deal.nglProfiles ?? []).filter((p) => p.id !== action.id) }, slots } };
    }
    case "ASSIGN_NGL_PROFILE": {
      const ids = action.slotIds === "all" ? new Set(state.inputs.slots.map((s) => s.slotId)) : new Set(action.slotIds);
      return { ...state, inputs: { ...state.inputs, slots: state.inputs.slots.map((s) => (ids.has(s.slotId) ? { ...s, nglProfileId: action.profileId } : s)) } };
    }
    case "RUN_DONE":
      return { ...state, results: { ...state.results, signature: action.signature, base: action.base, standalone: action.standalone, error: null, validation: [], grids: {}, scenario: null } };
    case "RUN_FAILED":
      return { ...state, results: { ...state.results, error: action.error, validation: action.validation } };
    case "SET_GRID":
      // A grid computed against an older base run must never overwrite results of the latest completed run.
      if (action.baseSignature !== state.results.signature) return state;
      return { ...state, results: { ...state.results, grids: { ...state.results.grids, [action.key]: action.result } } };
    case "SET_SCENARIO":
      if (action.baseSignature !== state.results.signature) return state;
      return { ...state, results: { ...state.results, scenario: action.result } };
    case "LOAD_INPUTS":
      return { ...state, inputs: action.inputs, ui: { ...state.ui, ...(action.ui ?? {}) }, results: emptyResults() };
    case "RESET_MODEL":
      return { ...state, inputs: defaultInputs(action.deck), ui: { ...defaultUi(), tab: state.ui.tab }, results: emptyResults() };
    default:
      return state;
  }
}
