// Development-only stand-in for the Python integration. Implements the
// WebSocket contract in src/api/types.ts on synthetic data; never bundled.
import type {
  CellSummary,
  ClimateZone,
  ConsumptionSettings,
  CostItem,
  CycleLoad,
  DataInfo,
  Emitter,
  HourProfile,
  HouseModel,
  HouseSettings,
  Insulation,
  LoadDef,
  LoadDetected,
  LoadValue,
  PanelConfig,
  Results,
  ScenarioDetail,
  SeasonalProfile,
  Settings,
  UsualTime,
} from "../src/api/types";
import { USUAL_TIME_RANGE, continuousUsage, createsLoop, effectiveUsage } from "../src/loads";
import { normalizeSizes } from "../src/scenario-sizes";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Typical yield for inland Salerno, south-facing 30°, ~14% losses: ~1,470 kWh/kWp/yr.
const PV_KWH_PER_KWP = [72, 85, 118, 138, 158, 168, 180, 167, 132, 108, 76, 64];
const DAY_LENGTH_H = [9.4, 10.5, 11.9, 13.3, 14.5, 15.1, 14.8, 13.8, 12.4, 11.0, 9.8, 9.1];
const CLEAR_SKY_PROB = [0.45, 0.5, 0.55, 0.6, 0.7, 0.85, 0.92, 0.9, 0.75, 0.6, 0.45, 0.4];
const HOURS = 8760;
const HORIZON_YEARS = 25;
const DST_START_DAY = 86;
const DST_END_DAY = 303;
const BASE_KW = 0.22;
const COOKING_KWH_DAY = 1.5;
const OTHER_KWH_DAY = 1.6;
const STORAGE_KEY = "pv-sizer-demo-v1";

const normalize = (shape: number[]) => {
  const s = shape.reduce((a, b) => a + b, 0);
  return shape.map((v) => v / s);
};
const HEAT_SHAPE = normalize([0.9, 0.9, 0.95, 1, 1.1, 1.3, 1.5, 1.5, 1.3, 1.0, 0.8, 0.6, 0.5, 0.5, 0.55, 0.65, 0.8, 1.0, 1.2, 1.25, 1.2, 1.1, 1.0, 0.95]);
const COOL_SHAPE = normalize([0.3, 0.25, 0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.3, 1.5, 1.7, 1.8, 1.8, 1.7, 1.5, 1.3, 1.1, 0.9, 0.6, 0.4]);
const OTHER_SHAPE = normalize([0.3, 0.2, 0.15, 0.15, 0.15, 0.2, 0.5, 0.8, 0.7, 0.6, 0.6, 0.6, 0.7, 0.7, 0.6, 0.6, 0.7, 0.9, 1.2, 1.5, 1.6, 1.5, 1.2, 0.7]);
const COOK_WEEKDAY = normalize([0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.15, 0.35, 0, 0, 0, 0, 0, 0.4, 0.5, 0, 0, 0]);
const COOK_WEEKEND = normalize([0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.3, 0.5, 0, 0, 0, 0, 0, 0.2, 0.4, 0, 0, 0]);
const HOUR_SHAPES: Record<HourProfile, number[]> = { flat: new Array<number>(24).fill(1 / 24), heating: HEAT_SHAPE, cooling: COOL_SHAPE };

/** Share of the yearly total per month. */
const SEASONAL_PROFILES: Record<SeasonalProfile, number[]> = {
  pdc_heating: normalize([720, 640, 520, 400, 340, 320, 340, 340, 340, 400, 520, 700]),
  pdc_heating_cooling: normalize([720, 640, 520, 400, 360, 420, 560, 560, 420, 400, 520, 700]),
  no_pdc: normalize([560, 500, 510, 470, 450, 450, 480, 470, 450, 470, 500, 560]),
};

export const DEFAULT_SETTINGS: Settings = {
  tariff: { energy_price: 0.16375, excise: 0.0227, vat_pct: 10, fixed_monthly: 14.17, power_fee: 1.976667, power_kw: 6, export_price: 0.09 },
  system: { cost_per_kwp: 1500, cost_per_kwh: 550, deduction_pct: 50, battery_power_kw: 5, usable_pct: 90, efficiency_pct: 90, export_limit_kw: 6 },
  lifetime: { degradation_pct: 0.5, price_increase_pct: 0, battery_life_years: 12, inverter_cost: 1200, inverter_year: 12 },
  scenarios: { pv_sizes_kwp: [3, 4.5, 6, 7.5, 9], battery_sizes_kwh: [5, 10, 15] },
  consumption: { meter_entity_id: null, annual_kwh: 6200, seasonal_profile: "pdc_heating" },
  // Zone C is a guess for San Cipriano Picentino; the real backend proposes it from the location.
  // Seminterrato (PDC zone 2): aluminium radiators; area still to enter.
  house: {
    climate_zone: "C",
    insulation: "medium",
    heat_pump: "daikin_altherma3_rf_11",
    zones: [
      { name: "Piano terra", area_m2: 88, emitter: "fancoil", cooling: true },
      { name: "Seminterrato", area_m2: null, emitter: "radiators", cooling: false },
    ],
  },
};

/** Saves from before zones had one heated area and one emitter. */
type LegacyHouse = Partial<HouseSettings> & { heated_area_m2?: number | null; emitter?: Emitter };

function migrateHouse(h: LegacyHouse | undefined, d: HouseSettings): HouseSettings {
  if (!h) return d;
  const zones =
    h.zones ??
    (h.emitter
      ? [{ name: "Casa", area_m2: h.heated_area_m2 ?? null, emitter: h.emitter, cooling: h.emitter !== "radiators" }]
      : d.zones);
  return {
    climate_zone: h.climate_zone ?? d.climate_zone,
    insulation: h.insulation ?? d.insulation,
    heat_pump: h.heat_pump ?? (h.zones ? d.heat_pump : "generic"),
    zones,
  };
}

function withDefaults(s: Partial<Settings> | undefined): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!s) return d;
  return {
    tariff: { ...d.tariff, ...s.tariff },
    system: { ...d.system, ...s.system },
    lifetime: { ...d.lifetime, ...s.lifetime },
    scenarios: normalizeSizes({ ...d.scenarios, ...s.scenarios }, d.scenarios),
    consumption: { ...d.consumption, ...s.consumption },
    house: migrateHouse(s.house, d.house),
  };
}

/** Saved loads without `kind` are cycle loads; continuous loads without `basis` are manual estimates. */
function migrateLoads(loads: unknown): LoadDef[] | null {
  if (!Array.isArray(loads)) return null;
  return loads.map((l: LoadDef) => {
    if (!("kind" in l)) return { ...(l as object), kind: "cycle" } as LoadDef;
    if (l.kind === "continuous" && !("basis" in l)) return { ...(l as object), use: null, basis: "manual", area_m2: null } as LoadDef;
    return l;
  });
}

// House model. Heating: thermal kWh/m² = degree days × need per degree day, spread over the
// legal heating period (DPR 74/2013); electric = thermal ÷ SCOP. Cooling: thermal kWh/m² per zone ÷ SEER.
const ZONE_GG: Record<ClimateZone, number> = { A: 500, B: 750, C: 1150, D: 1750, E: 2550, F: 3300 };
/** Share of each month inside the heating period, Jan..Dec. */
const HEATING_PERIOD: Record<ClimateZone, number[]> = {
  A: [1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1/12 – 15/3
  B: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1/12 – 31/3
  C: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 1], // 15/11 – 31/3
  D: [1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0, 1, 1], // 1/11 – 15/4
  E: [1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0.5, 1, 1], // 15/10 – 15/4
  F: [1, 1, 1, 1, 0.5, 0, 0, 0, 0.5, 1, 1, 1], // no limit
};
/** Heating need per day relative to January. */
const HDD_SHAPE = [1, 0.9, 0.7, 0.45, 0.25, 0.08, 0.03, 0.03, 0.15, 0.35, 0.6, 0.9];
const NEED_PER_GG: Record<Insulation, number> = { good: 0.02, medium: 0.045, poor: 0.08 };
const SCOP_ZONE: Record<ClimateZone, number> = { A: 0.2, B: 0.2, C: 0, D: 0, E: -0.3, F: -0.3 };
const COOLING_KWH_M2: Record<ClimateZone, number> = { A: 40, B: 35, C: 30, D: 22, E: 12, F: 5 };
const COOLING_INSULATION: Record<Insulation, number> = { good: 0.7, medium: 1, poor: 1.3 };
const COOLING_SHAPE = [0, 0, 0, 0, 0, 0.15, 0.35, 0.35, 0.15, 0, 0, 0];

interface HeatPump {
  id: string;
  label: string;
  /** SCOP by emitter, average climate (EN 14825); floor = 35 °C flow, radiators = 55 °C, fancoil in between. */
  scop: Record<Emitter, number>;
  seer: number;
}

const HEAT_PUMPS: HeatPump[] = [
  { id: "generic", label: "Generica", scop: { floor: 4.0, fancoil: 3.5, radiators: 2.8 }, seer: 4.5 },
  // Daikin datasheet ERLA11DV3 + EBVX11S23D6V: SCOP 4.72 at 35 °C, 3.27 at 55 °C. No SEER published: typical value.
  { id: "daikin_altherma3_rf_11", label: "Altherma 3 RF 11 kW", scop: { floor: 4.72, fancoil: 4.0, radiators: 3.27 }, seer: 4.5 },
];

function houseModel(h: HouseSettings): HouseModel {
  const zone = ZONE_GG[h.climate_zone] ? h.climate_zone : "C";
  const gg = ZONE_GG[zone];
  const pump = HEAT_PUMPS.find((p) => p.id === h.heat_pump) ?? HEAT_PUMPS[0];
  const heatWeights = normalize(HDD_SHAPE.map((v, m) => v * HEATING_PERIOD[zone][m] * DAYS_IN_MONTH[m]));
  const heatTotal = gg * (NEED_PER_GG[h.insulation] ?? NEED_PER_GG.medium);
  const coolTotal = COOLING_KWH_M2[zone] * (COOLING_INSULATION[h.insulation] ?? 1);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const sized = h.zones.filter((z) => z.area_m2 !== null && z.area_m2 > 0);
  const heated = sized.reduce((a, z) => a + z.area_m2!, 0);
  const cooled = sized.filter((z) => z.cooling && z.emitter !== "radiators").reduce((a, z) => a + z.area_m2!, 0);
  // Same thermal need per m² everywhere, each zone at its own flow temperature: electric = Σ area ÷ SCOP.
  const scopOf = (e: Emitter) => (pump.scop[e] ?? pump.scop.fancoil) + SCOP_ZONE[zone];
  const scop = heated ? heated / sized.reduce((a, z) => a + z.area_m2! / scopOf(z.emitter), 0) : scopOf(h.zones[0]?.emitter ?? "fancoil");
  return {
    heating_kwh_th_m2: heatWeights.map((w) => r3(w * heatTotal)),
    cooling_kwh_th_m2: normalize(COOLING_SHAPE).map((w) => r3(w * coolTotal)),
    heated_area_m2: heated || null,
    cooled_area_m2: heated ? cooled : null,
    scop: round2(scop),
    seer: pump.seer,
    gg,
  };
}

// Whole-house meters; the first one is the grid import of the Energy dashboard.
const METER_OPTIONS = [
  { entity_id: "sensor.demo_casa_energia", name: "Prelievo dalla rete (demo)" },
  { entity_id: "sensor.demo_contatore_anno", name: "Contatore, un anno (demo)" },
];

type MeterHistory = { from: string; to: string; days: number; daysByMonth: number[]; kwhByMonth: number[] };

// What the house really uses; the demo meters measure slices of it.
const DEMO_TRUE_MONTHLY = [760, 660, 540, 410, 350, 400, 520, 530, 410, 410, 560, 740];
const meterHistory = (from: string, to: string, daysByMonth: number[]): MeterHistory => ({
  from,
  to,
  days: daysByMonth.reduce((a, b) => a + b, 0),
  daysByMonth,
  kwhByMonth: DEMO_TRUE_MONTHLY.map((kwh, m) => (kwh * daysByMonth[m]) / DAYS_IN_MONTH[m]),
});
const METERS: Record<string, MeterHistory> = {
  "sensor.demo_casa_energia": meterHistory("2026-09-26", "2026-11-11", [0, 0, 0, 0, 0, 0, 0, 0, 5, 31, 11, 0]),
  "sensor.demo_contatore_anno": meterHistory("2025-11-12", "2026-11-11", DAYS_IN_MONTH),
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Monthly totals from meter history and bill: history wins; the estimate fills the unmeasured part of each month. */
function blendConsumption(c: ConsumptionSettings): { info: Omit<DataInfo, "loads_exceed_months">; monthly: number[] | null } {
  const weights = SEASONAL_PROFILES[c.seasonal_profile] ?? SEASONAL_PROFILES.pdc_heating;
  const found = c.meter_entity_id ? METERS[c.meter_entity_id] : undefined;
  const meter = found && found.days > 0 ? found : undefined;
  const annual = c.annual_kwh !== null && c.annual_kwh > 0 ? c.annual_kwh : null;
  const coverage = meter ? { from: meter.from, to: meter.to, days: meter.days } : { from: null, to: null, days: 0 };
  const pattern_source = meter && meter.days >= 14 ? ("sensor" as const) : ("profile" as const);
  const zeros = new Array<number>(12).fill(0);
  const result = (source: DataInfo["source"], monthly: number[], measuredKwh: number[], warning: DataInfo["warning"] = null) => ({
    info: {
      source,
      ...coverage,
      annual_kwh: Math.round(sum(monthly)),
      months: monthly.map((kwh, m) => ({ kwh: Math.round(kwh), measured_share: kwh > 0 ? round2(Math.min(1, measuredKwh[m] / kwh)) : 0 })),
      pattern_source,
      warning,
    },
    monthly,
  });

  if (!meter && annual === null) return { ...result("missing", zeros, zeros), monthly: null };
  if (!meter) return result("estimate", weights.map((w) => w * annual!), zeros);
  const share = meter.daysByMonth.map((d, m) => Math.min(1, d / DAYS_IN_MONTH[m]));
  if (meter.days >= 365) return result("measured", meter.kwhByMonth, meter.kwhByMonth);
  const measured = sum(meter.kwhByMonth);
  // Full-month estimates, scaled so that measured + unmeasured parts add up to the bill, or projected from the measured months.
  const estimate =
    annual !== null
      ? weights.map((w) => (Math.max(0, annual - measured) * w) / sum(weights.map((x, m) => x * (1 - share[m]))))
      : weights.map((w) => (measured * w) / sum(weights.map((x, m) => x * share[m])));
  const monthly = meter.kwhByMonth.map((kwh, m) => kwh + (1 - share[m]) * estimate[m]);
  return result("mixed", monthly, meter.kwhByMonth, annual !== null && measured > annual ? "measured_exceeds_annual" : null);
}

const SENSOR_OPTIONS = [
  { entity_id: "sensor.demo_lavanderia_energia", name: "Pinza NodOn · lavanderia (demo)" },
  { entity_id: "sensor.demo_lavastoviglie_energia", name: "Presa smart · lavastoviglie (demo)" },
  { entity_id: "sensor.demo_acs_energia", name: "Daikin Onecta · energia ACS (demo)" },
  { entity_id: "sensor.demo_pdc_energia", name: "Daikin Onecta · energia riscaldamento (demo)" },
];

/** Spreads `total` starts over 24 hours following `weights`, keeping whole numbers. */
function histogram(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  const order = exact.map((v, h) => [v - Math.floor(v), h]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < total - out.reduce((a, b) => a + b, 0); i++) out[order[i][1]]++;
  return out;
}

function detectedFor(entity_id: string, cycles: number, kwh: number, hours: number, weights: number[]): LoadDetected {
  const start_histogram = histogram(cycles, weights);
  return {
    entity_id,
    cycles_per_year: cycles,
    kwh_per_cycle: kwh,
    duration_h: hours,
    usual_start_hour: start_histogram.indexOf(Math.max(...start_histogram)),
    start_histogram,
  };
}

// What the demo sensors "measured" over the last year.
const DETECTED: LoadDetected[] = [
  detectedFor("sensor.demo_lavanderia_energia", 209, 0.9, 2, [0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 3, 2, 1, 1, 2, 2, 2, 3, 4, 4, 3, 2, 1, 0]),
  detectedFor("sensor.demo_lavastoviglie_energia", 248, 1.0, 3, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 1, 4, 6, 3, 1]),
  detectedFor("sensor.demo_acs_energia", 365, 2.4, 2, [0, 0, 0, 0, 0, 1, 5, 7, 3, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
  {
    entity_id: "sensor.demo_pdc_energia",
    cycles_per_year: 0,
    kwh_per_cycle: 0,
    duration_h: 0,
    usual_start_hour: 0,
    start_histogram: new Array<number>(24).fill(0),
    continuous: { kwh_per_day_by_month: [14.5, 12.8, 8.6, 3.2, 0, 0, 0, 0, 0, 2.1, 7.9, 13.6], hour_profile: HEAT_SHAPE.map((v) => Math.round(v * 1000) / 1000) },
  },
];

export const DEFAULT_LOADS: LoadDef[] = [
  { id: "lavatrice", kind: "cycle", name: "Lavatrice", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 0.9, duration_h: 2, cycles_per_week: 4, usual_time: "any", shiftable: true, window_start: 9, window_end: 18, after: null },
  { id: "asciugatrice", kind: "cycle", name: "Asciugatrice", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 1.6, duration_h: 2, cycles_per_week: 4, usual_time: "any", shiftable: true, window_start: 9, window_end: 18, after: "lavatrice" },
  { id: "lavastoviglie", kind: "cycle", name: "Lavastoviglie", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 1.0, duration_h: 3, cycles_per_week: 5, usual_time: "evening", shiftable: true, window_start: 9, window_end: 18, after: null },
  { id: "acs", kind: "cycle", name: "Acqua calda (PDC)", source: "sensor", sensor_entity_id: "sensor.demo_acs_energia", kwh_per_cycle: 2.4, duration_h: 2, cycles_per_week: 7, usual_time: "morning", shiftable: true, window_start: 10, window_end: 16, after: null },
  { id: "pdc_riscaldamento", kind: "continuous", name: "PDC riscaldamento", source: "estimate", sensor_entity_id: null, use: "heating", basis: "house", area_m2: null, kwh_per_day: 12, months: [11, 12, 1, 2, 3], hour_profile: "heating", shiftable: true, shift_share: 0.3, shift_advance_h: 3 },
  { id: "pdc_raffrescamento", kind: "continuous", name: "PDC raffrescamento", source: "estimate", sensor_entity_id: null, use: "cooling", basis: "house", area_m2: null, kwh_per_day: 6, months: [6, 7, 8, 9], hour_profile: "cooling", shiftable: true, shift_share: 0.3, shift_advance_h: 2 },
];

type Prices = { grid: number; fixedAnnual: number; rid: number };
type BatteryCfg = { powerKw: number; usable: number; eff: number; exportLimit: number };
/** `idx` is the position in the load list, used for per-load costs. */
type CycleCfg = {
  idx: number; kwh: number; hours: number; perWeek: number; usual: UsualTime;
  /** Measured start-hour histogram; replaces `usual` when present. */
  startWeights: number[] | null;
  shiftable: boolean; ws: number; we: number;
  /** Index in the cycle list. */
  after: number;
};
type ContCfg = {
  idx: number; kwhByMonth: number[]; hourWeights: number[];
  /** Colder or hotter days draw more. */
  weather: boolean;
  shiftable: boolean; share: number; advance: number;
};
type Cycle = { load: number; start: number; hours: number; kw: number; pairOf: number };
type Base = {
  load0: Float64Array; pv1: Float64Array; cycles: Cycle[]; monthOfHour: Uint8Array;
  /** Hourly draw of each continuous load at the usual times, and its active days. */
  conts: Float64Array[]; contDays: number[];
  /** Months where loads exceeded the month's total and continuous loads were cut back. */
  exceed: number[];
};
type PerLoad = { cost: number[]; count: number[] };
type Sim = {
  cons: number; pv: number; imp: number; exp: number; curt: number; pvSelf: number;
  mDirect: number[]; mBatt: number[]; mImp: number[]; mPvSelf: number[]; mExp: number[]; mCurt: number[];
};
type Entry = { sim: Sim; perLoad: PerLoad };
type CashFlow = { cumulative: number[]; payback: number | null; deductionPerYear: number; replacements: number[] };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(weights: number[], r: number): number {
  let x = r * weights.reduce((a, b) => a + b, 0);
  for (let h = 0; h < weights.length; h++) {
    x -= weights[h];
    if (x < 0) return h;
  }
  return weights.length - 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function toLoadCfgs(loads: LoadDef[], house: HouseSettings): { cycles: CycleCfg[]; conts: ContCfg[] } {
  const ctx = { detected: DETECTED, model: houseModel(house) };
  const cycleLoads = loads.filter((l): l is CycleLoad => l.kind === "cycle");
  const cycles = cycleLoads.map((l): CycleCfg => {
    const use = effectiveUsage(l, DETECTED);
    const hours = clamp(Math.round(use.hours), 1, 6);
    let ws = clamp(Math.round(l.window_start), 0, 23);
    let we = clamp(Math.round(l.window_end), 1, 24);
    if (we - ws < hours) we = Math.min(24, ws + hours);
    if (we - ws < hours) ws = we - hours;
    return {
      idx: loads.indexOf(l),
      kwh: Math.max(0, use.kwh),
      hours,
      perWeek: use.measured ? use.perWeek : clamp(Math.round(use.perWeek), 0, 14),
      usual: l.usual_time,
      startWeights: use.measured?.start_histogram ?? null,
      shiftable: l.shiftable,
      ws,
      we,
      // Every load on a loop of "deve aspettare", or waiting for a continuous load, runs on its own.
      after: l.after && !createsLoop(loads, l.id, l.after) ? cycleLoads.findIndex((x) => x.id === l.after) : -1,
    };
  });
  const conts = loads.flatMap((l, idx): ContCfg[] => {
    if (l.kind !== "continuous") return [];
    const use = continuousUsage(l, ctx);
    return [
      {
        idx,
        kwhByMonth: use.kwhByMonth.map((v) => Math.max(0, v)),
        hourWeights: normalize(use.measured?.hour_profile ?? HOUR_SHAPES[l.hour_profile] ?? HOUR_SHAPES.flat),
        weather: use.measured !== undefined || l.hour_profile !== "flat",
        shiftable: l.shiftable,
        share: clamp(l.shift_share, 0, 0.5),
        advance: clamp(Math.round(l.shift_advance_h), 1, 4),
      },
    ];
  });
  return { cycles, conts };
}

function buildBase(monthly: number[], loads: CycleCfg[], conts: ContCfg[]): Base {
  const rng = mulberry32(40721487);
  const load0 = new Float64Array(HOURS);
  const pv1 = new Float64Array(HOURS);
  const monthOfHour = new Uint8Array(HOURS);
  const contSeries = conts.map(() => new Float64Array(HOURS));
  const contDays = conts.map(() => 0);
  const exceed: number[] = [];
  const loadsPerDay = loads.reduce((a, l) => a + (l.kwh * l.perWeek) / 7, 0);
  let day = 0;
  for (let m = 0; m < 12; m++) {
    const days = DAYS_IN_MONTH[m];
    const cloud: number[] = [];
    for (let i = 0; i < days; i++) cloud.push(rng() < CLEAR_SKY_PROB[m] ? 1.1 + 0.15 * rng() : 0.2 + 0.7 * rng());
    const meanCloud = cloud.reduce((a, b) => a + b, 0) / days;
    const cooling = m >= 5 && m <= 8;
    const hvacW = cloud.map((c) => (cooling ? 0.5 + (c > 1 ? 0.7 : 0) + 0.4 * rng() : 1 + (c < 0.8 ? 0.5 : 0) + 0.4 * rng()));
    const sumW = hvacW.reduce((a, b) => a + b, 0);
    const nonHvacDay = BASE_KW * 24 + COOKING_KWH_DAY + OTHER_KWH_DAY;
    const cycleMonth = loadsPerDay * days;
    const contMonth = conts.reduce((a, c) => a + c.kwhByMonth[m] * days, 0);
    let contScale = 1;
    if (contMonth > 0 && cycleMonth + contMonth > monthly[m] + 0.5) {
      contScale = Math.max(0, monthly[m] - cycleMonth) / contMonth;
      exceed.push(m);
    }
    const rest = monthly[m] - cycleMonth - contMonth * contScale;
    let hvacMonth = rest - nonHvacDay * days;
    let scale = 1;
    if (hvacMonth < 0) {
      scale = Math.max(0, rest) / (nonHvacDay * days);
      hvacMonth = 0;
    }
    conts.forEach((c, ci) => {
      if (c.kwhByMonth[m] * contScale > 0) contDays[ci] += days;
    });
    const hvacShape = cooling ? COOL_SHAPE : HEAT_SHAPE;
    for (let i = 0; i < days; i++, day++) {
      const dst = day >= DST_START_DAY && day < DST_END_DAY;
      const cook = (4 + day) % 7 >= 5 ? COOK_WEEKEND : COOK_WEEKDAY;
      const pvDay = (PV_KWH_PER_KWP[m] / days) * (cloud[i] / meanCloud);
      const len = DAY_LENGTH_H[m];
      const rise = (dst ? 13 : 12) - len / 2;
      const shape: number[] = [];
      let pvSum = 0;
      for (let h = 0; h < 24; h++) {
        const x = (h + 0.5 - rise) / len;
        const v = x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.5) : 0;
        shape.push(v);
        pvSum += v;
      }
      const hvacDay = (hvacMonth * hvacW[i]) / sumW;
      const contDay = conts.map((c) => c.kwhByMonth[m] * contScale * (c.weather ? (hvacW[i] * days) / sumW : 1));
      for (let h = 0; h < 24; h++) {
        const idx = day * 24 + h;
        monthOfHour[idx] = m;
        pv1[idx] = pvSum > 0 ? (pvDay * shape[h]) / pvSum : 0;
        load0[idx] = scale * (BASE_KW + cook[h] * COOKING_KWH_DAY + OTHER_SHAPE[h] * OTHER_KWH_DAY) + hvacDay * hvacShape[h];
        conts.forEach((c, ci) => (contSeries[ci][idx] = contDay[ci] * c.hourWeights[h]));
      }
    }
  }

  const cycles: Cycle[] = [];
  const depth = (i: number): number => (loads[i].after < 0 ? 0 : 1 + depth(loads[i].after));
  const order = loads.map((_, i) => i).sort((a, b) => depth(a) - depth(b));
  for (let w = 0; w * 7 < 365; w++) {
    const avail = Math.min(7, 365 - w * 7);
    const weekCycles: number[][] = loads.map(() => []);
    for (const li of order) {
      const l = loads[li];
      if (l.kwh <= 0 || l.perWeek <= 0) continue;
      const days = Array.from({ length: avail }, (_, i) => i);
      for (let i = days.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [days[i], days[j]] = [days[j], days[i]];
      }
      const [from, to] = USUAL_TIME_RANGE[l.usual];
      const anchors = l.after >= 0 ? weekCycles[l.after] : [];
      const n = Math.round((l.perWeek * avail) / 7);
      for (let i = 0; i < n; i++) {
        let start: number;
        let pairOf = -1;
        if (i < anchors.length) {
          const a = cycles[anchors[i]];
          start = a.start + a.hours + (rng() < 0.5 ? 0 : 1);
          pairOf = anchors[i];
        } else {
          const hour = l.startWeights ? pickWeighted(l.startWeights, rng()) : from + Math.floor(rng() * (to - from));
          start = (w * 7 + days[i % avail]) * 24 + hour;
        }
        weekCycles[li].push(cycles.length);
        cycles.push({ load: li, start: Math.min(start, HOURS - l.hours), hours: l.hours, kw: l.kwh / l.hours, pairOf });
      }
    }
  }
  return { load0, pv1, cycles, monthOfHour, conts: contSeries, contDays, exceed };
}

function placeCycles(base: Base, loads: CycleCfg[], sur: Float64Array, load: Float64Array, optimize: boolean, prices: Prices, perLoad: PerLoad) {
  const { cycles } = base;
  const starts = new Int32Array(cycles.length);
  const cost = (abs: number, c: Cycle) => {
    let t = 0;
    for (let j = 0; j < c.hours; j++) {
      const a = sur[abs + j];
      const fromPv = Math.min(c.kw, a > 0 ? a : 0);
      t += fromPv * prices.rid + (c.kw - fromPv) * prices.grid;
    }
    return t;
  };
  cycles.forEach((c, i) => {
    const l = loads[c.load];
    const anchor = c.pairOf >= 0 ? cycles[c.pairOf] : null;
    const anchorMoved = anchor !== null && starts[c.pairOf] !== anchor.start;
    const dayStart = Math.floor((anchor ? anchor.start : c.start) / 24) * 24;
    let best = c.start;
    if (anchor && anchorMoved && (!optimize || !l.shiftable)) {
      best = starts[c.pairOf] + (c.start - anchor.start);
    } else if (optimize && l.shiftable) {
      let lo = dayStart + l.ws;
      const hi = dayStart + l.we - c.hours;
      if (anchor) lo = Math.max(lo, starts[c.pairOf] + anchor.hours);
      let bestCost = Infinity;
      if (anchor && anchorMoved) best = starts[c.pairOf] + anchor.hours;
      else bestCost = cost(c.start, c) - 0.005;
      for (let s = lo; s <= hi && s + c.hours <= HOURS; s++) {
        const v = cost(s, c);
        if (v < bestCost - 1e-9) {
          bestCost = v;
          best = s;
        }
      }
    }
    best = Math.max(0, Math.min(best, HOURS - c.hours));
    perLoad.cost[l.idx] += cost(best, c);
    perLoad.count[l.idx] += 1;
    starts[i] = best;
    for (let j = 0; j < c.hours; j++) {
      sur[best + j] -= c.kw;
      load[best + j] += c.kw;
    }
  });
  return { load, perLoad };
}

/**
 * Continuous loads go first: each hour not covered by PV can move up to `share` of its
 * draw to the `advance` hours before it (same day) where PV is left over.
 */
function placeConts(base: Base, conts: ContCfg[], sur: Float64Array, load: Float64Array, optimize: boolean, prices: Prices, perLoad: PerLoad) {
  base.conts.forEach((usual, ci) => {
    const c = conts[ci];
    const s = Float64Array.from(usual);
    if (optimize && c.shiftable && c.share > 0) {
      for (let i = 0; i < HOURS; i++) {
        let movable = Math.min(c.share * usual[i], s[i] - Math.min(s[i], Math.max(0, sur[i])));
        for (let j = i - 1; j >= Math.max(i - (i % 24), i - c.advance) && movable > 1e-9; j--) {
          const spare = sur[j] - s[j];
          if (spare <= 0) continue;
          const take = Math.min(movable, spare);
          s[j] += take;
          s[i] -= take;
          movable -= take;
        }
      }
    }
    let cost = 0;
    for (let i = 0; i < HOURS; i++) {
      const fromPv = Math.min(s[i], Math.max(0, sur[i]));
      cost += fromPv * prices.rid + (s[i] - fromPv) * prices.grid;
      sur[i] -= s[i];
      load[i] += s[i];
    }
    perLoad.cost[c.idx] += cost;
    perLoad.count[c.idx] = base.contDays[ci];
  });
}

/** Hourly load of one scenario with its per-load costs. */
function place(base: Base, cfgs: { cycles: CycleCfg[]; conts: ContCfg[] }, nLoads: number, kwp: number, shift: boolean, prices: Prices) {
  const sur = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) sur[i] = kwp * base.pv1[i] - base.load0[i];
  const load = Float64Array.from(base.load0);
  const perLoad: PerLoad = { cost: new Array<number>(nLoads).fill(0), count: new Array<number>(nLoads).fill(0) };
  placeConts(base, cfgs.conts, sur, load, shift && kwp > 0, prices, perLoad);
  placeCycles(base, cfgs.cycles, sur, load, shift && kwp > 0, prices, perLoad);
  return { load, perLoad };
}

function simulate(load: Float64Array, base: Base, kwp: number, cap: number, bat: BatteryCfg): Sim {
  const z = () => new Array<number>(12).fill(0);
  const s: Sim = { cons: 0, pv: 0, imp: 0, exp: 0, curt: 0, pvSelf: 0, mDirect: z(), mBatt: z(), mImp: z(), mPvSelf: z(), mExp: z(), mCurt: z() };
  const capU = cap * bat.usable;
  let soc = capU * 0.5;
  for (let h = 0; h < HOURS; h++) {
    const m = base.monthOfHour[h];
    const pv = kwp * base.pv1[h];
    const L = load[h];
    const direct = Math.min(pv, L);
    const net = pv - L;
    let ch = 0, dis = 0, im = 0, ex = 0, cu = 0;
    if (net > 0) {
      ch = capU > 0 ? Math.min(net, bat.powerKw, (capU - soc) / bat.eff) : 0;
      soc += ch * bat.eff;
      ex = Math.min(net - ch, bat.exportLimit);
      cu = net - ch - ex;
    } else {
      dis = capU > 0 ? Math.min(-net, bat.powerKw, soc) : 0;
      soc -= dis;
      im = -net - dis;
    }
    s.cons += L; s.pv += pv; s.imp += im; s.exp += ex; s.curt += cu; s.pvSelf += direct + ch;
    s.mDirect[m] += direct; s.mBatt[m] += dis; s.mImp[m] += im; s.mPvSelf[m] += direct + ch; s.mExp[m] += ex; s.mCurt[m] += cu;
  }
  return s;
}

function cashFlow(kwp: number, cap: number, saving1: number, st: Settings): CashFlow {
  const { system: sys, lifetime: life } = st;
  const invest = kwp * sys.cost_per_kwp + cap * sys.cost_per_kwh;
  const deductionPerYear = (invest * sys.deduction_pct) / 100 / 10;
  const replacements: number[] = [];
  const lifeYears = Math.max(5, Math.round(life.battery_life_years));
  if (cap > 0) for (let y = lifeYears; y <= HORIZON_YEARS - 3; y += lifeYears) replacements.push(y);
  let cum = -invest;
  const cumulative = [cum];
  for (let y = 1; y <= HORIZON_YEARS; y++) {
    let flow = saving1 * Math.pow(1 - life.degradation_pct / 100, y - 1) * Math.pow(1 + life.price_increase_pct / 100, y - 1);
    if (y <= 10) flow += deductionPerYear;
    if (replacements.includes(y)) flow -= cap * sys.cost_per_kwh;
    if (kwp > 0 && y === Math.round(life.inverter_year)) flow -= life.inverter_cost;
    cum += flow;
    cumulative.push(cum);
  }
  let payback: number | null = null;
  if (invest <= 0) payback = 0;
  else
    for (let y = 1; y <= HORIZON_YEARS; y++) {
      if (cumulative[y] >= 0 && cumulative[y - 1] < 0) {
        payback = y - 1 + -cumulative[y - 1] / (cumulative[y] - cumulative[y - 1]);
        break;
      }
    }
  return { cumulative, payback, deductionPerYear, replacements };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const roundArr = (a: number[]) => a.map((v) => Math.round(v * 10) / 10);
const key = (k: number, cap: number, shift: boolean) => `${k}|${cap}|${shift ? 1 : 0}`;

export class DemoBackend {
  private settings: Settings;
  private loads: LoadDef[];
  private cache: { key: string; base: Base; entries: Map<string, Entry>; prices: Prices } | null = null;

  constructor(private storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) {
    const saved = this.storage?.getItem(STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as { settings?: Partial<Settings>; loads?: unknown }) : null;
    this.settings = withDefaults(parsed?.settings);
    this.loads = migrateLoads(parsed?.loads) ?? structuredClone(DEFAULT_LOADS);
  }

  reset(): void {
    this.storage?.removeItem(STORAGE_KEY);
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.loads = structuredClone(DEFAULT_LOADS);
    this.cache = null;
  }

  handle(msg: { type: string; [key: string]: unknown }): unknown {
    switch (msg.type) {
      case "pv_sizer/config":
        return this.config();
      case "pv_sizer/results":
        return this.results();
      case "pv_sizer/scenario":
        return this.scenario(Number(msg.pv_kwp), Number(msg.battery_kwh), Boolean(msg.shift));
      case "pv_sizer/settings/update":
        this.settings = withDefaults(msg.settings as Settings);
        this.persist();
        return this.config();
      case "pv_sizer/loads/update":
        this.loads = migrateLoads(msg.loads) ?? [];
        this.persist();
        return this.config();
      default:
        throw new Error(`Comando sconosciuto: ${msg.type}`);
    }
  }

  private persist(): void {
    this.cache = null;
    this.storage?.setItem(STORAGE_KEY, JSON.stringify({ settings: this.settings, loads: this.loads }));
  }

  private get pvSizes(): number[] {
    return this.settings.scenarios.pv_sizes_kwp;
  }

  private get batterySizes(): number[] {
    return [0, ...this.settings.scenarios.battery_sizes_kwh];
  }

  private prices(): Prices {
    const t = this.settings.tariff;
    const vat = 1 + t.vat_pct / 100;
    return {
      grid: (t.energy_price + t.excise) * vat,
      fixedAnnual: (t.fixed_monthly * 12 + t.power_fee * t.power_kw * 12) * vat,
      rid: t.export_price,
    };
  }

  private computed() {
    const cacheKey = JSON.stringify([this.settings, this.loads]);
    if (this.cache?.key === cacheKey) return this.cache;
    const { monthly } = blendConsumption(this.settings.consumption);
    if (!monthly) throw new Error("Mancano i dati di consumo: scegli un misuratore o inserisci il consumo annuo.");
    const cfgs = toLoadCfgs(this.loads, this.settings.house);
    const prices = this.prices();
    const sys = this.settings.system;
    const bat: BatteryCfg = {
      powerKw: Math.max(0.5, sys.battery_power_kw),
      usable: Math.min(1, Math.max(0.5, sys.usable_pct / 100)),
      eff: Math.min(1, Math.max(0.5, sys.efficiency_pct / 100)),
      exportLimit: Math.max(0, sys.export_limit_kw),
    };
    const base = buildBase(monthly, cfgs.cycles, cfgs.conts);
    const entries = new Map<string, Entry>();
    for (const shift of [false, true]) {
      for (const k of [0, ...this.pvSizes]) {
        const { load, perLoad } = place(base, cfgs, this.loads.length, k, shift, prices);
        for (const cap of k === 0 ? [0] : this.batterySizes) {
          entries.set(key(k, cap, shift), { sim: simulate(load, base, k, cap, bat), perLoad });
        }
      }
    }
    this.cache = { key: cacheKey, base, entries, prices };
    return this.cache;
  }

  private baselineBill(): number {
    const { entries, prices } = this.computed();
    return entries.get(key(0, 0, false))!.sim.imp * prices.grid + prices.fixedAnnual;
  }

  private summary(k: number, cap: number, shift: boolean): { cell: CellSummary; cf: CashFlow } {
    const { entries, prices } = this.computed();
    const { sim } = entries.get(key(k, cap, shift))!;
    const bill = sim.imp * prices.grid + prices.fixedAnnual - sim.exp * prices.rid;
    const saving = this.baselineBill() - bill;
    const cf = cashFlow(k, cap, saving, this.settings);
    return {
      cf,
      cell: {
        pv_kwp: k,
        battery_kwh: cap,
        shift,
        bill_eur: round2(bill),
        saving_eur: round2(saving),
        self_sufficiency: sim.cons > 0 ? (sim.cons - sim.imp) / sim.cons : 0,
        self_consumption: sim.pv > 0 ? sim.pvSelf / sim.pv : 0,
        consumption_kwh: Math.round(sim.cons),
        import_kwh: Math.round(sim.imp),
        pv_kwh: Math.round(sim.pv),
        pv_used_kwh: Math.round(sim.pvSelf),
        investment_eur: k * this.settings.system.cost_per_kwp + cap * this.settings.system.cost_per_kwh,
        payback_years: cf.payback,
        gain_eur: round2(cf.cumulative[HORIZON_YEARS]),
      },
    };
  }

  private config(): PanelConfig {
    const prices = this.prices();
    const { info, monthly } = blendConsumption(this.settings.consumption);
    return {
      demo: true,
      location: { name: "San Cipriano Picentino (SA)", latitude: 40.72, longitude: 14.87 },
      horizon_years: HORIZON_YEARS,
      data: { ...info, loads_exceed_months: monthly ? this.computed().base.exceed : [] },
      settings: this.settings,
      loads: this.loads,
      detected: DETECTED,
      sensor_options: SENSOR_OPTIONS,
      meter_options: METER_OPTIONS,
      heat_pump_options: HEAT_PUMPS.map(({ id, label }) => ({ id, label })),
      derived: { grid_price_eur_kwh: prices.grid, fixed_annual_eur: round2(prices.fixedAnnual), house: houseModel(this.settings.house) },
    };
  }

  private results(): Results {
    const { entries } = this.computed();
    const cells: CellSummary[] = [];
    for (const shift of [false, true]) for (const k of this.pvSizes) for (const cap of this.batterySizes) cells.push(this.summary(k, cap, shift).cell);
    return {
      baseline: { annual_kwh: Math.round(entries.get(key(0, 0, false))!.sim.cons), bill_eur: round2(this.baselineBill()) },
      cells,
      load_savings_by_pv: this.pvSizes.map((k) => {
        const off = entries.get(key(k, 0, false))!.perLoad;
        const on = entries.get(key(k, 0, true))!.perLoad;
        return { pv_kwp: k, by_load: Object.fromEntries(this.loads.map((l, i) => [l.id, round2(off.cost[i] - on.cost[i])])) };
      }),
    };
  }

  private scenario(kwp: number, capIn: number, shift: boolean): ScenarioDetail {
    const nearest = (xs: number[], v: number) => xs.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const k = kwp > 0 ? nearest(this.pvSizes, kwp) : 0;
    const cap = k === 0 ? 0 : nearest(this.batterySizes, capIn);
    const { entries } = this.computed();
    const { sim } = entries.get(key(k, cap, shift))!;
    const { cell, cf } = this.summary(k, cap, shift);
    const sys = this.settings.system;
    const items: CostItem[] = [];
    if (k > 0) {
      items.push({ kind: "pv", quantity: k, unit_cost: sys.cost_per_kwp, amount_eur: k * sys.cost_per_kwp });
      if (cap > 0) items.push({ kind: "battery", quantity: cap, unit_cost: sys.cost_per_kwh, amount_eur: cap * sys.cost_per_kwh });
      if (sys.deduction_pct > 0) items.push({ kind: "deduction", pct: sys.deduction_pct, per_year_eur: round2(cf.deductionPerYear), years: 10 });
      for (const y of cf.replacements) items.push({ kind: "battery_replacement", year: y, amount_eur: cap * sys.cost_per_kwh });
      const invYear = Math.round(this.settings.lifetime.inverter_year);
      if (invYear >= 1 && invYear <= HORIZON_YEARS) items.push({ kind: "inverter_replacement", year: invYear, amount_eur: this.settings.lifetime.inverter_cost });
    }
    const compareCap = cap > 0 ? 0 : (this.batterySizes.find((c) => c >= 5) ?? this.batterySizes[1] ?? null);
    const noPv = entries.get(key(0, 0, false))!.perLoad;
    const off = entries.get(key(k, cap, false))!.perLoad;
    const on = entries.get(key(k, cap, true))!.perLoad;
    const loads: LoadValue[] = this.loads.map((l, i) => {
      const n = off.count[i] || 1;
      return {
        load_id: l.id,
        kind: l.kind,
        cycles_per_year: off.count[i],
        cost_per_cycle_no_pv: round2(noPv.cost[i] / n),
        cost_per_cycle_pv: round2(off.cost[i] / n),
        cost_per_cycle_shifted: round2(on.cost[i] / n),
        saving_eur: round2(off.cost[i] - on.cost[i]),
      };
    });
    return {
      summary: cell,
      energy: {
        consumption_kwh: Math.round(sim.cons),
        pv_kwh: Math.round(sim.pv),
        pv_used_kwh: Math.round(sim.pvSelf),
        import_kwh: Math.round(sim.imp),
        export_kwh: Math.round(sim.exp),
        curtailed_kwh: Math.round(sim.curt),
      },
      monthly: {
        direct: roundArr(sim.mDirect),
        battery: roundArr(sim.mBatt),
        grid: roundArr(sim.mImp),
        pv_used: roundArr(sim.mPvSelf),
        exported: roundArr(sim.mExp),
        curtailed: roundArr(sim.mCurt),
      },
      costs: { items, cash_flow_eur: cf.cumulative.map(Math.round) },
      comparison: k > 0 && compareCap !== null ? { battery_kwh: compareCap, cash_flow_eur: this.summaryCashFlow(k, compareCap, shift) } : null,
      loads,
      shift_effect_eur: round2(this.summary(k, cap, true).cell.saving_eur - this.summary(k, cap, false).cell.saving_eur),
    };
  }

  private summaryCashFlow(k: number, cap: number, shift: boolean): number[] {
    return this.summary(k, cap, shift).cf.cumulative.map(Math.round);
  }
}
