import type { LoadDef } from "./api/types";

export interface LoadPreset {
  key: string;
  /** Shown instead of `load.name`; "Altro" has no name until the user types one. */
  label?: string;
  load: Omit<LoadDef, "id">;
}

const estimate = { source: "estimate", sensor_entity_id: null, shiftable: true, window_start: 9, window_end: 18, after: null } as const;

// Typical values; the user corrects them or switches the load to a sensor.
export const LOAD_PRESETS: LoadPreset[] = [
  { key: "lavatrice", load: { ...estimate, name: "Lavatrice", kwh_per_cycle: 0.9, duration_h: 2, cycles_per_week: 4, usual_time: "any" } },
  { key: "asciugatrice", load: { ...estimate, name: "Asciugatrice", kwh_per_cycle: 1.6, duration_h: 2, cycles_per_week: 4, usual_time: "any" } },
  { key: "lavastoviglie", load: { ...estimate, name: "Lavastoviglie", kwh_per_cycle: 1, duration_h: 3, cycles_per_week: 5, usual_time: "evening" } },
  { key: "acs", load: { ...estimate, name: "Acqua calda (PDC)", kwh_per_cycle: 2.4, duration_h: 2, cycles_per_week: 7, usual_time: "morning", window_start: 10, window_end: 16 } },
  { key: "auto", load: { ...estimate, name: "Auto elettrica", kwh_per_cycle: 10, duration_h: 3, cycles_per_week: 3, usual_time: "evening", window_end: 17 } },
  { key: "boiler", load: { ...estimate, name: "Boiler elettrico", kwh_per_cycle: 3, duration_h: 2, cycles_per_week: 7, usual_time: "morning", window_start: 10, window_end: 16 } },
  { key: "altro", label: "Altro", load: { ...estimate, name: "", kwh_per_cycle: 1, duration_h: 1, cycles_per_week: 3, usual_time: "any" } },
];

export const LOAD_LIMITS = {
  kwh_per_cycle: { min: 0.1, max: 30 },
  duration_h: { min: 1, max: 6, integer: true },
  cycles_per_week: { min: 0, max: 14, integer: true },
};
