import React from "react";
import type { EngineData } from "../../engine/index";
import type { AppState } from "./types";
import type { Action } from "./reducer";

export interface AppContextValue { state: AppState; dispatch: React.Dispatch<Action>; data: EngineData; tcOptions: { value: string; label: string }[]; busy: string | null; setBusy: (b: string | null) => void; }
export const AppContext = React.createContext<AppContextValue | null>(null);
export function useApp(): AppContextValue {
  const v = React.useContext(AppContext);
  if (!v) throw new Error("AppContext missing");
  return v;
}
