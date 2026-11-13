import type { ClimateZone, ContinuousLoad, Emitter, HouseSettings, Insulation } from "./api/types";
import { MONTH_NAMES } from "./consumption";
import type { Formatters } from "./format";

export const ZONE_LABEL: Record<ClimateZone, string> = {
  A: "A · molto calda",
  B: "B · calda",
  C: "C · mite",
  D: "D · temperata",
  E: "E · fredda",
  F: "F · molto fredda",
};

export const INSULATION_LABEL: Record<Insulation, string> = {
  good: "Buono · casa nuova",
  medium: "Medio · anni '90",
  poor: "Scarso · non isolata",
};

export const INSULATION_HINT: Record<Insulation, string> = {
  good: "Nuova o ristrutturata: cappotto, infissi doppi o tripli",
  medium: "Anni '90–2000: isolata in parte, infissi doppi non recenti",
  poor: "Muri senza isolante, infissi vecchi o a vetro singolo",
};

const INSULATION_WORD: Record<Insulation, string> = { good: "buono", medium: "medio", poor: "scarso" };

export const EMITTER_LABEL: Record<Emitter, string> = {
  floor: "Pavimento radiante",
  fancoil: "Fancoil",
  radiators: "Radiatori",
};

/** "Zona C · 100 m² · isolamento medio · fancoil" */
export function houseSummary(h: HouseSettings, f: Formatters, opts: { area?: number | null; emitter?: boolean } = {}): string {
  const area = opts.area !== undefined ? opts.area : h.heated_area_m2;
  return [
    `Zona ${h.climate_zone}`,
    area !== null ? `${f.num(area, 0)} m²` : "superficie da inserire",
    `isolamento ${INSULATION_WORD[h.insulation]}`,
    ...(opts.emitter === false ? [] : [EMITTER_LABEL[h.emitter].toLowerCase()]),
  ].join(" · ");
}

const perDay = (f: Formatters, v: number) => f.num(v, v < 10 ? 1 : 0);
/** "a gennaio", "ad aprile". */
const inMonth = (m: number) => `${MONTH_NAMES[m - 1].startsWith("a") ? "ad" : "a"} ${MONTH_NAMES[m - 1]}`;

/** "circa 1480 kWh l'anno, da 3,9 kWh/giorno a novembre a 13 a gennaio" */
export function houseUsagePhrase(f: Formatters, use: { kwhByMonth: number[]; months: number[]; yearKwh: number }): string {
  const active = use.months.map((m) => ({ m, v: use.kwhByMonth[m - 1] }));
  if (!active.length) return "nessun consumo";
  const lo = active.reduce((a, b) => (b.v < a.v ? b : a));
  const hi = active.reduce((a, b) => (b.v > a.v ? b : a));
  const range =
    hi.v - lo.v < 0.5
      ? `circa ${perDay(f, hi.v)} kWh/giorno`
      : `da ${perDay(f, lo.v)} kWh/giorno ${inMonth(lo.m)} a ${perDay(f, hi.v)} ${inMonth(hi.m)}`;
  return `circa ${f.kwh(roughKwh(use.yearKwh))} l'anno, ${range}`;
}

/** Model estimates are not precise to the unit: 1479 → 1480. */
export const roughKwh = (v: number) => (v >= 100 ? Math.round(v / 10) * 10 : Math.round(v));

/** Area the load is computed on: its own, or the whole heated area. */
export const servedArea = (load: ContinuousLoad, h: HouseSettings) => load.area_m2 ?? h.heated_area_m2;
