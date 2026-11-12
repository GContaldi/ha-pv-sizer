export const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export interface Formatters {
  eur(v: number): string;
  eur2(v: number): string;
  eur3(v: number): string;
  pct(v: number): string;
  kwh(v: number): string;
  years(v: number | null): string;
  num(v: number, digits?: number): string;
  hour(h: number): string;
  kwp(v: number): string;
}

export function formatters(locale: string, horizonYears = 25): Formatters {
  const n0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n3 = new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return {
    eur: (v) => `${v < -0.5 ? "−" : ""}€ ${n0.format(Math.abs(Math.round(v)))}`,
    eur2: (v) => `€ ${n2.format(v)}`,
    eur3: (v) => `€ ${n3.format(v)}`,
    pct: (v) => `${n0.format(Math.round(v * 100))}%`,
    kwh: (v) => `${n0.format(Math.round(v))} kWh`,
    years: (v) => (v === null ? `oltre ${horizonYears} anni` : `${n1.format(v)} anni`),
    num: (v, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v),
    hour: (h) => `${String(h).padStart(2, "0")}:00`,
    kwp: (v) => n1.format(v),
  };
}

export function scenarioName(f: Formatters, pvKwp: number, batteryKwh: number): string {
  if (pvKwp === 0) return "Senza FV (oggi)";
  return `FV ${f.kwp(pvKwp)} kWp ${batteryKwh > 0 ? `+ batteria ${batteryKwh} kWh` : "senza batteria"}`;
}

export function parseNumber(text: string): number | null {
  const v = parseFloat(text.trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
