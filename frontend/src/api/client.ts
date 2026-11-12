import type { LoadDef, PanelConfig, Results, ScenarioDetail, ScenarioRequest, Settings } from "./types";

/** The slice of Home Assistant's `hass` object the panel uses. */
export interface HomeAssistant {
  callWS<T>(msg: { type: string; [key: string]: unknown }): Promise<T>;
  locale?: { language: string };
  language?: string;
  themes?: { darkMode?: boolean };
}

export const fetchConfig = (hass: HomeAssistant) => hass.callWS<PanelConfig>({ type: "pv_sizer/config" });

export const fetchResults = (hass: HomeAssistant) => hass.callWS<Results>({ type: "pv_sizer/results" });

export const fetchScenario = (hass: HomeAssistant, req: ScenarioRequest) =>
  hass.callWS<ScenarioDetail>({ type: "pv_sizer/scenario", ...req });

export const updateSettings = (hass: HomeAssistant, settings: Settings) =>
  hass.callWS<PanelConfig>({ type: "pv_sizer/settings/update", settings });

export const updateLoads = (hass: HomeAssistant, loads: LoadDef[]) =>
  hass.callWS<PanelConfig>({ type: "pv_sizer/loads/update", loads });
