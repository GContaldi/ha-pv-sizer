// Dumps the demo backend's answers for a few houses to tests/fixtures/demo-cases.json (npm run fixtures).
// pytest runs the Python engine on the same inputs and compares.
import type { LoadDef, PanelConfig, Settings } from "../src/api/types";
import { DEFAULT_LOADS, DEFAULT_SETTINGS, DemoBackend, METERS } from "./demo-backend";

type Case = { name: string; settings: unknown; loads: unknown; scenarios: [number, number, boolean][] };

const base = (): Settings => structuredClone(DEFAULT_SETTINGS);
const loads = (): LoadDef[] => structuredClone(DEFAULT_LOADS);
const SCENARIOS: [number, number, boolean][] = [
  [0, 0, false],
  [4.5, 5, false],
  [6, 10, true],
  [9, 15, true],
  [3, 0, true],
];

const cases: Case[] = [
  { name: "default", settings: base(), loads: loads(), scenarios: SCENARIOS },
  {
    name: "missing_consumption",
    settings: { ...base(), consumption: { meter_entity_id: null, annual_kwh: null, seasonal_profile: "pdc_heating" } },
    loads: loads(),
    scenarios: [],
  },
  {
    name: "zones_partial_meter",
    settings: {
      ...base(),
      consumption: { meter_entity_id: "sensor.demo_casa_energia", annual_kwh: 6200, seasonal_profile: "pdc_heating_cooling" },
      scenarios: { pv_sizes_kwp: [2, 4, 6.5], battery_sizes_kwh: [3, 8] },
      house: {
        climate_zone: "E",
        insulation: "poor",
        heat_pump: "generic",
        zones: [
          { name: "Piano terra", area_m2: 88, emitter: "fancoil", cooling: true },
          { name: "Primo piano", area_m2: 60, emitter: "floor", cooling: false },
          { name: "Seminterrato", area_m2: 40, emitter: "radiators", cooling: false },
        ],
      },
    },
    loads: loads(),
    scenarios: [
      [4, 3, true],
      [6.5, 8, false],
      [2, 0, true],
    ],
  },
  {
    name: "measured_year_sensors",
    settings: { ...base(), consumption: { meter_entity_id: "sensor.demo_contatore_anno", annual_kwh: null, seasonal_profile: "no_pdc" } },
    loads: [
      { ...DEFAULT_LOADS[0], source: "sensor", sensor_entity_id: "sensor.demo_lavanderia_energia", after: "asciugatrice" },
      { ...DEFAULT_LOADS[1], after: "lavatrice" },
      { ...DEFAULT_LOADS[2], source: "sensor", sensor_entity_id: "sensor.demo_lavastoviglie_energia", shiftable: false },
      { ...DEFAULT_LOADS[4], source: "sensor", sensor_entity_id: "sensor.demo_pdc_energia" },
      {
        id: "vmc",
        kind: "continuous",
        name: "VMC",
        source: "estimate",
        sensor_entity_id: null,
        shiftable: false,
        use: null,
        basis: "manual",
        area_m2: null,
        kwh_per_day: 0.8,
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        hour_profile: "flat",
        shift_share: 0,
        shift_advance_h: 1,
      },
    ],
    scenarios: SCENARIOS,
  },
  {
    name: "loads_exceed_consumption",
    settings: {
      ...base(),
      consumption: { meter_entity_id: null, annual_kwh: 2500, seasonal_profile: "pdc_heating" },
      scenarios: { pv_sizes_kwp: [3, 6], battery_sizes_kwh: [] },
      house: { climate_zone: "F", insulation: "poor", heat_pump: "generic", zones: [{ name: "Casa", area_m2: 200, emitter: "radiators", cooling: false }] },
    },
    loads: [...loads(), { ...DEFAULT_LOADS[5], basis: "manual", use: null, kwh_per_day: 9 }],
    scenarios: [
      [3, 0, false],
      [6, 0, true],
    ],
  },
  {
    name: "legacy_save",
    settings: {
      ...base(),
      house: { climate_zone: "D", insulation: "medium", heated_area_m2: 100, emitter: "fancoil" },
    },
    loads: [
      { id: "lavatrice", name: "Lavatrice", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 0.9, duration_h: 2, cycles_per_week: 4, usual_time: "any", shiftable: true, window_start: 9, window_end: 18, after: null },
      { id: "clima", kind: "continuous", name: "Clima", source: "estimate", sensor_entity_id: null, kwh_per_day: 5, months: [6, 7, 8], hour_profile: "cooling", shiftable: true, shift_share: 0.2, shift_advance_h: 2 },
    ],
    scenarios: [[6, 10, true]],
  },
];

function memoryStorage(data: Record<string, string>): Storage {
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  } as unknown as Storage;
}

const run = (backend: DemoBackend, msg: { type: string; [key: string]: unknown }) => {
  try {
    return { ok: backend.handle(msg) };
  } catch (err) {
    return { error: (err as Error).message };
  }
};

const out = cases.map((c) => {
  const backend = new DemoBackend(memoryStorage({ "pv-sizer-demo-v1": JSON.stringify({ settings: c.settings, loads: c.loads }) }));
  const config = backend.handle({ type: "pv_sizer/config" }) as PanelConfig;
  const meterId = config.settings.consumption.meter_entity_id;
  return {
    name: c.name,
    inputs: { settings: c.settings, loads: c.loads, detected: config.detected, meter: meterId ? (METERS[meterId] ?? null) : null },
    config: { settings: config.settings, loads: config.loads, data: config.data, derived: config.derived },
    results: run(backend, { type: "pv_sizer/results" }),
    scenarios: c.scenarios.map(([pv_kwp, battery_kwh, shift]) => ({
      request: { pv_kwp, battery_kwh, shift },
      ...run(backend, { type: "pv_sizer/scenario", pv_kwp, battery_kwh, shift }),
    })),
  };
});

// 12 significant digits: Math.sin and Math.pow differ in the last bit between platforms.
console.log(JSON.stringify(out, (_, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toPrecision(12)) : v), 1));
