import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import type { Lifetime, PanelConfig, ScenarioSizes, Settings, SystemCosts, Tariff } from "../api/types";
import { numberField, selectField } from "../fields";
import { formatters, parseNumber, type Formatters } from "../format";
import { SIZE_LIMITS, normalizeSizes } from "../scenario-sizes";
import { shared } from "../styles";
import "./loads-list";

type SizeKind = "pv" | "battery";

export class PvSettingsPage extends LitElement {
  static properties = {
    config: { attribute: false },
    locale: { type: String },
    section: { type: String },
    addingSize: { state: true },
  };
  declare config: PanelConfig;
  declare locale: string;
  declare section?: string;
  declare addingSize: SizeKind | null;

  constructor() {
    super();
    this.addingSize = null;
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
        width: 8px;
        height: 8px;
        flex: none;
        margin-right: 4px;
        border-right: 2px solid var(--secondary-text-color);
        border-bottom: 2px solid var(--secondary-text-color);
        transform: rotate(45deg);
        transition: transform 0.15s;
      }
      details.card[open] > summary::after {
        transform: rotate(-135deg);
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
        height: 36px;
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
        font: inherit;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      .chip button:hover {
        background: var(--divider-color);
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
        height: 36px;
        border-radius: 999px;
        text-align: center;
      }
      ul.notes {
        margin: 0;
        padding-left: 18px;
        color: var(--secondary-text-color);
        font-size: 13px;
      }
    `,
  ];

  protected updated(changed: PropertyValues<this>) {
    if (!changed.has("section") || !this.section) return;
    const target = this.renderRoot.querySelector<HTMLElement>(`#${this.section}`);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private emit(settings: Settings) {
    this.dispatchEvent(new CustomEvent<Settings>("settings-change", { detail: settings, bubbles: true, composed: true }));
  }

  private tariff<K extends keyof Tariff>(k: K) {
    return (v: number) => this.emit({ ...this.config.settings, tariff: { ...this.config.settings.tariff, [k]: v } });
  }

  private system<K extends keyof SystemCosts>(k: K) {
    return (v: number) => this.emit({ ...this.config.settings, system: { ...this.config.settings.system, [k]: v } });
  }

  private lifetime<K extends keyof Lifetime>(k: K) {
    return (v: number) => this.emit({ ...this.config.settings, lifetime: { ...this.config.settings.lifetime, [k]: v } });
  }

  private setSizes(next: ScenarioSizes) {
    this.emit({ ...this.config.settings, scenarios: normalizeSizes(next, this.config.settings.scenarios) });
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
      </summary>
      <div class="details-body">${body}</div>
    </details>`;
  }

  render() {
    if (!this.config) return nothing;
    const f = formatters(this.locale);
    const { tariff: t, system: s, lifetime: l } = this.config.settings;
    const d = this.config.data;
    const loc = this.locale;
    const derived = this.config.derived;

    return html`
      <div class="card" id="dati">
        <div class="card-head">
          <h3>Dati di consumo</h3>
          ${d.source === "demo"
            ? html`<span class="muted">Anno tipo simulato: ${f.kwh(d.annual_kwh)}. Nell'integrazione vera qui c'è il contatore della dashboard Energia.</span>`
            : html`<span class="muted">
                ${d.consumption_entity_id} · dal ${d.from} al ${d.to} · ${f.kwh(d.annual_kwh)} l'anno${d.days < 365 ? " (mesi mancanti stimati)" : ""}
              </span>`}
          <span class="small muted">Produzione stimata per ${this.config.location.name}.</span>
        </div>
      </div>

      <div class="card" id="carichi">
        <div class="card-head">
          <h3>Carichi spostabili</h3>
          <span class="small muted">Gli elettrodomestici che potresti far partire in un altro orario. Quanto vale spostarli lo trovi in Scenari.</span>
        </div>
        <pv-loads-list .config=${this.config} .locale=${this.locale}></pv-loads-list>
      </div>

      <div class="card" id="taglie">
        <div class="card-head">
          <h3>Taglie da confrontare</h3>
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
          <li>La batteria si carica solo dal FV, mai dalla rete.</li>
          <li>Lo spostamento mette i carichi nelle ore di sole della stessa giornata, senza considerare la batteria.</li>
          <li>Niente incentivi delle comunità energetiche (CER).</li>
        </ul>`,
      )}
    `;
  }
}

if (!customElements.get("pv-settings-page")) customElements.define("pv-settings-page", PvSettingsPage);
