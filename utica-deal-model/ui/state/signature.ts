import type { ModelInputs, UiState } from "./types";

/** Stable string hash (FNV-1a) of the engine inputs plus the include flags; sensitivity toggles are excluded like SENSITIVITY_ONLY_INPUT_KEYS. */
export function inputSignature(inputs: ModelInputs, includeSlot: UiState["includeSlot"]): string {
  const json = JSON.stringify({ inputs, includeSlot }, (_k, v) => (typeof v === "number" && Number.isNaN(v) ? "NaN" : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0") + json.length.toString(16);
}
