import type { LoadDef, LoadDetected, UsualTime } from "./api/types";

/** What the calculation uses: the sensor's measured cycles, or the estimate until a sensor is picked. */
export function effectiveUsage(load: LoadDef, detected: LoadDetected[]) {
  const det = load.source === "sensor" ? detected.find((d) => d.entity_id === load.sensor_entity_id) : undefined;
  return det
    ? { measured: det, perWeek: (det.cycles_per_year * 7) / 365, kwh: det.kwh_per_cycle, hours: Math.max(1, Math.round(det.duration_h)) }
    : { measured: undefined, perWeek: load.cycles_per_week, kwh: load.kwh_per_cycle, hours: load.duration_h };
}

/** Start-hour bands; together they cover the whole day. */
export const USUAL_TIME_RANGE: Record<UsualTime, [number, number]> = {
  any: [0, 24],
  night: [0, 6],
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 24],
};

export const USUAL_TIME_LABEL: Record<UsualTime, string> = {
  any: "A qualsiasi ora",
  night: "Di notte (0–6)",
  morning: "Di mattina (6–12)",
  afternoon: "Di pomeriggio (12–18)",
  evening: "Di sera (18–24)",
};

const BAND_PHRASE: Record<UsualTime, string> = {
  any: "a orari vari",
  night: "di solito parte di notte",
  morning: "di solito parte la mattina",
  afternoon: "di solito parte il pomeriggio",
  evening: "di solito parte la sera",
};

/** The band holding at least 60% of the starts, or "any". */
export function usualBand(histogram: number[]): UsualTime {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total <= 0) return "any";
  for (const band of ["night", "morning", "afternoon", "evening"] as const) {
    const [from, to] = USUAL_TIME_RANGE[band];
    const n = histogram.slice(from, to).reduce((a, b) => a + b, 0);
    if (n / total >= 0.6) return band;
  }
  return "any";
}

export const usualPhrase = (histogram: number[]) => BAND_PHRASE[usualBand(histogram)];

/** True if `id` waiting for `candidate` would close a loop of "deve aspettare". */
export function createsLoop(loads: Pick<LoadDef, "id" | "after">[], id: string, candidate: string): boolean {
  const seen = new Set<string>();
  for (let cur: string | null = candidate; cur; cur = loads.find((l) => l.id === cur)?.after ?? null) {
    if (cur === id) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
  }
  return false;
}
