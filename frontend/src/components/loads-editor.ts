import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import type { LoadDef, PanelConfig, UsualTime } from "../api/types";
import { hourOptions, numberField, selectField, switchField } from "../fields";
import { formatters, type Formatters } from "../format";
import { LOAD_LIMITS, LOAD_PRESETS, type LoadPreset } from "../load-presets";
import { shared } from "../styles";

const USUAL_TIMES: { value: UsualTime; label: string }[] = [
  { value: "any", label: "A qualsiasi ora" },
  { value: "night", label: "Notte (0–6)" },
  { value: "morning", label: "Mattina (6–9)" },
  { value: "afternoon", label: "Pomeriggio (13–17)" },
  { value: "evening", label: "Sera (18–23)" },
];

type Source = LoadDef["source"];
type AddStep = "closed" | "choose" | Source;

export class PvLoadsEditor extends LitElement {
  static properties = {
    config: { attribute: false },
    locale: { type: String },
    addStep: { state: true },
  };
  declare config: PanelConfig;
  declare locale: string;
  declare addStep: AddStep;
  private justAdded?: string;

  constructor() {
    super();
    this.addStep = "closed";
  }

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 20px;
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
      .tag {
        font-size: 11px;
        line-height: 16px;
        padding: 1px 8px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        color: var(--secondary-text-color);
      }
      .tag.warn {
        border-color: var(--warning-color);
        color: var(--warning-color);
      }
      .body {
        padding: 0 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .name {
        max-width: 360px;
      }
      .sources {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .source {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .source[aria-checked="true"] {
        border-color: var(--primary-color);
        box-shadow: inset 0 0 0 1px var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      }
      .source:disabled {
        cursor: default;
        opacity: 0.5;
      }
      .source:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
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
      .section-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin-bottom: 2px;
      }
      .window select {
        width: 84px;
      }
      .add {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .presets {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      @container (max-width: 700px) {
        .cols,
        .sources {
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

  private add(base: Omit<LoadDef, "id">) {
    const id = `carico_${Date.now().toString(36)}`;
    const names = new Set(this.config.loads.map((l) => l.name));
    let name = base.name;
    for (let i = 2; names.has(name); i++) name = `${base.name} ${i}`;
    this.justAdded = id;
    this.addStep = "closed";
    this.emit([...this.config.loads, { ...base, id, name }]);
  }

  private addFromSensor(entityId: string) {
    const option = this.config.sensor_options.find((o) => o.entity_id === entityId);
    if (!option) return;
    const custom = LOAD_PRESETS.find((p) => p.key === "custom")!.load;
    this.add({ ...custom, name: option.name, source: "sensor", sensor_entity_id: entityId });
  }

  private sourceChooser(current: Source | null, onPick: (s: Source) => void) {
    const noSensors = this.config.sensor_options.length === 0;
    return html`<div class="sources" role="radiogroup" aria-label="Da dove prendere i dati">
      <button class="source" role="radio" aria-checked=${current === "sensor"} ?disabled=${noSensors} @click=${() => onPick("sensor")}>
        <span class="strong">Sensore di energia</span>
        <span class="small muted">${noSensors ? "Nessun sensore di energia trovato in Home Assistant" : "Cicli, consumi e orari veri, letti dallo storico"}</span>
      </button>
      <button class="source" role="radio" aria-checked=${current === "estimate"} @click=${() => onPick("estimate")}>
        <span class="strong">Stima manuale</span>
        <span class="small muted">Scrivi tu consumo per ciclo e quante volte lo usi</span>
      </button>
    </div>`;
  }

  private renderSensorFields(f: Formatters, l: LoadDef) {
    const det = l.sensor_entity_id ? this.config.detected.find((d) => d.entity_id === l.sensor_entity_id) : undefined;
    return html`
      ${selectField(
        "Sensore",
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
        : html`<span class="small muted">Scegli il sensore che misura solo questo carico, per esempio una presa smart o una pinza sul circuito.</span>`}
    `;
  }

  private renderEstimateFields(l: LoadDef) {
    return html`
      ${numberField("Consumo per ciclo", l.kwh_per_cycle, "kWh", this.locale, (v) => this.patch(l.id, { kwh_per_cycle: v }), LOAD_LIMITS.kwh_per_cycle)}
      ${numberField("Durata", l.duration_h, "ore", this.locale, (v) => this.patch(l.id, { duration_h: v }), LOAD_LIMITS.duration_h)}
      ${numberField("Quante volte", l.cycles_per_week, "a settimana", this.locale, (v) => this.patch(l.id, { cycles_per_week: v }), LOAD_LIMITS.cycles_per_week)}
      ${selectField("Quando parte oggi", l.usual_time, USUAL_TIMES, (v) => this.patch(l.id, { usual_time: v as UsualTime }))}
    `;
  }

  private renderLoad(f: Formatters, l: LoadDef, index: number) {
    const det = l.sensor_entity_id ? this.config.detected.find((d) => d.entity_id === l.sensor_entity_id) : undefined;
    const missingSensor = l.source === "sensor" && !l.sensor_entity_id;
    const meta =
      l.source === "sensor"
        ? det
          ? `${f.num(det.cycles_per_year / 52, 1)}/sett · ${f.num(det.kwh_per_cycle)} kWh`
          : ""
        : `${l.cycles_per_week}/sett · ${f.num(l.kwh_per_cycle)} kWh`;
    return html`
      <details class="card" ?open=${index === 0 || l.id === this.justAdded}>
        <summary>
          <span class="strong">${l.name}</span>
          <span class="tag ${missingSensor ? "warn" : ""}">${l.source === "sensor" ? (missingSensor ? "Sensore da scegliere" : "Sensore") : "Stima"}</span>
          ${l.shiftable ? nothing : html`<span class="tag">Non spostabile</span>`}
          <span class="small muted">${meta}</span>
        </summary>
        <div class="body">
          <input
            type="text"
            class="name"
            aria-label="Nome del carico"
            .value=${live(l.name)}
            @change=${(e: Event) => this.patch(l.id, { name: (e.target as HTMLInputElement).value || "Carico" })}
          />
          ${this.sourceChooser(l.source, (source) => source !== l.source && this.patch(l.id, { source }))}
          <div class="cols">
            <div>
              <span class="section-label">${l.source === "sensor" ? "Dati dal sensore" : "Come lo usi oggi"}</span>
              ${l.source === "sensor" ? this.renderSensorFields(f, l) : this.renderEstimateFields(l)}
            </div>
            <div>
              <span class="section-label">Spostamento</span>
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

  private renderAdd() {
    if (this.addStep === "closed") {
      return html`<div class="row"><button class="btn" @click=${() => (this.addStep = "choose")}>Aggiungi carico</button></div>`;
    }
    const cancel = html`<div class="row"><button class="btn ghost" @click=${() => (this.addStep = "closed")}>Annulla</button></div>`;
    const used = new Set(this.config.loads.map((l) => l.sensor_entity_id).filter(Boolean));
    return html`<div class="card add">
      <span class="strong">Nuovo carico</span>
      ${this.sourceChooser(this.addStep === "choose" ? null : this.addStep, (s) => (this.addStep = s))}
      ${this.addStep === "sensor"
        ? selectField(
            "Sensore",
            "",
            [
              { value: "", label: "Scegli un sensore" },
              ...this.config.sensor_options.map((o) => ({ value: o.entity_id, label: used.has(o.entity_id) ? `${o.name} (già usato)` : o.name })),
            ],
            (v) => v && this.addFromSensor(v),
          )
        : nothing}
      ${this.addStep === "estimate"
        ? html`<div class="stack">
            <span class="small muted">Parti da un modello con valori tipici, poi correggili:</span>
            <div class="presets">${LOAD_PRESETS.map((p: LoadPreset) => html`<button class="pill" @click=${() => this.add(p.load)}>${p.label ?? p.load.name}</button>`)}</div>
          </div>`
        : nothing}
      ${cancel}
    </div>`;
  }

  render() {
    if (!this.config) return nothing;
    const f = formatters(this.locale);
    return html`
      <div class="stack">
        <h2>Carichi</h2>
        <p class="muted small">
          Gli elettrodomestici che potresti far partire in un altro orario. Per ognuno scegli se leggere i dati da un sensore di energia o stimarli a mano. Quanto vale
          spostarli lo trovi in Scenari, nel dettaglio di ogni scenario.
        </p>
      </div>
      <div class="loads">${this.config.loads.map((l, i) => this.renderLoad(f, l, i))}</div>
      ${this.renderAdd()}
    `;
  }
}

if (!customElements.get("pv-loads-editor")) customElements.define("pv-loads-editor", PvLoadsEditor);
