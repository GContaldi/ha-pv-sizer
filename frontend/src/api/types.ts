// WebSocket contract between the panel and the pv_sizer integration.
// Energy in kWh, money in EUR, ratios 0..1, hours 0..24 local time.

/** Start bands: night 0–6, morning 6–12, afternoon 12–18, evening 18–24. */
export type UsualTime = "any" | "night" | "morning" | "afternoon" | "evening";

export interface Tariff {
  energy_price: number;
  excise: number;
  vat_pct: number;
  fixed_monthly: number;
  power_fee: number;
  power_kw: number;
  export_price: number;
}

export interface SystemCosts {
  cost_per_kwp: number;
  cost_per_kwh: number;
  deduction_pct: number;
  battery_power_kw: number;
  usable_pct: number;
  efficiency_pct: number;
  export_limit_kw: number;
}

export interface Lifetime {
  degradation_pct: number;
  price_increase_pct: number;
  battery_life_years: number;
  inverter_cost: number;
  inverter_year: number;
}

/** Sizes to compare. "No battery" is always simulated and never listed. */
export interface ScenarioSizes {
  pv_sizes_kwp: number[];
  battery_sizes_kwh: number[];
}

/** Month-by-month shape used for the months the meter has not measured. */
export type SeasonalProfile = "pdc_heating" | "pdc_heating_cooling" | "no_pdc";

export interface ConsumptionSettings {
  /** Whole-house energy sensor (total_increasing kWh). */
  meter_entity_id: string | null;
  /** Yearly total from the bill. */
  annual_kwh: number | null;
  seasonal_profile: SeasonalProfile;
}

export interface Settings {
  tariff: Tariff;
  system: SystemCosts;
  lifetime: Lifetime;
  scenarios: ScenarioSizes;
  consumption: ConsumptionSettings;
}

interface LoadBase {
  id: string;
  name: string;
  source: "estimate" | "sensor";
  sensor_entity_id: string | null;
  shiftable: boolean;
}

/** Runs in discrete cycles that can start later (washing machine, car, …). */
export interface CycleLoad extends LoadBase {
  kind: "cycle";
  kwh_per_cycle: number;
  duration_h: number;
  cycles_per_week: number;
  usual_time: UsualTime;
  window_start: number;
  window_end: number;
  /** Id of a cycle load that must finish first. */
  after: string | null;
}

export type HourProfile = "flat" | "heating" | "cooling";

/** Draws power every day of its active months (heat pump, air conditioning, ventilation). */
export interface ContinuousLoad extends LoadBase {
  kind: "continuous";
  /** In the active months. */
  kwh_per_day: number;
  /** 1..12 */
  months: number[];
  hour_profile: HourProfile;
  /** 0..0.5: share of each hour that can run earlier, using the thermal inertia of the house. */
  shift_share: number;
  /** 1..4: how many hours earlier at most. */
  shift_advance_h: number;
}

export type LoadDef = CycleLoad | ContinuousLoad;

/** What the history of one sensor option shows; loads with source "sensor" use these. */
export interface LoadDetected {
  entity_id: string;
  /** 0 when the history shows no distinct cycles. */
  cycles_per_year: number;
  kwh_per_cycle: number;
  duration_h: number;
  usual_start_hour: number;
  /** Cycle starts per local hour over the last 12 months. */
  start_histogram: number[];
  /** Daily use for continuous loads: kWh/day per month (0 = off) and share of the day's energy per hour. */
  continuous?: { kwh_per_day_by_month: number[]; hour_profile: number[] };
}

export interface SensorOption {
  entity_id: string;
  name: string;
}

/** How the typical year was built from meter history and estimates. */
export interface DataInfo {
  source: "measured" | "mixed" | "estimate" | "missing";
  /** Meter coverage. */
  from: string | null;
  to: string | null;
  days: number;
  /** Total used by the calculation. */
  annual_kwh: number;
  /** 12 entries; measured_share is the measured part of the month's kWh, 0..1. */
  months: { kwh: number; measured_share: number }[];
  /** Where the daily shape (hour × weekday) comes from. */
  pattern_source: "sensor" | "profile";
  warning: "measured_exceeds_annual" | null;
  /** 0-based months where the loads exceeded the month's total and were cut back. */
  loads_exceed_months: number[];
}

/** `pv_sizer/config` and the reply of every update command. */
export interface PanelConfig {
  /** Synthetic data from the development backend. */
  demo: boolean;
  location: { name: string; latitude: number; longitude: number };
  horizon_years: number;
  data: DataInfo;
  settings: Settings;
  loads: LoadDef[];
  detected: LoadDetected[];
  sensor_options: SensorOption[];
  /** Whole-house meters; the grid import of the Energy dashboard comes first. */
  meter_options: SensorOption[];
  derived: { grid_price_eur_kwh: number; fixed_annual_eur: number };
}

export interface CellSummary {
  pv_kwp: number;
  battery_kwh: number;
  shift: boolean;
  bill_eur: number;
  saving_eur: number;
  self_sufficiency: number;
  self_consumption: number;
  consumption_kwh: number;
  import_kwh: number;
  pv_kwh: number;
  pv_used_kwh: number;
  investment_eur: number;
  /** null = not paid back within the horizon */
  payback_years: number | null;
  gain_eur: number;
}

/** `pv_sizer/results`: one cell per pv size × battery size × shift. */
export interface Results {
  baseline: { annual_kwh: number; bill_eur: number };
  cells: CellSummary[];
  /** Yearly saving from shifting each load, battery 0, per pv size. */
  load_savings_by_pv: { pv_kwp: number; by_load: Record<string, number> }[];
}

export interface MonthlySeries {
  direct: number[];
  battery: number[];
  grid: number[];
  pv_used: number[];
  exported: number[];
  curtailed: number[];
}

export type CostItem =
  | { kind: "pv"; quantity: number; unit_cost: number; amount_eur: number }
  | { kind: "battery"; quantity: number; unit_cost: number; amount_eur: number }
  | { kind: "deduction"; pct: number; per_year_eur: number; years: number }
  | { kind: "battery_replacement"; year: number; amount_eur: number }
  | { kind: "inverter_replacement"; year: number; amount_eur: number };

/** For continuous loads cycles_per_year counts active days and costs are per day. */
export interface LoadValue {
  load_id: string;
  kind: LoadDef["kind"];
  cycles_per_year: number;
  cost_per_cycle_no_pv: number;
  cost_per_cycle_pv: number;
  cost_per_cycle_shifted: number;
  saving_eur: number;
}

/** `pv_sizer/scenario`: everything shown for the selected cell. */
export interface ScenarioDetail {
  summary: CellSummary;
  energy: {
    consumption_kwh: number;
    pv_kwh: number;
    pv_used_kwh: number;
    import_kwh: number;
    export_kwh: number;
    curtailed_kwh: number;
  };
  monthly: MonthlySeries;
  costs: { items: CostItem[]; cash_flow_eur: number[] };
  comparison: { battery_kwh: number; cash_flow_eur: number[] } | null;
  loads: LoadValue[];
  shift_effect_eur: number;
}

export interface ScenarioRequest {
  pv_kwp: number;
  battery_kwh: number;
  shift: boolean;
}
