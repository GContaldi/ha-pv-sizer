import type { ContinuousLoad, CycleLoad } from "./api/types";

export type NewLoad = Omit<CycleLoad, "id"> | Omit<ContinuousLoad, "id">;

export interface LoadPreset {
  key: string;
  /** Shown instead of `load.name`; "Altro" has no name until the user types one. */
  label?: string;
  /** One line under the label, also shown while creating the load. */
  hint?: string;
  load: NewLoad;
}

const cycle = { kind: "cycle", source: "estimate", sensor_entity_id: null, shiftable: true, window_start: 9, window_end: 18, after: null } as const;
const continuous = { kind: "continuous", source: "estimate", sensor_entity_id: null, use: null, basis: "manual", area_m2: null } as const;
/** Computed from the house; kwh_per_day and months are used until the house has a heated area. */
const heating = { ...continuous, use: "heating", basis: "house" } as const;
const cooling = { ...continuous, use: "cooling", basis: "house" } as const;
const WINTER = [11, 12, 1, 2, 3];
const SUMMER = [6, 7, 8, 9];

/** Templates for "Altro", one per kind. */
export const OTHER_CYCLE: NewLoad = { ...cycle, name: "", kwh_per_cycle: 1, duration_h: 1, cycles_per_week: 3, usual_time: "any" };
export const OTHER_CONTINUOUS: NewLoad = {
  ...continuous,
  name: "",
  kwh_per_day: 2,
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  hour_profile: "flat",
  shiftable: false,
  shift_share: 0.2,
  shift_advance_h: 2,
};

// Typical values; the user corrects them or switches the load to a sensor.
export const LOAD_PRESETS: LoadPreset[] = [
  { key: "lavatrice", load: { ...cycle, name: "Lavatrice", kwh_per_cycle: 0.9, duration_h: 2, cycles_per_week: 4, usual_time: "any" } },
  { key: "asciugatrice", load: { ...cycle, name: "Asciugatrice", kwh_per_cycle: 1.6, duration_h: 2, cycles_per_week: 4, usual_time: "any" } },
  { key: "lavastoviglie", load: { ...cycle, name: "Lavastoviglie", kwh_per_cycle: 1, duration_h: 3, cycles_per_week: 5, usual_time: "evening" } },
  { key: "acs", load: { ...cycle, name: "Acqua calda (PDC)", kwh_per_cycle: 2.4, duration_h: 2, cycles_per_week: 7, usual_time: "morning", window_start: 10, window_end: 16 } },
  { key: "auto", load: { ...cycle, name: "Auto elettrica", kwh_per_cycle: 10, duration_h: 3, cycles_per_week: 3, usual_time: "evening", window_end: 17 } },
  { key: "boiler", load: { ...cycle, name: "Boiler elettrico", kwh_per_cycle: 3, duration_h: 2, cycles_per_week: 7, usual_time: "morning", window_start: 10, window_end: 16 } },
  {
    key: "pdc_heating",
    load: { ...heating, name: "PDC riscaldamento", kwh_per_day: 12, months: WINTER, hour_profile: "heating", shiftable: true, shift_share: 0.3, shift_advance_h: 3 },
  },
  {
    key: "pdc_cooling",
    load: { ...cooling, name: "PDC raffrescamento", kwh_per_day: 6, months: SUMMER, hour_profile: "cooling", shiftable: true, shift_share: 0.3, shift_advance_h: 2 },
  },
  {
    key: "clima",
    load: { ...cooling, name: "Climatizzatori", area_m2: 40, kwh_per_day: 4, months: SUMMER, hour_profile: "cooling", shiftable: true, shift_share: 0.2, shift_advance_h: 2 },
  },
  {
    key: "fancoil",
    label: "Fancoil (ventilatori)",
    hint: "Solo i ventilatori: l'energia per scaldare e raffrescare è nella PDC",
    load: { ...continuous, name: "Fancoil", kwh_per_day: 0.5, months: [...WINTER, ...SUMMER], hour_profile: "heating", shiftable: false, shift_share: 0.2, shift_advance_h: 2 },
  },
  {
    key: "vmc",
    label: "VMC",
    hint: "Ventilazione meccanica, circa 25 W sempre accesa",
    load: { ...continuous, name: "VMC", kwh_per_day: 0.6, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], hour_profile: "flat", shiftable: false, shift_share: 0.2, shift_advance_h: 2 },
  },
  { key: "altro", label: "Altro", load: OTHER_CYCLE },
];

export const LOAD_LIMITS = {
  kwh_per_cycle: { min: 0.1, max: 30 },
  duration_h: { min: 1, max: 6, integer: true },
  cycles_per_week: { min: 0, max: 14, integer: true },
  kwh_per_day: { min: 0.1, max: 80 },
  shift_share_pct: { min: 5, max: 50, integer: true },
  shift_advance_h: { min: 1, max: 4, integer: true },
  area_m2: { min: 5, max: 2000, integer: true },
};
