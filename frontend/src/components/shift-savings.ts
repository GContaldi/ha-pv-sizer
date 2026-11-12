import { LitElement, css, html, nothing } from "lit";
import type { PanelConfig, Results, ScenarioDetail } from "../api/types";
import { baseOption, readColors, type ChartOption } from "../chart";
import { formatters } from "../format";
import { shared } from "../styles";
import "../chart";

/** Value of shifting loads for the selected scenario; lives under the scenario detail. */
export class PvShiftSavings extends LitElement {
  static properties = {
    detail: { attribute: false },
    config: { attribute: false },
    results: { attribute: false },
    locale: { type: String },
    themeKey: { type: String },
    shift: { type: Boolean },
  };
  declare shift: boolean;
  declare detail: ScenarioDetail;
  declare config: PanelConfig;
  declare results: Results;
  declare locale: string;
  declare themeKey: string;

  static styles = [
    shared,
    css`
      :host {
        display: block;
      }
      .wrap {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px 20px 20px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-card-border-radius, 12px);
      }
      .shift {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
        font-size: 14px;
        white-space: nowrap;
        cursor: pointer;
      }
      .headline {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 4px 12px;
      }
      .big {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
        color: var(--success-color);
        font-variant-numeric: tabular-nums;
      }
      th[rowspan] {
        vertical-align: bottom;
      }
      th.group {
        text-align: center;
        padding-bottom: 4px;
      }
      .two {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
        align-items: start;
      }
      @container (max-width: 800px) {
        .two {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ];

  private goToLoads() {
    this.dispatchEvent(new CustomEvent("navigate", { detail: "impostazioni/carichi", bubbles: true, composed: true }));
  }

  render() {
    if (!this.detail || !this.config || !this.results || this.detail.summary.pv_kwp === 0) return nothing;
    const f = formatters(this.locale);
    const c = readColors(this);
    const s = this.detail.summary;
    const shiftable = this.config.loads.filter((l) => l.shiftable);
    const header = html`<div class="row">
      <h2>Spostamento carichi</h2>
      <span class="spacer"></span>
      ${shiftable.length
        ? html`<label class="shift">
            <span>Includi spostamento carichi</span>
            <span class="switch">
              <input
                type="checkbox"
                .checked=${this.shift}
                @change=${(e: Event) =>
                  this.dispatchEvent(new CustomEvent<boolean>("shift-change", { detail: (e.target as HTMLInputElement).checked, bubbles: true, composed: true }))}
              />
              <span></span>
            </span>
          </label>`
        : nothing}
      <button class="link" @click=${() => this.goToLoads()}>Modifica i carichi</button>
    </div>`;
    if (shiftable.length === 0) {
      return html`<div class="wrap">${header}<p class="muted">Nessun carico spostabile. Aggiungine uno in Impostazioni per vedere quanto vale spostarlo nelle ore di sole.</p></div>`;
    }

    const values = new Map(this.detail.loads.map((v) => [v.load_id, v]));
    const tableSum = shiftable.reduce((a, l) => a + (values.get(l.id)?.saving_eur ?? 0), 0);
    const mixed = shiftable.some((l) => l.kind === "continuous");
    const effect = this.detail.shift_effect_eur;
    const base = baseOption(c, {
      categories: this.results.load_savings_by_pv.map((r) => `${f.kwp(r.pv_kwp)} kWp`),
      xName: "Potenza FV (senza batteria)",
      valueFormatter: (v) => f.eur(v),
      axisFormatter: (v) => f.eur(v),
    });
    const byPv: ChartOption = {
      ...base,
      // The legend wraps to a second line past four loads.
      grid: { ...(base.grid as object), top: shiftable.length > 4 ? 60 : 36 },
      series: shiftable.map((l) => ({
        name: l.name,
        type: "bar",
        stack: "s",
        data: this.results.load_savings_by_pv.map((r) => Math.round(r.by_load[l.id] ?? 0)),
      })),
    };

    return html`<div class="wrap">
      ${header}
      <div class="stack">
        <div class="headline">
          <span class="big">${f.eur(effect)}</span>
          <span>l'anno in meno in bolletta, facendo partire i carichi nelle ore di sole.</span>
        </div>
        ${tableSum - effect > 5
          ? html`<span class="small muted">
              Presi uno per uno: ${f.eur(tableSum)}. Insieme: ${f.eur(effect)}, perché si dividono lo stesso sole${s.battery_kwh > 0 ? " e la batteria ne usa già una parte" : ""}.
            </span>`
          : nothing}
      </div>
      <div class="two">
        <div class="stack">
          <h3>Quanto vale spostare ogni carico</h3>
          <table>
            <thead>
              <tr>
                <th rowspan="2">Carico</th>
                <th rowspan="2" class="num">${mixed ? "Cicli o giorni/anno" : "Cicli/anno"}</th>
                <th colspan="2" class="num group">${mixed ? "Costo per ciclo o giorno" : "Costo per ciclo"}</th>
                <th rowspan="2" class="num">Risparmio/anno</th>
              </tr>
              <tr>
                <th class="num">orari di oggi</th>
                <th class="num">spostato</th>
              </tr>
            </thead>
            <tbody>
              ${shiftable.map((l) => {
                const v = values.get(l.id);
                if (!v) return nothing;
                return html`<tr>
                  <td>${l.name}</td>
                  <td class="num">${v.cycles_per_year}${mixed ? (v.kind === "continuous" ? " giorni" : " cicli") : ""}</td>
                  <td class="num">${f.eur2(v.cost_per_cycle_pv)}</td>
                  <td class="num">${f.eur2(v.cost_per_cycle_shifted)}</td>
                  <td class="num">${f.eur(v.saving_eur)}</td>
                </tr>`;
              })}
            </tbody>
          </table>
          <span class="small muted">
            Un kWh dalla rete costa € ${f.num(this.config.derived.grid_price_eur_kwh, 3)}; uno dal tuo FV costa € ${f.num(this.config.settings.tariff.export_price, 3)}, cioè quello
            che non incassi immettendolo. Ogni carico è valutato da solo e senza batteria.
          </span>
        </div>
        <div class="stack">
          <h3>Risparmio per taglia FV (€/anno)</h3>
          <pv-chart .option=${byPv} height="240"></pv-chart>
          <span class="small muted">Oltre una certa potenza il guadagno si ferma: con tanto FV anche i cicli agli orari di oggi trovano spesso il sole.</span>
        </div>
      </div>
    </div>`;
  }
}

if (!customElements.get("pv-shift-savings")) customElements.define("pv-shift-savings", PvShiftSavings);
