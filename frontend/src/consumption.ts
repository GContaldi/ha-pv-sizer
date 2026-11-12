import type { DataInfo, SeasonalProfile } from "./api/types";
import type { Formatters } from "./format";

export const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const SEASONAL_LABEL: Record<SeasonalProfile, string> = {
  pdc_heating: "PDC per scaldare",
  pdc_heating_cooling: "PDC per scaldare e raffrescare",
  no_pdc: "Senza PDC",
};

export const formatDate = (iso: string, locale: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" });

/** "47 giorni" under four weeks, then "1,5 mesi" in half months. */
export function coveragePhrase(data: DataInfo, f: Formatters): string {
  if (data.days < 28) return `${data.days} ${data.days === 1 ? "giorno" : "giorni"}`;
  const months = Math.round((data.days / 30.44) * 2) / 2;
  return `${f.num(months)} ${months === 1 ? "mese" : "mesi"}`;
}

/** One line on where the consumption comes from, for Scenari. */
export function sourceLine(data: DataInfo, f: Formatters): string {
  if (data.source === "estimate") return "Consumi stimati dal consumo annuo, nessun mese misurato";
  if (data.source === "mixed") return `Consumi: ${coveragePhrase(data, f)} misurati${data.days < 28 ? "" : " su 12"}, il resto stimato`;
  return "";
}

/** Status sentence for the "Dati di consumo" card. */
export function statusSentence(data: DataInfo, hasAnnual: boolean, f: Formatters): string {
  switch (data.source) {
    case "missing":
      return "Mancano i consumi: scegli il misuratore o scrivi il consumo annuo della bolletta.";
    case "estimate":
      return `Stima: ${f.kwh(data.annual_kwh)} l'anno, ripartiti mese per mese con l'andamento scelto.`;
    case "mixed":
      if (data.warning === "measured_exceeds_annual") return `${coveragePhrase(data, f)} misurati: ${f.kwh(data.annual_kwh)}, già più del consumo annuo inserito.`;
      return `${coveragePhrase(data, f)} misurati, il resto ${hasAnnual ? "stimato dal consumo annuo" : "proiettato dallo storico"}: ${f.kwh(data.annual_kwh)} l'anno.`;
    case "measured":
      return `Un anno intero misurato: ${f.kwh(data.annual_kwh)}. Il calcolo usa solo lo storico.`;
  }
}

export const joinMonths = (months: number[]) => {
  const names = months.map((m) => MONTH_NAMES[m]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : (names[0] ?? "");
};
