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
  };
  declare detail: ScenarioDetail;
  declare config: PanelConfig;
  declare results: Results;
  declare locale: string;
  declare themeKey: string;

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
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
      .two {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
        align-items: start;
      }
      button.link {
        font: inherit;
        color: var(--primary-color);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
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
      <button class="link small" @click=${() => this.goToLoads()}>Modifica i carichi</button>
    </div>`;
    if (shiftable.length === 0) {
      return html`${header}<p class="muted">Nessun carico spostabile. Aggiungine uno in Carichi per vedere quanto vale spostarlo nelle ore di sole.</p>`;
    }

    const values = new Map(this.detail.loads.map((v) => [v.load_id, v]));
    const tableSum = shiftable.reduce((a, l) => a + (values.get(l.id)?.saving_eur ?? 0), 0);
    const effect = this.detail.shift_effect_eur;
    const byPv: ChartOption = {
      ...baseOption(c, {
        categories: this.results.load_savings_by_pv.map((r) => `${f.kwp(r.pv_kwp)} kWp`),
        xName: "Potenza FV (senza batteria)",
        valueFormatter: (v) => f.eur(v),
        axisFormatter: (v) => f.eur(v),
      }),
      series: shiftable.map((l) => ({
        name: l.name,
        type: "bar",
        stack: "s",
        data: this.results.load_savings_by_pv.map((r) => Math.round(r.by_load[l.id] ?? 0)),
      })),
    };

    return html`
      ${header}
      <div class="stack">
        <div class="headline">
          <span class="big">${f.eur(effect)}</span>
          <span>l'anno in meno in bolletta, spostando i carichi spostabili nelle ore di sole.</span>
        </div>
        <span class="small muted">
          Per vedere tutti gli scenari con questo risparmio attiva "Con spostamento carichi" sopra la tabella.
          ${tableSum - effect > 5
            ? `La tabella sotto somma ${f.eur(tableSum)}: lì ogni carico è valutato da solo e senza batteria. Insieme si contendono lo stesso surplus${
                s.battery_kwh > 0 ? " e la batteria ne usa già una parte" : ""
              }, quindi l'effetto reale è minore.`
            : ""}
        </span>
      </div>
      <div class="two">
        <div class="stack">
          <h3>Quanto vale spostare ogni carico</h3>
          <table>
            <thead>
              <tr>
                <th>Carico</th>
                <th class="num">Cicli/anno</th>
                <th class="num">Costo ciclo, orari di oggi</th>
                <th class="num">Spostato</th>
                <th class="num">Risparmio/anno</th>
              </tr>
            </thead>
            <tbody>
              ${shiftable.map((l) => {
                const v = values.get(l.id);
                if (!v) return nothing;
                return html`<tr>
                  <td>${l.name}</td>
                  <td class="num">${v.cycles_per_year}</td>
                  <td class="num">${f.eur2(v.cost_per_cycle_pv)}</td>
                  <td class="num">${f.eur2(v.cost_per_cycle_shifted)}</td>
                  <td class="num">${f.eur(v.saving_eur)}</td>
                </tr>`;
              })}
            </tbody>
          </table>
          <span class="small muted">
            Costo ciclo = energia dalla rete × ${f.eur3(this.config.derived.grid_price_eur_kwh)} + energia FV usata × ${f.eur3(this.config.settings.tariff.export_price)} (quello che
            avresti incassato immettendola). Non considera la batteria.
          </span>
        </div>
        <div class="stack">
          <h3>Risparmio per taglia FV (€/anno)</h3>
          <pv-chart .option=${byPv} height="240"></pv-chart>
          <span class="small muted">Oltre una certa potenza il guadagno si ferma: con tanto FV anche i cicli agli orari di oggi trovano spesso il sole.</span>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("pv-shift-savings")) customElements.define("pv-shift-savings", PvShiftSavings);
