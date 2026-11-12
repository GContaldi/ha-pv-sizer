import type { ScenarioSizes } from "./api/types";

export const SIZE_LIMITS = {
  pv: { min: 0.5, max: 30, maxCount: 6 },
  battery: { min: 1, max: 40, maxCount: 4 },
};

const clean = (values: number[], { min, max, maxCount }: { min: number; max: number; maxCount: number }) =>
  [...new Set(values.filter((v) => Number.isFinite(v) && v >= min && v <= max).map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b).slice(0, maxCount);

/** Sorted, deduplicated, within limits. The backend applies the same rules. */
export function normalizeSizes(s: ScenarioSizes, fallback: ScenarioSizes): ScenarioSizes {
  const pv = clean(s.pv_sizes_kwp ?? [], SIZE_LIMITS.pv);
  return {
    pv_sizes_kwp: pv.length > 0 ? pv : fallback.pv_sizes_kwp,
    battery_sizes_kwh: clean(s.battery_sizes_kwh ?? [], SIZE_LIMITS.battery),
  };
}
