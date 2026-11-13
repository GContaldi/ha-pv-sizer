import type { ContinuousLoad, CycleLoad, HourProfile, HouseModel, HouseSettings, LoadDef, LoadDetected, PanelConfig, UsualTime } from "./api/types";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function sensorStats(load: LoadDef, detected: LoadDetected[]) {
  return load.source === "sensor" ? detected.find((d) => d.entity_id === load.sensor_entity_id) : undefined;
}

/** What the calculation uses: the sensor's measured cycles, or the estimate until a sensor with cycles is picked. */
export function effectiveUsage(load: CycleLoad, detected: LoadDetected[]) {
  const det = sensorStats(load, detected);
  return det && det.cycles_per_year > 0
    ? { measured: det, perWeek: (det.cycles_per_year * 7) / 365, kwh: det.kwh_per_cycle, hours: Math.max(1, Math.round(det.duration_h)) }
    : { measured: undefined, perWeek: load.cycles_per_week, kwh: load.kwh_per_cycle, hours: load.duration_h };
}

export interface UsageContext {
  detected: LoadDetected[];
  house: HouseSettings;
  model: HouseModel;
}

export const usageContext = (c: PanelConfig): UsageContext => ({ detected: c.detected, house: c.settings.house, model: c.derived.house });

/**
 * Same for continuous loads: kWh/day for each month (0 = off), from the sensor, the house model
 * (thermal kWh × m² ÷ efficiency) or the manual estimate.
 */
export function continuousUsage(load: ContinuousLoad, ctx: UsageContext) {
  const measured = sensorStats(load, ctx.detected)?.continuous;
  const wantsHouse = !measured && load.basis === "house" && load.use !== null;
  const area = load.area_m2 ?? ctx.house.heated_area_m2;
  const fromHouse = wantsHouse && area !== null && area > 0;
  let kwhByMonth: number[];
  if (measured) kwhByMonth = measured.kwh_per_day_by_month;
  else if (fromHouse) {
    const heating = load.use === "heating";
    const thermal = heating ? ctx.model.heating_kwh_th_m2 : ctx.model.cooling_kwh_th_m2;
    const eff = heating ? ctx.model.scop : ctx.model.seer;
    kwhByMonth = thermal.map((v, m) => (v * area!) / eff / DAYS_IN_MONTH[m]);
  } else kwhByMonth = DAYS_IN_MONTH.map((_, m) => (load.months.includes(m + 1) ? load.kwh_per_day : 0));
  const active = kwhByMonth.map((v, m) => (v > 0.005 ? m + 1 : 0)).filter((m) => m > 0);
  const activeDays = active.reduce((a, m) => a + DAYS_IN_MONTH[m - 1], 0);
  const yearKwh = kwhByMonth.reduce((a, v, m) => a + v * DAYS_IN_MONTH[m], 0);
  return {
    measured,
    fromHouse,
    /** Wants the house model but the house has no heated area yet. */
    needsArea: wantsHouse && !fromHouse,
    kwhByMonth,
    months: active,
    perDay: activeDays ? yearKwh / activeDays : 0,
    yearKwh,
  };
}

export const HOUR_PROFILE_LABEL: Record<HourProfile, string> = {
  flat: "Tutto il giorno",
  heating: "Mattina e sera",
  cooling: "Pomeriggio",
};

/** "nov–mar, giu–set", or "tutto l'anno". */
export function monthsLabel(months: number[]): string {
  const set = new Set(months);
  if (set.size === 0) return "nessun mese";
  if (set.size === 12) return "tutto l'anno";
  const prev = (m: number) => ((m + 10) % 12) + 1;
  const next = (m: number) => (m % 12) + 1;
  const runs: string[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(prev(m))) continue;
    let end = m;
    while (set.has(next(end))) end = next(end);
    runs.push(end === m ? MONTH_SHORT[m - 1] : `${MONTH_SHORT[m - 1]}–${MONTH_SHORT[end - 1]}`);
  }
  return runs.join(", ");
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
export function createsLoop(loads: LoadDef[], id: string, candidate: string): boolean {
  const afterOf = (loadId: string) => {
    const l = loads.find((x) => x.id === loadId);
    return l?.kind === "cycle" ? l.after : null;
  };
  const seen = new Set<string>();
  for (let cur: string | null = candidate; cur; cur = afterOf(cur)) {
    if (cur === id) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
  }
  return false;
}
