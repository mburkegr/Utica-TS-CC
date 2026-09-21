import type { DealInputs, SlotInput, DealResult, SensitivityGrid, ScenarioPoint } from "../../engine/index";

export const STATE_SCHEMA_VERSION = "utica-ui-v1";

export type TabKey = "development" | "pricing" | "costs" | "carry" | "results" | "sensitivities";
export type ChartWindowKey = "5Y" | "10Y" | "20Y" | "FULL";

export interface UiState {
  tab: TabKey;
  includeSlot: Record<number, boolean>;
  opportunityName: string;
  chartWindow: ChartWindowKey;
  useTcRiskAsMain: boolean;
  useDcPctSteps: boolean;
  carryStartPct: number; carryStepPct: number; bidStart: number | null; bidStep: number;
  productionView: "stacked" | "split";
}

/** Everything the engine consumes lives in `inputs` and maps 1:1 to the engine schema. */
export interface ModelInputs { deal: DealInputs; slots: SlotInput[] }

export interface GridResult { grid: SensitivityGrid; signature: string }
export interface ScenarioResult { points: ScenarioPoint[]; dcLabels: Record<string, string>; pricingLabels: Record<string, string>; signature: string }

export interface ResultsState {
  signature: string | null;
  base: DealResult | null;
  standalone: Record<number, { irr: number | null; moic: number | null }> | null;
  grids: Record<string, GridResult>;
  scenario: ScenarioResult | null;
  error: string | null;
  validation: string[];
}

export interface AppState {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  inputs: ModelInputs;
  ui: UiState;
  results: ResultsState;
}
