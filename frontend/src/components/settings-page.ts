import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import type { ConsumptionSettings, Lifetime, PanelConfig, ScenarioSizes, SeasonalProfile, Settings, SystemCosts, Tariff } from "../api/types";
import { SEASONAL_LABEL, formatDate, joinMonths, statusSentence } from "../consumption";
import { numberField, selectField } from "../fields";
import { MONTHS, formatters, parseNumber, type Formatters } from "../format";
import { SIZE_LIMITS, normalizeSizes } from "../scenario-sizes";
import { shared } from "../styles";
import "./loads-list";

type SizeKind = "pv" | "battery";

export class PvSettingsPage extends LitElement {
  static properties = {
    config: { attribute: false },
    locale: { type: String },
    section: { type: String },
    busy: { type: Boolean },
    addingSize: { state: true },
    savedIn: { state: true },
  };
  declare config: PanelConfig;
  declare locale: string;
  declare section?: string;
  declare busy: boolean;
  declare addingSize: SizeKind | null;
  /** Section whose last edit is being saved, for the "Salvato" status. */
  declare savedIn?: string;
  private savedTimer?: number;

  constructor() {
    super();
    this.busy = false;
    this.addingSize = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.savedTimer);
  }

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
      }
      .card {
        scroll-margin-top: 16px;
      }
      .card-head {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 8px;
      }
      .card-head h3 {
        font-size: 16px;
      }
      details.card {
        padding: 0;
      }
      details.card > summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 8px 16px;
        box-sizing: border-box;
      }
      details.card > summary::-webkit-details-marker {
        display: none;
      }
      details.card > summary::after {
        content: "";
        width: 24px;
        height: 24px;
        flex: none;
        background: var(--secondary-text-color);
        -webkit-mask: var(--chevron) center / 24px no-repeat;
        mask: var(--chevron) center / 24px no-repeat;
        transition: transform 0.15s;
      }
      details.card[open] > summary::after {
        transform: rotate(180deg);
      }
      :host {
        --chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z'/%3E%3C/svg%3E");
      }
      .card-head .row {
        flex-wrap: nowrap;
      }
      .saved {
        flex: none;
        font-size: 12px;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      details.card > summary:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
        border-radius: var(--ha-card-border-radius, 12px);
      }
      .summary-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .summary-text .muted {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .details-body {
        padding: 0 16px 12px;
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
        margin-top: 4px;
      }
      #dati .banner,
      #carichi .banner {
        margin: 8px 0;
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
    `,
  ];

  protected updated(changed: PropertyValues<this>) {
    if (changed.has("busy") && !this.busy && this.savedIn) {
      clearTimeout(this.savedTimer);
      this.savedTimer = window.setTimeout(() => (this.savedIn = undefined), 2500);
    }
    if (!changed.has("section") || !this.section) return;
    const target = this.renderRoot.querySelector<HTMLElement>(`#${this.section}`);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private markSaved(section: string) {
    clearTimeout(this.savedTimer);
    this.savedIn = section;
  }

  private savedBadge(section: string) {
    if (this.savedIn !== section) return nothing;
    return html`<span class="saved" role="status">${this.busy ? "Salvato · ricalcolo…" : "Salvato"}</span>`;
  }

  private emit(settings: Settings, section: string) {
    this.markSaved(section);
    this.dispatchEvent(new CustomEvent<Settings>("settings-change", { detail: settings, bubbles: true, composed: true }));
  }

  private tariff<K extends keyof Tariff>(k: K) {
    return (v: number) => this.emit({ ...this.config.settings, tariff: { ...this.config.settings.tariff, [k]: v } }, "bolletta");
  }

  private system<K extends keyof SystemCosts>(k: K) {
    return (v: number) => this.emit({ ...this.config.settings, system: { ...this.config.settings.system, [k]: v } }, "impianto");
  }

  private lifetime<K extends keyof Lifetime>(k: K) {
    return (v: number) => this.emit({ ...this.config.settings, lifetime: { ...this.config.settings.lifetime, [k]: v } }, "tempo");
  }

  private setSizes(next: ScenarioSizes) {
    this.emit({ ...this.config.settings, scenarios: normalizeSizes(next, this.config.settings.scenarios) }, "taglie");
  }

  private sizeEditor(f: Formatters, kind: SizeKind) {
    const sizes = this.config.settings.scenarios;
    const key = kind === "pv" ? "pv_sizes_kwp" : "battery_sizes_kwh";
    const unit = kind === "pv" ? "kWp" : "kWh";
    const values = sizes[key];
    const lim = SIZE_LIMITS[kind];
    const full = values.length >= lim.maxCount;
    const canRemove = kind === "battery" || values.length > 1;
    const commit = (input: HTMLInputElement) => {
      const v = parseNumber(input.value);
      this.addingSize = null;
      if (v === null || v < lim.min || v > lim.max) return;
      this.setSizes({ ...sizes, [key]: [...values, v] });
    };
    return html`<div class="stack">
      <span class="strong">${kind === "pv" ? "Fotovoltaico" : "Batteria"}</span>
      <div class="chips">
        ${kind === "battery" ? html`<span class="chip fixed">Nessuna</span>` : nothing}
        ${values.map(
          (v) => html`<span class="chip">
            ${f.num(v)} ${unit}
            ${canRemove
              ? html`<button aria-label="Togli ${f.num(v)} ${unit}" @click=${() => this.setSizes({ ...sizes, [key]: values.filter((x) => x !== v) })}>×</button>`
              : nothing}
          </span>`,
        )}
        ${full
          ? nothing
          : this.addingSize === kind
            ? html`<input
                type="text"
                inputmode="decimal"
                placeholder=${unit}
                aria-label="Nuova taglia in ${unit}"
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") commit(e.target as HTMLInputElement);
                  if (e.key === "Escape") this.addingSize = null;
                }}
                @blur=${(e: FocusEvent) => commit(e.target as HTMLInputElement)}
              />`
            : html`<button class="chip add" @click=${() => this.openSizeInput(kind)}>+ Aggiungi</button>`}
      </div>
      <span class="small muted">Da ${f.num(lim.min)} a ${f.num(lim.max)} ${unit}, al massimo ${lim.maxCount} taglie${full ? " (raggiunto)" : ""}.</span>
    </div>`;
  }

  private async openSizeInput(kind: SizeKind) {
    this.addingSize = kind;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLInputElement>(".chips input")?.focus();
  }

  private collapsible(id: string, title: string, summary: string, body: unknown) {
    return html`<details class="card" id=${id}>
      <summary>
        <span class="summary-text"><span class="strong">${title}</span><span class="small muted">${summary}</span></span>
        ${this.savedBadge(id)}
      </summary>
      <div class="details-body">${body}</div>
    </details>`;
  }

  private consumption<K extends keyof ConsumptionSettings>(k: K) {
    return (v: ConsumptionSettings[K]) =>
      this.emit({ ...this.config.settings, consumption: { ...this.config.settings.consumption, [k]: v } }, "dati");
  }

  private renderData(f: Formatters) {
    const d = this.config.data;
    const c = this.config.settings.consumption;
    const loc = this.locale;
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
        <div class="row"><h3>Dati di consumo</h3><span class="spacer"></span>${this.savedBadge("dati")}</div>
        <span class="muted" role="status">${statusSentence(d, c.annual_kwh !== null, f)}</span>
      </div>
      ${selectField(
        "Misuratore di tutta la casa",
        c.meter_entity_id ?? "",
        [{ value: "", label: "Nessuno" }, ...this.config.meter_options.map((o) => ({ value: o.entity_id, label: o.name }))],
        (v) => this.consumption("meter_entity_id")(v || null),
        meterHint,
        true,
      )}
      ${numberField(measured ? "Consumo annuo, per confronto" : "Consumo annuo", c.annual_kwh, "kWh/anno", loc, this.consumption("annual_kwh"), {
        min: 100,
        max: 100000,
        integer: true,
        placeholder: "Dalla bolletta",
        onClear: () => this.consumption("annual_kwh")(null),
        hint: measured
          ? "Con 12 mesi misurati il calcolo usa lo storico"
          : d.source === "mixed"
            ? "Se lo lasci vuoto, proietto i giorni misurati sull'anno"
            : "La somma dei 12 mesi in bolletta",
      })}
      ${selectField(
        "Andamento nell'anno",
        c.seasonal_profile,
        (Object.keys(SEASONAL_LABEL) as SeasonalProfile[]).map((k) => ({ value: k, label: SEASONAL_LABEL[k] })),
        (v) => this.consumption("seasonal_profile")(v as SeasonalProfile),
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
      <span class="small muted">Produzione stimata per ${this.config.location.name}.</span>
    </div>`;
  }

  render() {
    if (!this.config) return nothing;
    const f = formatters(this.locale);
    const { tariff: t, system: s, lifetime: l } = this.config.settings;
    const d = this.config.data;
    const loc = this.locale;
    const derived = this.config.derived;

    return html`
      ${this.renderData(f)}

      <div class="card" id="carichi" @loads-change=${() => this.markSaved("carichi")}>
        <div class="card-head">
          <div class="row"><h3>Carichi spostabili</h3><span class="spacer"></span>${this.savedBadge("carichi")}</div>
          <span class="small muted">
            Gli elettrodomestici che potresti far partire in un altro orario, e quelli che consumano ogni giorno come pompa di calore e clima.
            Quanto vale spostarli lo trovi in Scenari.
          </span>
        </div>
        ${d.loads_exceed_months.length
          ? html`<div class="banner small" role="status">
              I carichi superano il consumo di ${joinMonths(d.loads_exceed_months)}: il calcolo li riduce a quanto consuma la casa in quei mesi.
              Controlla i kWh al giorno dei carichi continui o il consumo annuo.
            </div>`
          : nothing}
        <pv-loads-list .config=${this.config} .locale=${this.locale}></pv-loads-list>
      </div>

      <div class="card" id="taglie">
        <div class="card-head">
          <div class="row"><h3>Taglie da confrontare</h3><span class="spacer"></span>${this.savedBadge("taglie")}</div>
          <span class="small muted">Sono le righe e le colonne della tabella in Scenari. Ogni taglia in più allunga un po' il calcolo.</span>
        </div>
        <div class="sizes">${this.sizeEditor(f, "pv")} ${this.sizeEditor(f, "battery")}</div>
      </div>

      ${this.collapsible(
        "bolletta",
        "Bolletta",
        `€ ${f.num(derived.grid_price_eur_kwh, 3)}/kWh prelevato · ritiro € ${f.num(t.export_price, 3)} · fissi ${f.eur(derived.fixed_annual_eur)}/anno`,
        html`
          ${numberField("Energia (vendita + rete)", t.energy_price, "€/kWh", loc, this.tariff("energy_price"), {
            hint: "Materia energia + trasporto, la parte in €/kWh della bolletta",
          })}
          ${numberField("Accise", t.excise, "€/kWh", loc, this.tariff("excise"))}
          ${numberField("IVA", t.vat_pct, "%", loc, this.tariff("vat_pct"))}
          ${numberField("Quota fissa", t.fixed_monthly, "€/mese", loc, this.tariff("fixed_monthly"))}
          ${numberField("Quota potenza", t.power_fee, "€/kW/mese", loc, this.tariff("power_fee"))}
          ${numberField("Potenza contatore", t.power_kw, "kW", loc, this.tariff("power_kw"))}
          ${numberField("Ritiro dedicato", t.export_price, "€/kWh", loc, this.tariff("export_price"), {
            hint: "Quanto ti paga il GSE per ogni kWh immesso",
          })}
          <p class="small muted" style="margin-top:8px">Costi fissi uguali in tutti gli scenari: il FV riduce solo la parte in €/kWh.</p>
        `,
      )}
      ${this.collapsible(
        "impianto",
        "Impianto e batteria",
        `FV ${f.eur(s.cost_per_kwp)}/kWp · batteria ${f.eur(s.cost_per_kwh)}/kWh · detrazione ${s.deduction_pct}%`,
        html`
          ${numberField("Costo FV chiavi in mano", s.cost_per_kwp, "€/kWp", loc, this.system("cost_per_kwp"))}
          ${numberField("Costo batteria", s.cost_per_kwh, "€/kWh", loc, this.system("cost_per_kwh"))}
          ${selectField(
            "Detrazione fiscale",
            String(s.deduction_pct),
            [
              { value: "0", label: "Nessuna" },
              { value: "36", label: "36% in 10 anni" },
              { value: "50", label: "50% in 10 anni" },
            ],
            (v) => this.system("deduction_pct")(Number(v)),
            "Verifica l'aliquota in vigore quando compri",
          )}
          ${numberField("Potenza batteria", s.battery_power_kw, "kW", loc, this.system("battery_power_kw"), { hint: "Quanto velocemente carica e scarica" })}
          ${numberField("Capacità utilizzabile", s.usable_pct, "%", loc, this.system("usable_pct"))}
          ${numberField("Efficienza carica/scarica", s.efficiency_pct, "%", loc, this.system("efficiency_pct"))}
          ${numberField("Limite immissione in rete", s.export_limit_kw, "kW", loc, this.system("export_limit_kw"), {
            hint: "Oltre questa potenza il FV in eccesso va perso",
          })}
        `,
      )}
      ${this.collapsible(
        "tempo",
        "Nel tempo",
        `pannelli −${f.num(l.degradation_pct)}%/anno · energia +${f.num(l.price_increase_pct)}%/anno · batteria ${l.battery_life_years} anni`,
        html`
          ${numberField("Calo resa pannelli", l.degradation_pct, "%/anno", loc, this.lifetime("degradation_pct"))}
          ${numberField("Aumento prezzo energia", l.price_increase_pct, "%/anno", loc, this.lifetime("price_increase_pct"))}
          ${numberField("Vita batteria", l.battery_life_years, "anni", loc, this.lifetime("battery_life_years"), { hint: "Poi va ricomprata, allo stesso prezzo di oggi" })}
          ${numberField("Costo inverter nuovo", l.inverter_cost, "€", loc, this.lifetime("inverter_cost"))}
          ${numberField("Cambio inverter dopo", l.inverter_year, "anni", loc, this.lifetime("inverter_year"))}
        `,
      )}
      ${this.collapsible(
        "calcolo",
        "Come funziona il calcolo",
        "Ipotesi e limiti del modello",
        html`<ul class="notes">
          <li>Simula ogni ora di un anno tipo: consumi, produzione FV, batteria, rete.</li>
          <li>
            I consumi vengono dal misuratore per i giorni registrati; il resto dell'anno è stimato dal consumo annuo con l'andamento scelto. Con
            un anno intero di storico conta solo lo storico. Gli orari della giornata vengono dal misuratore quando ha almeno 14 giorni.
          </li>
          <li>
            I carichi continui (pompa di calore, clima, VMC) consumano ogni giorno dei loro mesi e fanno parte del totale della casa. Se sono
            anticipabili, una parte del consumo si sposta fino a qualche ora prima, nelle ore di sole (preriscaldo o preraffresco).
          </li>
          <li>La batteria si carica solo dal FV, mai dalla rete.</li>
          <li>Lo spostamento mette i carichi nelle ore di sole della stessa giornata, senza considerare la batteria.</li>
          <li>Niente incentivi delle comunità energetiche (CER).</li>
        </ul>`,
      )}
    `;
  }
}

if (!customElements.get("pv-settings-page")) customElements.define("pv-settings-page", PvSettingsPage);
