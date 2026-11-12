import { LitElement, css, html, nothing } from "lit";
import type { Lifetime, PanelConfig, ScenarioSizes, Settings, SystemCosts, Tariff } from "../api/types";
import { numberField, selectField } from "../fields";
import { formatters, parseNumber, type Formatters } from "../format";
import { SIZE_LIMITS, normalizeSizes } from "../scenario-sizes";
import { shared } from "../styles";

export class PvSettingsForm extends LitElement {
  static properties = { config: { attribute: false }, locale: { type: String } };
  declare config: PanelConfig;
  declare locale: string;

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        align-items: start;
      }
      .sizes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 32px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        height: 28px;
        padding: 0 4px 0 12px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .chip.fixed {
        padding-right: 12px;
        color: var(--secondary-text-color);
      }
      .chip button {
        font: inherit;
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      .chip button:hover {
        background: var(--divider-color);
      }
      .chips input {
        width: 72px;
        height: 28px;
        border-radius: 999px;
        text-align: center;
      }
      @container (max-width: 700px) {
        .sizes {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @container (max-width: 1000px) {
        .cards {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @container (max-width: 600px) {
        .cards {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ];

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

  private sizeEditor(f: Formatters, kind: "pv" | "battery") {
    const sizes = this.config.settings.scenarios;
    const key = kind === "pv" ? "pv_sizes_kwp" : "battery_sizes_kwh";
    const unit = kind === "pv" ? "kWp" : "kWh";
    const values = sizes[key];
    const lim = SIZE_LIMITS[kind];
    const full = values.length >= lim.maxCount;
    const canRemove = kind === "battery" || values.length > 1;
    const add = (e: Event) => {
      const input = e.target as HTMLInputElement;
      const v = parseNumber(input.value);
      input.value = "";
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
          : html`<input
              type="text"
              inputmode="decimal"
              placeholder="+ ${unit}"
              aria-label="Aggiungi taglia in ${unit}"
              @change=${add}
            />`}
      </div>
      <span class="small muted">Da ${f.num(lim.min)} a ${f.num(lim.max)} ${unit}, al massimo ${lim.maxCount} taglie${full ? " (raggiunto)" : ""}.</span>
    </div>`;
  }

  render() {
    if (!this.config) return nothing;
    const f = formatters(this.locale);
    const { tariff: t, system: s, lifetime: l } = this.config.settings;
    const d = this.config.data;
    const loc = this.locale;
    return html`
      <div class="stack">
        <h2>Impostazioni</h2>
        <p class="muted small">Cambiale per provare ipotesi diverse: tabella e grafici si ricalcolano subito.</p>
      </div>

      <div class="card">
        <div class="card-title">Dati di consumo</div>
        ${d.source === "demo"
          ? html`<p>Dati demo: un anno tipo simulato (${f.kwh(d.annual_kwh)}). Nell'integrazione vera qui c'è il contatore preso dalla dashboard Energia.</p>`
          : html`<p>
              Contatore <code>${d.consumption_entity_id}</code> · dal ${d.from} al ${d.to} (${d.days} giorni) · ${f.kwh(d.annual_kwh)} l'anno
              ${d.days < 365 ? html`<br /><span class="small muted">Meno di un anno di dati: i mesi mancanti sono stimati.</span>` : nothing}
            </p>`}
        <p class="small muted">Produzione stimata per ${this.config.location.name} (${f.num(this.config.location.latitude, 2)}° N).</p>
      </div>

      <div class="card">
        <div class="card-title">Scenari da confrontare</div>
        <div class="sizes">${this.sizeEditor(f, "pv")} ${this.sizeEditor(f, "battery")}</div>
        <p class="small muted" style="margin-top:12px">Sono le righe e le colonne della tabella in Scenari. Ogni taglia in più allunga un po' il calcolo.</p>
      </div>

      <div class="cards">
        <div class="card">
          <div class="card-title">Tariffa <span class="spacer"></span><span class="small">dalla bolletta</span></div>
          ${numberField("Energia (vendita + rete)", t.energy_price, "€/kWh", loc, this.tariff("energy_price"))}
          ${numberField("Accise", t.excise, "€/kWh", loc, this.tariff("excise"))}
          ${numberField("IVA", t.vat_pct, "%", loc, this.tariff("vat_pct"))}
          ${numberField("Quota fissa", t.fixed_monthly, "€/mese", loc, this.tariff("fixed_monthly"))}
          ${numberField("Quota potenza", t.power_fee, "€/kW/mese", loc, this.tariff("power_fee"))}
          ${numberField("Potenza contatore", t.power_kw, "kW", loc, this.tariff("power_kw"))}
          ${numberField("Ritiro dedicato", t.export_price, "€/kWh", loc, this.tariff("export_price"))}
          <p class="small muted" style="margin-top:8px">
            Un kWh prelevato costa ${f.eur3(this.config.derived.grid_price_eur_kwh)} con accise e IVA. Costi fissi ${f.eur(this.config.derived.fixed_annual_eur)}/anno, uguali in
            tutti gli scenari.
          </p>
        </div>
        <div class="card">
          <div class="card-title">Impianto e batteria</div>
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
          )}
          ${numberField("Potenza batteria", s.battery_power_kw, "kW", loc, this.system("battery_power_kw"))}
          ${numberField("Capacità utilizzabile", s.usable_pct, "%", loc, this.system("usable_pct"))}
          ${numberField("Efficienza carica/scarica", s.efficiency_pct, "%", loc, this.system("efficiency_pct"))}
          ${numberField("Limite immissione in rete", s.export_limit_kw, "kW", loc, this.system("export_limit_kw"))}
        </div>
        <div class="card">
          <div class="card-title">Nel tempo</div>
          ${numberField("Calo resa pannelli", l.degradation_pct, "%/anno", loc, this.lifetime("degradation_pct"))}
          ${numberField("Aumento prezzo energia", l.price_increase_pct, "%/anno", loc, this.lifetime("price_increase_pct"))}
          ${numberField("Vita batteria", l.battery_life_years, "anni", loc, this.lifetime("battery_life_years"))}
          ${numberField("Costo inverter nuovo", l.inverter_cost, "€", loc, this.lifetime("inverter_cost"))}
          ${numberField("Inverter da cambiare all'anno", l.inverter_year, "", loc, this.lifetime("inverter_year"))}
          <p class="small muted" style="margin-top:8px">Batteria nuova allo stesso prezzo di oggi (ipotesi prudente). Verifica l'aliquota della detrazione in vigore.</p>
        </div>
      </div>
      <p class="small muted">
        Limiti del modello: risoluzione oraria; la batteria si carica solo dal FV; lo spostamento cerca il surplus FV senza considerare la batteria; niente incentivi CER.
      </p>
    `;
  }
}

if (!customElements.get("pv-settings-form")) customElements.define("pv-settings-form", PvSettingsForm);
