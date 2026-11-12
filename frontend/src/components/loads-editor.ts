import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import type { LoadDef, PanelConfig, Results, ScenarioDetail, UsualTime } from "../api/types";
import { baseOption, readColors, type ChartOption } from "../chart";
import { hourOptions, numberField, selectField, switchField } from "../fields";
import { formatters, scenarioName } from "../format";
import { shared } from "../styles";
import "../chart";

const USUAL_TIMES: { value: UsualTime; label: string }[] = [
  { value: "any", label: "A qualsiasi ora" },
  { value: "night", label: "Notte (0–6)" },
  { value: "morning", label: "Mattina (6–9)" },
  { value: "afternoon", label: "Pomeriggio (13–17)" },
  { value: "evening", label: "Sera (18–23)" },
];

export class PvLoadsEditor extends LitElement {
  static properties = {
    config: { attribute: false },
    detail: { attribute: false },
    results: { attribute: false },
    locale: { type: String },
    themeKey: { type: String },
  };
  declare config: PanelConfig;
  declare detail: ScenarioDetail;
  declare results: Results;
  declare locale: string;
  declare themeKey: string;

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .loads {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        align-items: start;
      }
      details.card {
        padding: 0;
      }
      summary {
        list-style: none;
        cursor: pointer;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      summary::before {
        content: "›";
        display: inline-block;
        width: 12px;
        color: var(--secondary-text-color);
        transition: transform 0.15s;
      }
      details[open] summary::before {
        transform: rotate(90deg);
      }
      .body {
        padding: 0 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .name {
        flex: 1;
      }
      hr {
        border: none;
        border-top: 1px solid var(--divider-color);
        margin: 8px 0;
      }
      .window select {
        width: 84px;
      }
      @media (max-width: 800px) {
        .loads {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ];

  private emit(loads: LoadDef[]) {
    this.dispatchEvent(new CustomEvent<LoadDef[]>("loads-change", { detail: loads, bubbles: true, composed: true }));
  }

  private patch(id: string, changes: Partial<LoadDef>) {
    this.emit(this.config.loads.map((l) => (l.id === id ? { ...l, ...changes } : l)));
  }

  private removeLoad(id: string) {
    this.emit(this.config.loads.filter((l) => l.id !== id).map((l) => (l.after === id ? { ...l, after: null } : l)));
  }

  private add() {
    const id = `carico_${Date.now().toString(36)}`;
    this.emit([
      ...this.config.loads,
      { id, name: "Nuovo carico", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 1, duration_h: 1, cycles_per_week: 3, usual_time: "any", shiftable: true, window_start: 9, window_end: 18, after: null },
    ]);
  }

  private renderLoad(l: LoadDef, index: number) {
    const f = formatters(this.locale);
    const det = this.config.detected.find((d) => d.load_id === l.id);
    const value = this.detail.loads.find((v) => v.load_id === l.id);
    const hasPv = this.detail.summary.pv_kwp > 0;
    return html`
      <details class="card" ?open=${index === 0}>
        <summary>
          <span class="name strong">${l.name}</span>
          <span class="small muted">
            ${l.cycles_per_week}/sett · ${f.num(l.kwh_per_cycle)} kWh${l.shiftable && hasPv && value ? ` · ${f.eur(value.saving_eur)}/anno` : ""}
          </span>
        </summary>
        <div class="body">
          <div class="row">
            <input
              type="text"
              class="name"
              .value=${live(l.name)}
              @change=${(e: Event) => this.patch(l.id, { name: (e.target as HTMLInputElement).value || "Carico" })}
            />
            <button class="pill sm ${l.source === "estimate" ? "active" : ""}" @click=${() => this.patch(l.id, { source: "estimate" })}>Stima</button>
            <button class="pill sm ${l.source === "sensor" ? "active" : ""}" @click=${() => this.patch(l.id, { source: "sensor" })}>Sensore</button>
          </div>
          ${l.source === "sensor"
            ? html`
                ${selectField(
                  "Sensore di energia",
                  l.sensor_entity_id ?? "",
                  [{ value: "", label: "Scegli un sensore" }, ...this.config.sensor_options.map((o) => ({ value: o.entity_id, label: o.name }))],
                  (v) => this.patch(l.id, { sensor_entity_id: v || null }),
                )}
                ${det
                  ? html`
                      <span class="small muted">Trovato nello storico${this.config.data.source === "demo" ? " (simulato)" : ""}:</span>
                      <div class="field"><span class="field-label">Cicli in 12 mesi</span><span class="strong">${det.cycles_per_year}</span></div>
                      <div class="field"><span class="field-label">Consumo medio per ciclo</span><span class="strong">${f.num(det.kwh_per_cycle)} kWh</span></div>
                      <div class="field"><span class="field-label">Durata media</span><span class="strong">${f.num(det.duration_h)} h</span></div>
                      <div class="field"><span class="field-label">Ora di partenza più frequente</span><span class="strong">${f.hour(det.usual_start_hour)}</span></div>
                    `
                  : nothing}
              `
            : html`
                ${numberField("Consumo per ciclo", l.kwh_per_cycle, "kWh", this.locale, (v) => this.patch(l.id, { kwh_per_cycle: v }))}
                ${numberField("Durata", l.duration_h, "ore", this.locale, (v) => this.patch(l.id, { duration_h: v }))}
                ${numberField("Quante volte", l.cycles_per_week, "a settimana", this.locale, (v) => this.patch(l.id, { cycles_per_week: v }))}
                ${selectField("Quando parte oggi", l.usual_time, USUAL_TIMES, (v) => this.patch(l.id, { usual_time: v as UsualTime }))}
              `}
          <hr />
          ${switchField("Spostabile", l.shiftable, (v) => this.patch(l.id, { shiftable: v }))}
          ${l.shiftable
            ? html`<div class="field window">
                <span class="field-label">Finestra consentita</span>
                <select @change=${(e: Event) => this.patch(l.id, { window_start: Number((e.target as HTMLSelectElement).value) })}>
                  ${hourOptions(0, 23).map((o) => html`<option value=${o.value} ?selected=${Number(o.value) === l.window_start}>${o.label}</option>`)}
                </select>
                <span class="muted">–</span>
                <select @change=${(e: Event) => this.patch(l.id, { window_end: Number((e.target as HTMLSelectElement).value) })}>
                  ${hourOptions(1, 24).map((o) => html`<option value=${o.value} ?selected=${Number(o.value) === l.window_end}>${o.label}</option>`)}
                </select>
              </div>`
            : nothing}
          ${selectField(
            "Parte dopo",
            l.after ?? "",
            [{ value: "", label: "Nessun vincolo" }, ...this.config.loads.filter((x) => x.id !== l.id).map((x) => ({ value: x.id, label: x.name }))],
            (v) => this.patch(l.id, { after: v || null }),
          )}
          <div class="row"><span class="spacer"></span><button class="btn ghost" @click=${() => this.removeLoad(l.id)}>Rimuovi carico</button></div>
        </div>
      </details>
    `;
  }

  render() {
    if (!this.config || !this.detail || !this.results) return nothing;
    const f = formatters(this.locale);
    const c = readColors(this);
    const s = this.detail.summary;
    const shiftable = this.config.loads.filter((l) => l.shiftable);
    const values = new Map(this.detail.loads.map((v) => [v.load_id, v]));
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
      <div class="stack">
        <h2>Carichi spostabili</h2>
        <p class="muted">
          Ogni carico può essere stimato (consumo per ciclo e quante volte) oppure letto da un sensore: in quel caso l'integrazione trova i cicli nello storico e usa consumi e
          orari veri. Se è spostabile, la simulazione lo rimette nell'ora migliore della stessa giornata, dentro la finestra consentita.
        </p>
      </div>

      <div class="loads">${this.config.loads.map((l, i) => this.renderLoad(l, i))}</div>
      <div class="row"><button class="btn" @click=${() => this.add()}>Aggiungi carico</button></div>

      ${s.pv_kwp > 0 && shiftable.length > 0
        ? html`
            <div class="stack">
              <h3>Quanto vale spostarli · ${scenarioName(f, s.pv_kwp, s.battery_kwh)}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Carico</th>
                    <th class="num">Cicli/anno</th>
                    <th class="num">Costo ciclo senza FV</th>
                    <th class="num">Con FV, orari di oggi</th>
                    <th class="num">Con FV, spostato</th>
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
                      <td class="num">${f.eur2(v.cost_per_cycle_no_pv)}</td>
                      <td class="num">${f.eur2(v.cost_per_cycle_pv)}</td>
                      <td class="num">${f.eur2(v.cost_per_cycle_shifted)}</td>
                      <td class="num">${f.eur(v.saving_eur)}</td>
                    </tr>`;
                  })}
                </tbody>
              </table>
              <span class="small muted">
                Costo ciclo = energia dalla rete × ${f.eur3(this.config.derived.grid_price_eur_kwh)} + energia FV usata × ${f.eur3(this.config.settings.tariff.export_price)} (quello
                che avresti incassato immettendola). Non considera la batteria. Effetto reale sulla bolletta in questo scenario: ${f.eur(this.detail.shift_effect_eur)}/anno.
              </span>
            </div>
            <div class="stack">
              <h3>Risparmio dallo spostamento per impianto (€/anno)</h3>
              <pv-chart .option=${byPv} height="240"></pv-chart>
              <span class="small muted">Oltre una certa potenza il guadagno si ferma: con tanto FV anche i cicli agli orari di oggi trovano spesso il sole.</span>
            </div>
          `
        : nothing}

      <div class="banner info">
        <span class="strong">Senza FV spostare non serve.</span>
        <span class="muted">
          Con la tariffa monoraria il kWh costa uguale a ogni ora. Con il FV conviene usare il surplus di mezzogiorno: ogni kWh autoconsumato evita
          ${f.eur3(this.config.derived.grid_price_eur_kwh)} invece di essere ceduto a ${f.eur3(this.config.settings.tariff.export_price)}.
        </span>
      </div>
    `;
  }
}

if (!customElements.get("pv-loads-editor")) customElements.define("pv-loads-editor", PvLoadsEditor);
