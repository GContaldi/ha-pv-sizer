import { css, html, nothing, type TemplateResult } from "lit";
import type { ClimateZone, Emitter, Insulation, PanelConfig, ScenarioSizes, SeasonalProfile, Settings } from "../api/types";
import { SEASONAL_LABEL, formatDate, joinMonths, statusSentence } from "../consumption";
import { numberField, selectField } from "../fields";
import { MONTHS, parseNumber, type Formatters } from "../format";
import { EMITTER_LABEL, INSULATION_HINT, INSULATION_LABEL, ZONE_LABEL } from "../house";
import { continuousUsage, usageContext } from "../loads";
import { SIZE_LIMITS, normalizeSizes } from "../scenario-sizes";
import "./loads-list";

export type SizeKind = "pv" | "battery";

export interface SectionContext {
  config: PanelConfig;
  locale: string;
  f: Formatters;
  emit: (settings: Settings) => void;
  /** Size whose "+ Aggiungi" input is open; setAdding focuses it. */
  sizes: { adding: SizeKind | null; setAdding: (kind: SizeKind | null) => void };
}

type Group = "tariff" | "system" | "lifetime" | "consumption" | "house";

function setter<G extends Group>(ctx: SectionContext, group: G) {
  return <K extends keyof Settings[G]>(k: K) =>
    (v: Settings[G][K]) =>
      ctx.emit({ ...ctx.config.settings, [group]: { ...ctx.config.settings[group], [k]: v } } as Settings);
}

const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k] }));

function cardHead(title: string | null, hint?: string) {
  return html`<div class="card-head">
    ${title ? html`<h3>${title}</h3>` : nothing}
    ${hint ? html`<span class="small muted">${hint}</span>` : nothing}
  </div>`;
}

function renderHouse(ctx: SectionContext) {
  const h = ctx.config.settings.house;
  const set = setter(ctx, "house");
  return html`<div class="card">
    ${cardHead("La casa", "Serve a stimare la pompa di calore e i climatizzatori dei carichi.")}
    ${selectField("Zona climatica", h.climate_zone, options(ZONE_LABEL), (v) => set("climate_zone")(v as ClimateZone), "La trovi sull'APE o nella tabella del tuo comune", true)}
    ${numberField("Superficie riscaldata", h.heated_area_m2, "m²", ctx.locale, set("heated_area_m2"), {
      min: 20,
      max: 2000,
      integer: true,
      placeholder: "Da inserire",
      onClear: () => set("heated_area_m2")(null),
      hint: "Le stanze che scaldi con la pompa di calore",
    })}
    ${selectField("Isolamento", h.insulation, options(INSULATION_LABEL), (v) => set("insulation")(v as Insulation), INSULATION_HINT[h.insulation], true)}
    ${selectField("Impianto", h.emitter, options(EMITTER_LABEL), (v) => set("emitter")(v as Emitter), "Con il pavimento radiante la pompa di calore consuma meno", true)}
  </div>`;
}

function renderData(ctx: SectionContext) {
  const { f, locale: loc } = ctx;
  const d = ctx.config.data;
  const c = ctx.config.settings.consumption;
  const set = setter(ctx, "consumption");
  const measured = d.source === "measured";
  const meterHint =
    d.days > 0 && d.from && d.to
      ? `Storico dal ${formatDate(d.from, loc)} al ${formatDate(d.to, loc)} · ${d.pattern_source === "sensor" ? "orari presi da qui" : "orari tipici finché non ci sono 14 giorni"}`
      : c.meter_entity_id
        ? "Ancora nessun dato registrato"
        : "Va bene il prelievo dalla rete della dashboard Energia";
  const maxKwh = Math.max(1, ...d.months.map((m) => m.kwh));
  const monthTitle = (m: { kwh: number; measured_share: number }, i: number) => {
    const how = m.measured_share >= 0.99 ? "misurati" : m.measured_share > 0 ? `${f.pct(m.measured_share)} misurato, il resto stimato` : "stimati";
    return `${MONTHS[i]}: ${f.kwh(m.kwh)}, ${how}`;
  };
  return html`<div class="card" id="dati">
    <div class="card-head">
      <h3>Dati di consumo</h3>
      <span class="muted" role="status">${statusSentence(d, c.annual_kwh !== null, f)}</span>
    </div>
    ${selectField(
      "Misuratore di tutta la casa",
      c.meter_entity_id ?? "",
      [{ value: "", label: "Nessuno" }, ...ctx.config.meter_options.map((o) => ({ value: o.entity_id, label: o.name }))],
      (v) => set("meter_entity_id")(v || null),
      meterHint,
      true,
    )}
    ${numberField(measured ? "Consumo annuo, per confronto" : "Consumo annuo", c.annual_kwh, "kWh/anno", loc, set("annual_kwh"), {
      min: 100,
      max: 100000,
      integer: true,
      placeholder: "Dalla bolletta",
      onClear: () => set("annual_kwh")(null),
      hint: measured
        ? "Con 12 mesi misurati il calcolo usa lo storico"
        : d.source === "mixed"
          ? "Se lo lasci vuoto, proietto i giorni misurati sull'anno"
          : "La somma dei 12 mesi in bolletta",
    })}
    ${selectField(
      "Andamento nell'anno",
      c.seasonal_profile,
      options(SEASONAL_LABEL),
      (v) => set("seasonal_profile")(v as SeasonalProfile),
      measured ? "Non serve: tutti i mesi sono misurati" : "Come si distribuisce il consumo nei mesi non misurati",
      true,
    )}
    ${d.warning === "measured_exceeds_annual"
      ? html`<div class="banner small" role="status">
          I giorni misurati superano già il consumo annuo inserito. Controlla il valore, oppure svuota il campo per proiettare lo storico.
        </div>`
      : nothing}
    ${d.source === "missing"
      ? nothing
      : html`<div class="strip-wrap">
          <div class="strip" role="img" aria-label=${d.months.map(monthTitle).join("; ")}>
            ${d.months.map(
              (m, i) => html`<div class="month" title=${monthTitle(m, i)}>
                <div class="bar" style="height:${Math.max(4, (m.kwh / maxKwh) * 100)}%">
                  <span class="est" style="flex-grow:${1 - m.measured_share}"></span>
                  <span class="meas" style="flex-grow:${m.measured_share}"></span>
                </div>
                <span class="small muted">${MONTHS[i][0]}</span>
              </div>`,
            )}
          </div>
          <div class="legend small muted">
            <span><i class="meas"></i>Misurato</span>
            <span><i class="est"></i>Stimato</span>
          </div>
        </div>`}
    <span class="small muted">Produzione stimata per ${ctx.config.location.name}.</span>
  </div>`;
}

function renderLoads(ctx: SectionContext) {
  const d = ctx.config.data;
  return html`<div class="card">
    ${cardHead(
      null,
      "Gli elettrodomestici che potresti far partire in un altro orario, e quelli che consumano ogni giorno come pompa di calore e clima. Quanto vale spostarli lo trovi in Scenari.",
    )}
    ${d.loads_exceed_months.length
      ? html`<div class="banner small" role="status">
          I carichi superano il consumo di ${joinMonths(d.loads_exceed_months)}: il calcolo li riduce a quanto consuma la casa in quei mesi.
          Controlla i carichi continui o il consumo annuo.
        </div>`
      : nothing}
    <pv-loads-list .config=${ctx.config} .locale=${ctx.locale}></pv-loads-list>
  </div>`;
}

function renderTariff(ctx: SectionContext) {
  const t = ctx.config.settings.tariff;
  const set = setter(ctx, "tariff");
  const loc = ctx.locale;
  return html`<div class="card">
    ${numberField("Energia (vendita + rete)", t.energy_price, "€/kWh", loc, set("energy_price"), {
      hint: "Materia energia + trasporto, la parte in €/kWh della bolletta",
    })}
    ${numberField("Accise", t.excise, "€/kWh", loc, set("excise"))}
    ${numberField("IVA", t.vat_pct, "%", loc, set("vat_pct"))}
    ${numberField("Quota fissa", t.fixed_monthly, "€/mese", loc, set("fixed_monthly"))}
    ${numberField("Quota potenza", t.power_fee, "€/kW/mese", loc, set("power_fee"))}
    ${numberField("Potenza contatore", t.power_kw, "kW", loc, set("power_kw"))}
    ${numberField("Ritiro dedicato", t.export_price, "€/kWh", loc, set("export_price"), { hint: "Quanto ti paga il GSE per ogni kWh immesso" })}
    <p class="small muted note">Costi fissi uguali in tutti gli scenari: il FV riduce solo la parte in €/kWh.</p>
  </div>`;
}

function renderCosts(ctx: SectionContext) {
  const { system: s, lifetime: l } = ctx.config.settings;
  const sys = setter(ctx, "system");
  const life = setter(ctx, "lifetime");
  const loc = ctx.locale;
  return html`
    <div class="card">
      ${cardHead("Impianto e batteria")}
      ${numberField("Costo FV chiavi in mano", s.cost_per_kwp, "€/kWp", loc, sys("cost_per_kwp"))}
      ${numberField("Costo batteria", s.cost_per_kwh, "€/kWh", loc, sys("cost_per_kwh"))}
      ${selectField(
        "Detrazione fiscale",
        String(s.deduction_pct),
        [
          { value: "0", label: "Nessuna" },
          { value: "36", label: "36% in 10 anni" },
          { value: "50", label: "50% in 10 anni" },
        ],
        (v) => sys("deduction_pct")(Number(v)),
        "Verifica l'aliquota in vigore quando compri",
      )}
      ${numberField("Potenza batteria", s.battery_power_kw, "kW", loc, sys("battery_power_kw"), { hint: "Quanto velocemente carica e scarica" })}
      ${numberField("Capacità utilizzabile", s.usable_pct, "%", loc, sys("usable_pct"))}
      ${numberField("Efficienza carica/scarica", s.efficiency_pct, "%", loc, sys("efficiency_pct"))}
      ${numberField("Limite immissione in rete", s.export_limit_kw, "kW", loc, sys("export_limit_kw"), {
        hint: "Oltre questa potenza il FV in eccesso va perso",
      })}
    </div>
    <div class="card">
      ${cardHead("Nel tempo")}
      ${numberField("Calo resa pannelli", l.degradation_pct, "%/anno", loc, life("degradation_pct"))}
      ${numberField("Aumento prezzo energia", l.price_increase_pct, "%/anno", loc, life("price_increase_pct"))}
      ${numberField("Vita batteria", l.battery_life_years, "anni", loc, life("battery_life_years"), { hint: "Poi va ricomprata, allo stesso prezzo di oggi" })}
      ${numberField("Costo inverter nuovo", l.inverter_cost, "€", loc, life("inverter_cost"))}
      ${numberField("Cambio inverter dopo", l.inverter_year, "anni", loc, life("inverter_year"))}
    </div>
  `;
}

function sizeEditor(ctx: SectionContext, kind: SizeKind) {
  const { f } = ctx;
  const sizes = ctx.config.settings.scenarios;
  const key = kind === "pv" ? "pv_sizes_kwp" : "battery_sizes_kwh";
  const unit = kind === "pv" ? "kWp" : "kWh";
  const values = sizes[key];
  const lim = SIZE_LIMITS[kind];
  const full = values.length >= lim.maxCount;
  const canRemove = kind === "battery" || values.length > 1;
  const setSizes = (next: ScenarioSizes) => ctx.emit({ ...ctx.config.settings, scenarios: normalizeSizes(next, sizes) });
  const commit = (input: HTMLInputElement) => {
    const v = parseNumber(input.value);
    ctx.sizes.setAdding(null);
    if (v === null || v < lim.min || v > lim.max) return;
    setSizes({ ...sizes, [key]: [...values, v] });
  };
  return html`<div class="stack">
    <span class="strong">${kind === "pv" ? "Fotovoltaico" : "Batteria"}</span>
    <div class="chips">
      ${kind === "battery" ? html`<span class="chip fixed">Nessuna</span>` : nothing}
      ${values.map(
        (v) => html`<span class="chip">
          ${f.num(v)} ${unit}
          ${canRemove
            ? html`<button aria-label="Togli ${f.num(v)} ${unit}" @click=${() => setSizes({ ...sizes, [key]: values.filter((x) => x !== v) })}>×</button>`
            : nothing}
        </span>`,
      )}
      ${full
        ? nothing
        : ctx.sizes.adding === kind
          ? html`<input
              type="text"
              inputmode="decimal"
              placeholder=${unit}
              aria-label="Nuova taglia in ${unit}"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") commit(e.target as HTMLInputElement);
                if (e.key === "Escape") ctx.sizes.setAdding(null);
              }}
              @blur=${(e: FocusEvent) => commit(e.target as HTMLInputElement)}
            />`
          : html`<button class="chip add" @click=${() => ctx.sizes.setAdding(kind)}>+ Aggiungi</button>`}
    </div>
    <span class="small muted">Da ${f.num(lim.min)} a ${f.num(lim.max)} ${unit}, al massimo ${lim.maxCount} taglie${full ? " (raggiunto)" : ""}.</span>
  </div>`;
}

function renderSizes(ctx: SectionContext) {
  return html`<div class="card">
    ${cardHead(null, "Sono le righe e le colonne della tabella in Scenari. Ogni taglia in più allunga un po' il calcolo.")}
    <div class="sizes">${sizeEditor(ctx, "pv")} ${sizeEditor(ctx, "battery")}</div>
  </div>`;
}

function renderNotes() {
  return html`<div class="card">
    <ul class="notes">
      <li>Simula ogni ora di un anno tipo: consumi, produzione FV, batteria, rete.</li>
      <li>
        I consumi vengono dal misuratore per i giorni registrati; il resto dell'anno è stimato dal consumo annuo con l'andamento scelto. Con un
        anno intero di storico conta solo lo storico. Gli orari della giornata vengono dal misuratore quando ha almeno 14 giorni.
      </li>
      <li>
        I carichi continui (pompa di calore, clima, VMC) consumano ogni giorno dei loro mesi e fanno parte del totale della casa. Se sono
        anticipabili, una parte del consumo si sposta fino a qualche ora prima, nelle ore di sole (preriscaldo o preraffresco).
      </li>
      <li>
        Pompa di calore e climatizzatori "dalla casa": il calore che serve viene dai gradi giorno tipici della zona climatica, dal periodo di
        accensione previsto per legge e dall'isolamento; i kWh elettrici sono quel calore diviso per il rendimento stagionale (SCOP, più alto
        con il pavimento radiante; SEER in estate).
      </li>
      <li>La batteria si carica solo dal FV, mai dalla rete.</li>
      <li>Lo spostamento mette i carichi nelle ore di sole della stessa giornata, senza considerare la batteria.</li>
      <li>Niente incentivi delle comunità energetiche (CER).</li>
    </ul>
  </div>`;
}

const SOURCE_WORD = { measured: "misurati", mixed: "in parte misurati", estimate: "stimati", missing: "" } as const;

const exceedWarning = (months: number[]) =>
  `I carichi superano il consumo ${months.length <= 2 ? `di ${joinMonths(months)}` : `in ${months.length} mesi`}`;

const range = (f: Formatters, values: number[], unit: string) =>
  values.length === 1 ? `${f.num(values[0])} ${unit}` : `da ${f.num(Math.min(...values))} a ${f.num(Math.max(...values))} ${unit}`;

export interface Section {
  title: string;
  summary: (ctx: SectionContext) => string;
  warnings: (ctx: SectionContext) => string[];
  render: (ctx: SectionContext) => TemplateResult;
}

export const SECTIONS = {
  casa: {
    title: "Casa e consumi",
    summary: ({ config: c, f }) => {
      const h = c.settings.house;
      const d = c.data;
      return [
        `Zona ${h.climate_zone}`,
        ...(h.heated_area_m2 !== null ? [`${f.num(h.heated_area_m2, 0)} m²`] : []),
        ...(d.source !== "missing" ? [`${f.num(d.annual_kwh, 0)} kWh l'anno, ${SOURCE_WORD[d.source]}`] : []),
      ].join(" · ");
    },
    warnings: ({ config: c }) => {
      const ctx = usageContext(c);
      return [
        ...(c.data.source === "missing" ? ["Mancano i consumi"] : []),
        ...(c.data.warning === "measured_exceeds_annual" ? ["Consumo annuo da controllare"] : []),
        ...(c.loads.some((l) => l.kind === "continuous" && continuousUsage(l, ctx).needsArea) ? ["Manca la superficie"] : []),
      ];
    },
    render: (ctx) => html`${renderHouse(ctx)} ${renderData(ctx)}`,
  },
  carichi: {
    title: "Carichi",
    summary: ({ config: c }) => {
      const n = c.loads.length;
      if (!n) return "Nessun carico";
      const k = c.loads.filter((l) => l.shiftable).length;
      return `${n} ${n === 1 ? "carico" : "carichi"}, ${k} ${k === 1 ? "spostabile" : "spostabili"}`;
    },
    warnings: ({ config: c }) => [
      ...(c.loads.some((l) => l.source === "sensor" && !l.sensor_entity_id) ? ["Sensore da scegliere"] : []),
      ...(c.data.loads_exceed_months.length ? [exceedWarning(c.data.loads_exceed_months)] : []),
    ],
    render: renderLoads,
  },
  bolletta: {
    title: "Bolletta",
    summary: ({ config: c, f }) =>
      `€ ${f.num(c.derived.grid_price_eur_kwh, 3)}/kWh prelevato · ritiro € ${f.num(c.settings.tariff.export_price, 3)} · fissi ${f.eur(c.derived.fixed_annual_eur)}/anno`,
    warnings: () => [],
    render: renderTariff,
  },
  impianto: {
    title: "Impianto e costi",
    summary: ({ config: c, f }) => {
      const s = c.settings.system;
      return `FV ${f.eur(s.cost_per_kwp)}/kWp · batteria ${f.eur(s.cost_per_kwh)}/kWh · detrazione ${s.deduction_pct}%`;
    },
    warnings: () => [],
    render: renderCosts,
  },
  taglie: {
    title: "Taglie da confrontare",
    summary: ({ config: c, f }) => {
      const { pv_sizes_kwp: pv, battery_sizes_kwh: bat } = c.settings.scenarios;
      const battery = bat.length ? `batteria fino a ${f.num(Math.max(...bat))} kWh (${bat.length})` : "senza batteria";
      return `FV ${range(f, pv, "kWp")} (${pv.length}) · ${battery}`;
    },
    warnings: () => [],
    render: renderSizes,
  },
  calcolo: {
    title: "Come funziona il calcolo",
    summary: () => "Ipotesi e limiti del modello",
    warnings: () => [],
    render: renderNotes,
  },
} satisfies Record<string, Section>;

export type SectionId = keyof typeof SECTIONS;

export const SECTION_GROUPS: { title: string; ids: SectionId[] }[] = [
  { title: "La casa", ids: ["casa", "carichi"] },
  { title: "Costi", ids: ["bolletta", "impianto"] },
  { title: "Confronto", ids: ["taglie", "calcolo"] },
];

/** `dati` is the old name of `casa`; anything unknown opens the index. */
export function sectionId(section: string | undefined): SectionId | undefined {
  if (section === "dati") return "casa";
  return section && section in SECTIONS ? (section as SectionId) : undefined;
}

export const sectionStyles = css`
  .card-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
  }
  .card-head h3 {
    font-size: 16px;
  }
  .card .banner {
    margin: 8px 0;
  }
  .note {
    margin-top: 8px;
  }
  .sizes {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 40px;
    padding: 0 4px 0 14px;
    border-radius: 999px;
    border: 1px solid var(--divider-color);
    background: var(--secondary-background-color);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
  }
  .chip.fixed {
    padding-right: 14px;
    color: var(--secondary-text-color);
  }
  .chip button {
    position: relative;
    font: inherit;
    font-size: 18px;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--secondary-text-color);
    cursor: pointer;
  }
  .chip button::after {
    content: "";
    position: absolute;
    inset: -6px;
  }
  .chip button:hover {
    background: var(--divider-color);
  }
  .chip button:focus-visible,
  button.chip.add:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }
  button.chip.add {
    padding: 0 14px;
    border-style: dashed;
    background: transparent;
    color: var(--primary-color);
    font: inherit;
    cursor: pointer;
  }
  .chips input {
    width: 96px;
    height: 40px;
    border-radius: 999px;
    text-align: center;
  }
  ul.notes {
    margin: 0;
    padding-left: 18px;
    color: var(--secondary-text-color);
  }
  ul.notes li + li {
    margin-top: 8px;
  }
  .strip-wrap {
    margin: 12px 0 8px;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 6px;
    height: 96px;
  }
  .month {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-height: 0;
  }
  .bar {
    width: 100%;
    max-width: 32px;
    display: flex;
    flex-direction: column;
    border-radius: 4px 4px 0 0;
    overflow: hidden;
  }
  .meas,
  .legend i.meas {
    background: var(--primary-color);
  }
  .est,
  .legend i.est {
    background: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 55%, transparent) 0 2px,
      color-mix(in srgb, var(--primary-color) 12%, transparent) 2px 6px
    );
  }
  .bar span {
    flex-basis: 0;
  }
  .legend {
    display: flex;
    gap: 16px;
    margin-top: 8px;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }
`;
