import type { ClimateZone, Emitter, HouseModel, HouseSettings, Insulation } from "./api/types";
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

const EMITTER_WORD: Record<Emitter, string> = { floor: "pavimento", fancoil: "fancoil", radiators: "radiatori" };

/** "fancoil e pavimento", from the zones the estimate counts (those with an area). */
export function emittersPhrase(h: HouseSettings): string {
  const sized = h.zones.filter((z) => z.area_m2);
  return [...new Set((sized.length ? sized : h.zones).map((z) => EMITTER_WORD[z.emitter]))].join(" e ");
}

/** "Zona C · 88 m² · isolamento medio · fancoil e pavimento · SCOP 4,2" */
export function houseSummary(h: HouseSettings, model: HouseModel, f: Formatters, opts: { area?: number | null; heating?: boolean } = {}): string {
  const area = opts.area !== undefined ? opts.area : model.heated_area_m2;
  return [
    `Zona ${h.climate_zone}`,
    area !== null ? `${f.num(area, 0)} m²` : "superficie da inserire",
    `isolamento ${INSULATION_WORD[h.insulation]}`,
    ...(opts.heating === false ? [`SEER ${f.num(model.seer)}`] : [emittersPhrase(h), `SCOP ${f.num(model.scop)}`]),
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