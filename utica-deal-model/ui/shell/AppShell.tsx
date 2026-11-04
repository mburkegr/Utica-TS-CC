import React from "react";
import type { EngineData } from "../../engine/index";
import { App } from "../App";
import type { AppState, TabKey } from "../state/types";
import type { UnitAnalysisRow } from "../../gis/index";
import { ModuleNav } from "./ModuleNav";
import { loadModuleChoice, saveModuleChoice, type ModuleKey } from "./moduleRegistry";
import { GisModule, type GisModuleProps } from "../gis/GisModule";

/**
 * Master shell. Both modules stay mounted; the inactive one is hidden so the
 * Deal Model keeps its reducer state (inputs, results, sensitivities) and the
 * GIS keeps its map instance and loaded layers across switches.
 */
export function AppShell({ data, initial, restoreDraft = true, initialModule, gis }: {
  data: EngineData; initial?: AppState; restoreDraft?: boolean; initialModule?: ModuleKey; gis?: Partial<GisModuleProps>;
}) {
  const [module, setModule] = React.useState<ModuleKey>(() => initialModule ?? loadModuleChoice());
  const [gisOpened, setGisOpened] = React.useState(module === "gis");
  const change = (k: ModuleKey) => { setModule(k); saveModuleChoice(k); if (k === "gis") setGisOpened(true); };
  const nav = <ModuleNav active={module} onChange={change} />;
  // Units picked on the GIS map. The shell owns the ids so the Deal Model's Unit
  // Analysis tab can remove them; the GIS joins the rows because it holds the layers.
  // Session only: the rows need the unit layers, which load when the GIS opens.
  const [unitIds, setUnitIds] = React.useState<string[]>([]);
  const [unitRows, setUnitRows] = React.useState<UnitAnalysisRow[]>([]);
  const [focusTab, setFocusTab] = React.useState<{ tab: TabKey; n: number } | null>(null);
  const openUnitAnalysis = () => { change("deal"); setFocusTab((f) => ({ tab: "units", n: (f?.n ?? 0) + 1 })); };
  const unitAnalysis = React.useMemo(() => ({ rows: unitRows, onRemove: (id: string) => setUnitIds((ids) => ids.filter((x) => x !== id)), onClear: () => setUnitIds([]) }), [unitRows]);
  return (
    <>
      <App data={data} initial={initial} restoreDraft={restoreDraft} moduleNav={nav} hidden={module !== "deal"} unitAnalysis={unitAnalysis} focusTab={focusTab} />
      {gisOpened && <GisModule moduleNav={nav} hidden={module !== "gis"} selectedUnits={unitIds} onSelectedUnitsChange={setUnitIds} onUnitRows={setUnitRows} onOpenUnitAnalysis={openUnitAnalysis} {...gis} />}
    </>
  );
}
