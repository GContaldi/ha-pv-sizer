import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import type { LoadDef, PanelConfig, Results, ScenarioDetail, UsualTime } from "../api/types";
import { baseOption, readColors, type ChartOption } from "../chart";
import { hourOptions, numberField, selectField, switchField } from "../fields";
import { formatters, scenarioName } from "../format";
import { LOAD_LIMITS, LOAD_PRESETS, type LoadPreset } from "../load-presets";
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
    adding: { state: true },
  };
  declare config: PanelConfig;
  declare detail: ScenarioDetail;
  declare results: Results;
  declare locale: string;
  declare themeKey: string;
  declare adding: boolean;
  private justAdded?: string;

  constructor() {
    super();
    this.adding = false;
  }

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .headline {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .big {
        font-size: 28px;
        line-height: 34px;
        font-weight: 500;
        color: var(--success-color);
        font-variant-numeric: tabular-nums;
      }
      button.link {
        font: inherit;
        color: var(--primary-color);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
      }
      .loads {
        display: flex;
        flex-direction: column;
        gap: 8px;
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
        gap: 10px;
        flex-wrap: wrap;
      }
      .tag {
        font-size: 11px;
        line-height: 16px;
        padding: 1px 8px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        color: var(--secondary-text-color);
      }
      .saving {
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cols {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 32px;
      }
      .cols > div {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .presets {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
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
        min-width: 120px;
      }
      .window select {
        width: 84px;
      }
      @container (max-width: 700px) {
        .cols {
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

  private add(preset: LoadPreset) {
    const id = `carico_${Date.now().toString(36)}`;
    const names = new Set(this.config.loads.map((l) => l.name));
    let name = preset.load.name;
    for (let i = 2; names.has(name); i++) name = `${preset.load.name} ${i}`;
    this.justAdded = id;
    this.adding = false;
    this.emit([...this.config.loads, { ...preset.load, id, name }]);
  }

  private goToScenari() {
    this.dispatchEvent(new CustomEvent("navigate", { detail: "scenari", bubbles: true, composed: true }));
  }

  private renderHeadline(f: ReturnType<typeof formatters>) {
    const s = this.detail.summary;
    const scenario = html`<span class="small muted">
      Scenario: ${scenarioName(f, s.pv_kwp, s.battery_kwh)} · <button class="link small" @click=${() => this.goToScenari()}>cambia in Scenari</button>
    </span>`;
    if (s.pv_kwp === 0) {
      return html`<div class="card headline">
        ${scenario}
        <span class="strong">Senza FV spostare i carichi non fa risparmiare.</span>
        <span class="muted">Con la tariffa monoraria il kWh costa uguale a ogni ora. Scegli uno scenario con il FV per vedere quanto vale.</span>
      </div>`;
    }
    const tableSum = this.detail.loads.reduce((a, v) => a + v.saving_eur, 0);
    const effect = this.detail.shift_effect_eur;
    return html`<div class="card headline">
      ${scenario}
      <div><span class="big">${f.eur(effect)}</span> <span class="muted">l'anno</span></div>
      <span>risparmio in bolletta spostando i carichi spostabili nelle ore di sole.</span>
      ${tableSum - effect > 5
        ? html`<span class="small muted">
            La tabella sotto somma ${f.eur(tableSum)}: lì ogni carico è valutato da solo e senza batteria. Insieme si contendono lo stesso surplus${s.battery_kwh > 0
              ? " e la batteria ne usa già una parte"
              : ""}, quindi l'effetto reale è minore.
          </span>`
        : nothing}
    </div>`;
  }

  private renderLoad(l: LoadDef, index: number) {
    const f = formatters(this.locale);
    const det = this.config.detected.find((d) => d.load_id === l.id);
    const value = this.detail.loads.find((v) => v.load_id === l.id);
    const hasPv = this.detail.summary.pv_kwp > 0;
    const sensorMeta = l.source === "sensor" && det ? `${f.num(det.cycles_per_year / 52, 1)}/sett · ${f.num(det.kwh_per_cycle)} kWh` : null;
    return html`
      <details class="card" ?open=${index === 0 || l.id === this.justAdded}>
        <summary>
          <span class="strong">${l.name}</span>
          <span class="tag">${l.source === "sensor" ? "Sensore" : "Stima"}</span>
          ${l.shiftable ? nothing : html`<span class="tag">Non spostabile</span>`}
          <span class="small muted">${sensorMeta ?? `${l.cycles_per_week}/sett · ${f.num(l.kwh_per_cycle)} kWh`}</span>
          <span class="spacer"></span>
          ${l.shiftable && hasPv && value ? html`<span class="saving">${f.eur(value.saving_eur)}/anno</span>` : nothing}
        </summary>
        <div class="body">
          <div class="row">
            <input
              type="text"
              class="name"
              aria-label="Nome del carico"
              .value=${live(l.name)}
              @change=${(e: Event) => this.patch(l.id, { name: (e.target as HTMLInputElement).value || "Carico" })}
            />
            <button class="pill sm ${l.source === "estimate" ? "active" : ""}" @click=${() => this.patch(l.id, { source: "estimate" })}>Stima</button>
            <button class="pill sm ${l.source === "sensor" ? "active" : ""}" @click=${() => this.patch(l.id, { source: "sensor" })}>Sensore</button>
          </div>
          <div class="cols">
            <div>
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
                    ${numberField("Consumo per ciclo", l.kwh_per_cycle, "kWh", this.locale, (v) => this.patch(l.id, { kwh_per_cycle: v }), LOAD_LIMITS.kwh_per_cycle)}
                    ${numberField("Durata", l.duration_h, "ore", this.locale, (v) => this.patch(l.id, { duration_h: v }), LOAD_LIMITS.duration_h)}
                    ${numberField("Quante volte", l.cycles_per_week, "a settimana", this.locale, (v) => this.patch(l.id, { cycles_per_week: v }), LOAD_LIMITS.cycles_per_week)}
                    ${selectField("Quando parte oggi", l.usual_time, USUAL_TIMES, (v) => this.patch(l.id, { usual_time: v as UsualTime }))}
                  `}
            </div>
            <div>
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
            </div>
          </div>
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
      ${this.renderHeadline(f)}

      <div class="stack">
        <h2>Carichi</h2>
        <p class="muted small">
          Stima un carico con consumo e frequenza, oppure collegalo a un sensore di energia per usare cicli e orari veri. Se è spostabile, la simulazione lo mette nell'ora più
          conveniente della stessa giornata, dentro la finestra consentita.
        </p>
      </div>

      <div class="loads">${this.config.loads.map((l, i) => this.renderLoad(l, i))}</div>
      ${this.adding
        ? html`<div class="presets">
            <span class="small muted">Aggiungi:</span>
            ${LOAD_PRESETS.map((p) => html`<button class="pill" @click=${() => this.add(p)}>${p.label ?? p.load.name}</button>`)}
            <button class="btn ghost" @click=${() => (this.adding = false)}>Annulla</button>
          </div>`
        : html`<div class="row"><button class="btn" @click=${() => (this.adding = true)}>Aggiungi carico</button></div>`}

      ${s.pv_kwp > 0 && shiftable.length > 0
        ? html`
            <div class="stack">
              <h3>Quanto vale spostare ogni carico</h3>
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
                che avresti incassato immettendola). Non considera la batteria.
              </span>
            </div>
            <div class="stack">
              <h3>Risparmio dallo spostamento per impianto (€/anno)</h3>
              <pv-chart .option=${byPv} height="240"></pv-chart>
              <span class="small muted">Oltre una certa potenza il guadagno si ferma: con tanto FV anche i cicli agli orari di oggi trovano spesso il sole.</span>
            </div>
          `
        : nothing}
    `;
  }
}

if (!customElements.get("pv-loads-editor")) customElements.define("pv-loads-editor", PvLoadsEditor);
