import React from "react";
import type { EngineData } from "../../engine/index";
import { App } from "../App";
import type { AppState } from "../state/types";
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
  return (
    <>
      <App data={data} initial={initial} restoreDraft={restoreDraft} moduleNav={nav} hidden={module !== "deal"} />
      {gisOpened && <GisModule moduleNav={nav} hidden={module !== "gis"} {...gis} />}
    </>
  );
}
