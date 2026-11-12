// WebSocket contract between the panel and the pv_sizer integration.
// Energy in kWh, money in EUR, ratios 0..1, hours 0..24 local time.

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

export interface Settings {
  tariff: Tariff;
  system: SystemCosts;
  lifetime: Lifetime;
}

export interface LoadDef {
  id: string;
  name: string;
  source: "estimate" | "sensor";
  sensor_entity_id: string | null;
  kwh_per_cycle: number;
  duration_h: number;
  cycles_per_week: number;
  usual_time: UsualTime;
  shiftable: boolean;
  window_start: number;
  window_end: number;
  after: string | null;
}

export interface LoadDetected {
  load_id: string;
  cycles_per_year: number;
  kwh_per_cycle: number;
  duration_h: number;
  usual_start_hour: number;
}

export interface SensorOption {
  entity_id: string;
  name: string;
}

export interface DataInfo {
  source: "statistics" | "demo";
  consumption_entity_id: string | null;
  from: string;
  to: string;
  days: number;
  annual_kwh: number;
}

/** `pv_sizer/config` and the reply of every update command. */
export interface PanelConfig {
  location: { name: string; latitude: number; longitude: number };
  pv_sizes_kwp: number[];
  battery_sizes_kwh: number[];
  horizon_years: number;
  data: DataInfo;
  settings: Settings;
  loads: LoadDef[];
  detected: LoadDetected[];
  sensor_options: SensorOption[];
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

export interface LoadValue {
  load_id: string;
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
