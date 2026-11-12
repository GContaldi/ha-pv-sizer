import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import type { LoadDef, PanelConfig, UsualTime } from "../api/types";
import { hourOptions, numberField, selectField, switchField } from "../fields";
import { formatters, type Formatters } from "../format";
import { LOAD_LIMITS, LOAD_PRESETS, type LoadPreset } from "../load-presets";
import { USUAL_TIME_LABEL, createsLoop, effectiveUsage, usualPhrase } from "../loads";
import { shared } from "../styles";

const NEW_ID = "__new__";

export class PvLoadDialog extends LitElement {
  static properties = {
    config: { attribute: false },
    locale: { type: String },
    step: { state: true },
    draft: { state: true },
    confirmDelete: { state: true },
  };
  declare config: PanelConfig;
  declare locale: string;
  declare step: "preset" | "form";
  declare draft?: LoadDef;
  declare confirmDelete: boolean;

  constructor() {
    super();
    this.step = "preset";
    this.confirmDelete = false;
  }

  static styles = [
    shared,
    css`
      dialog {
        width: min(560px, calc(100vw - 32px));
        max-height: calc(100vh - 48px);
        padding: 0;
        border: none;
        border-radius: var(--ha-dialog-border-radius, 24px);
        background: var(--ha-dialog-surface-background, var(--card-background-color));
        color: var(--primary-text-color);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      dialog[open] {
        display: flex;
        flex-direction: column;
      }
      dialog::backdrop {
        background: var(--ha-dialog-scrim-backdrop, rgba(0, 0, 0, 0.4));
      }
      header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 8px 8px 24px;
      }
      header h2 {
        flex: 1;
        font-size: 20px;
        line-height: 28px;
        font-weight: 400;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button.icon {
        font: inherit;
        font-size: 22px;
        width: 48px;
        height: 48px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      button.icon:hover {
        background: var(--secondary-background-color);
      }
      .body {
        flex: 1;
        overflow-y: auto;
        padding: 0 24px 16px;
      }
      section + section {
        margin-top: 20px;
      }
      section > h3 {
        font-size: 14px;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
      }
      footer {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px 16px;
        border-top: 1px solid var(--divider-color);
      }
      footer .confirm {
        flex: 1;
      }
      footer button {
        font: inherit;
        font-weight: 500;
        min-height: 40px;
        padding: 0 16px;
        border-radius: 20px;
        border: none;
        background: none;
        color: var(--primary-color);
        cursor: pointer;
      }
      footer button:hover {
        background: color-mix(in srgb, currentColor 8%, transparent);
      }
      footer button:focus-visible,
      button.icon:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      footer button.primary {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      footer button.primary:disabled {
        opacity: 0.4;
        cursor: default;
      }
      footer button.danger {
        color: var(--error-color);
      }
      footer button.danger.filled {
        background: var(--error-color);
        color: #fff;
      }
      .presets {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .presets button,
      .source {
        font: inherit;
        color: inherit;
        text-align: left;
        min-height: 56px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background: none;
        cursor: pointer;
      }
      .presets button:hover,
      .source:hover:not(:disabled) {
        border-color: var(--primary-color);
      }
      .presets button:focus-visible,
      .source:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      .sources {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .source {
        flex-direction: row;
        justify-content: flex-start;
        align-items: center;
        gap: 12px;
      }
      .source[aria-checked="true"] {
        border-color: var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      }
      .source:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .radio {
        flex: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid var(--secondary-text-color);
        box-sizing: border-box;
      }
      .source[aria-checked="true"] .radio {
        border-color: var(--primary-color);
        background: radial-gradient(var(--primary-color) 0 4px, transparent 5px);
      }
      .source-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .field-control.wide {
        width: 240px;
      }
      .mode {
        margin-top: 8px;
      }
      .field-control input.name {
        text-align: left;
      }
      .note {
        margin: 8px 0 4px;
      }
      .measured {
        margin-top: 8px;
        padding: 12px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .hist {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 40px;
        margin-top: 10px;
      }
      .hist span {
        flex: 1;
        min-height: 1px;
        border-radius: 2px 2px 0 0;
        background: var(--primary-color);
        opacity: 0.8;
      }
      .hist-axis {
        display: flex;
        justify-content: space-between;
        margin-top: 2px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .error {
        color: var(--error-color);
        font-size: 12px;
        line-height: 16px;
        margin: -2px 0 6px;
      }
      @media (max-width: 600px) {
        dialog {
          width: 100vw;
          max-width: 100vw;
          height: 100%;
          max-height: 100%;
          margin: 0;
          border-radius: 0;
        }
        .presets {
          grid-template-columns: minmax(0, 1fr);
        }
        .field:has(.wide) {
          flex-wrap: wrap;
          gap: 6px 16px;
        }
        .field-control.wide {
          width: 100%;
        }
      }
    `,
  ];

  private get dialogEl(): HTMLDialogElement {
    return this.renderRoot.querySelector("dialog")!;
  }

  async openNew() {
    this.step = "preset";
    this.draft = undefined;
    this.confirmDelete = false;
    await this.updateComplete;
    this.dialogEl.showModal();
  }

  async openEdit(id: string) {
    const load = this.config.loads.find((l) => l.id === id);
    if (!load) return;
    this.step = "form";
    this.draft = structuredClone(load);
    this.confirmDelete = false;
    await this.updateComplete;
    this.dialogEl.showModal();
  }

  private close() {
    this.dialogEl.close();
  }

  private onClosed() {
    this.draft = undefined;
    this.confirmDelete = false;
  }

  private get isNew() {
    return this.draft?.id === NEW_ID;
  }

  private patch(changes: Partial<LoadDef>) {
    if (this.draft) this.draft = { ...this.draft, ...changes };
  }

  private async pickPreset(p: LoadPreset) {
    this.draft = { ...structuredClone(p.load), id: NEW_ID };
    this.step = "form";
    await this.updateComplete;
    if (!p.load.name) this.renderRoot.querySelector<HTMLInputElement>("input.name")?.focus();
  }

  private emit(loads: LoadDef[]) {
    this.dispatchEvent(new CustomEvent<LoadDef[]>("loads-change", { detail: loads, bubbles: true, composed: true }));
  }

  private problems(d: LoadDef): { name?: string; window?: string } {
    const out: { name?: string; window?: string } = {};
    if (!d.name.trim()) out.name = "Dai un nome al carico";
    if (d.shiftable) {
      const hours = effectiveUsage(d, this.config.detected).hours;
      if (d.window_end <= d.window_start) out.window = "L'ora di fine deve venire dopo quella di inizio";
      else if (d.window_end - d.window_start < hours) out.window = `La fascia deve durare almeno quanto un ciclo (${hours} h)`;
    }
    return out;
  }

  private save() {
    const d = this.draft;
    if (!d || Object.keys(this.problems(d)).length) return;
    const name = d.name.trim();
    if (this.isNew) {
      const names = new Set(this.config.loads.map((l) => l.name));
      let unique = name;
      for (let i = 2; names.has(unique); i++) unique = `${name} ${i}`;
      this.emit([...this.config.loads, { ...d, id: `carico_${Date.now().toString(36)}`, name: unique }]);
    } else {
      this.emit(this.config.loads.map((l) => (l.id === d.id ? { ...d, name } : l)));
    }
    this.close();
  }

  private deleteLoad() {
    const id = this.draft?.id;
    if (!id) return;
    this.emit(this.config.loads.filter((l) => l.id !== id).map((l) => (l.after === id ? { ...l, after: null } : l)));
    this.close();
  }

  private renderPresets() {
    const added = (p: LoadPreset) =>
      !!p.load.name && this.config.loads.some((l) => l.name === p.load.name || l.name.startsWith(`${p.load.name} `));
    return html`<div class="presets">
      ${LOAD_PRESETS.map(
        (p) => html`<button @click=${() => this.pickPreset(p)}>
          <span class="strong">${p.label ?? p.load.name}</span>
          ${added(p) ? html`<span class="small muted">già aggiunto</span>` : p.load.name ? nothing : html`<span class="small muted">scrivi tu il nome</span>`}
        </button>`,
      )}
    </div>`;
  }

  private sourceCard(value: LoadDef["source"], title: string, hint: string, disabled = false) {
    const d = this.draft!;
    return html`<button class="source" role="radio" aria-checked=${d.source === value} ?disabled=${disabled} @click=${() => this.patch({ source: value })}>
      <span class="radio"></span>
      <span class="source-text"><span class="strong">${title}</span><span class="small muted">${hint}</span></span>
    </button>`;
  }

  private renderSensor(f: Formatters, d: LoadDef) {
    const options = this.config.sensor_options;
    const det = effectiveUsage(d, this.config.detected).measured;
    const max = det ? Math.max(1, ...det.start_histogram) : 1;
    return html`
      ${selectField(
        "Sensore",
        d.sensor_entity_id ?? "",
        [{ value: "", label: "Scegli…" }, ...options.map((o) => ({ value: o.entity_id, label: o.name }))],
        (v) => this.patch({ sensor_entity_id: v || null }),
        undefined,
        true,
      )}
      ${!d.sensor_entity_id
        ? html`<p class="small muted note">Fino a quando non scegli un sensore uso la stima.</p>`
        : det
          ? html`<div class="measured">
              <p>
                Negli ultimi 12 mesi: <span class="strong">${det.cycles_per_year} cicli</span> (circa ${f.num(det.cycles_per_year / 52, 0)} a settimana) ·
                ${f.num(det.kwh_per_cycle)} kWh · circa ${f.num(det.duration_h)} h · ${usualPhrase(det.start_histogram)}
              </p>
              <div class="hist" role="img" aria-label="Orari di partenza negli ultimi 12 mesi">
                ${det.start_histogram.map((n, h) => html`<span style="height:${(n / max) * 100}%" title="${f.hour(h)}: ${n}"></span>`)}
              </div>
              <div class="hist-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
            </div>`
          : html`<p class="small muted note">Nello storico di questo sensore non trovo cicli: uso la stima.</p>`}
    `;
  }

  private renderEstimate(d: LoadDef) {
    const loc = this.locale;
    return html`
      ${numberField("Consumo per ciclo", d.kwh_per_cycle, "kWh", loc, (v) => this.patch({ kwh_per_cycle: v }), {
        ...LOAD_LIMITS.kwh_per_cycle,
        hint: "Sull'etichetta energetica: kWh/100 cicli ÷ 100",
      })}
      ${numberField("Durata", d.duration_h, "ore", loc, (v) => this.patch({ duration_h: v }), { ...LOAD_LIMITS.duration_h, hint: "Arrotondata all'ora" })}
      ${numberField("Quante volte a settimana", d.cycles_per_week, "cicli", loc, (v) => this.patch({ cycles_per_week: v }), LOAD_LIMITS.cycles_per_week)}
      ${selectField(
        "Di solito parte",
        d.usual_time,
        (Object.keys(USUAL_TIME_LABEL) as UsualTime[]).map((k) => ({ value: k, label: USUAL_TIME_LABEL[k] })),
        (v) => this.patch({ usual_time: v as UsualTime }),
      )}
    `;
  }

  private renderShift(d: LoadDef, windowError?: string) {
    const others = this.config.loads.filter((l) => l.id !== d.id && !createsLoop(this.config.loads, d.id, l.id));
    return html`
      ${switchField("Posso farlo partire in un altro orario", d.shiftable, (v) => this.patch({ shiftable: v }), "Il calcolo lo sposta nelle ore con più sole, dentro la fascia qui sotto")}
      ${d.shiftable
        ? html`
            <div class="field">
              <span class="field-text"><span class="field-label">Fascia in cui può funzionare</span></span>
              <span class="field-control wide">
                <span class="small muted">dalle</span>
                <select aria-label="Dalle" @change=${(e: Event) => this.patch({ window_start: Number((e.target as HTMLSelectElement).value) })}>
                  ${hourOptions(0, 23).map((o) => html`<option value=${o.value} ?selected=${Number(o.value) === d.window_start}>${o.label}</option>`)}
                </select>
                <span class="small muted">alle</span>
                <select aria-label="Alle" @change=${(e: Event) => this.patch({ window_end: Number((e.target as HTMLSelectElement).value) })}>
                  ${hourOptions(1, 24).map((o) => html`<option value=${o.value} ?selected=${Number(o.value) === d.window_end}>${o.label}</option>`)}
                </select>
              </span>
            </div>
            ${windowError ? html`<p class="error" role="alert">${windowError}</p>` : nothing}
            ${selectField(
              "Deve aspettare che finisca",
              d.after ?? "",
              [{ value: "", label: "Nessun altro carico" }, ...others.map((l) => ({ value: l.id, label: l.name }))],
              (v) => this.patch({ after: v || null }),
              "Per esempio l'asciugatrice dopo la lavatrice",
            )}
          `
        : nothing}
    `;
  }

  private renderForm(f: Formatters, d: LoadDef) {
    const problems = this.problems(d);
    const noSensors = this.config.sensor_options.length === 0;
    return html`
      <section>
        <label class="field">
          <span class="field-text"><span class="field-label">Nome</span></span>
          <span class="field-control wide">
            <input class="name" type="text" .value=${live(d.name)} @input=${(e: Event) => this.patch({ name: (e.target as HTMLInputElement).value })} />
          </span>
        </label>
        ${problems.name && d.name !== "" ? html`<p class="error">${problems.name}</p>` : nothing}
      </section>
      <section>
        <h3>Da dove prendo i consumi?</h3>
        <div class="sources" role="radiogroup" aria-label="Da dove prendo i consumi">
          ${this.sourceCard(
            "sensor",
            "Da un sensore che misura solo questo elettrodomestico (consigliato)",
            noSensors ? "Nessun sensore di energia trovato in Home Assistant" : "Una presa smart o una pinza sul suo circuito: cicli e orari veri",
            noSensors,
          )}
          ${this.sourceCard("estimate", "Lo stimo io", "Scrivi consumo per ciclo e quante volte lo usi")}
        </div>
        <div class="mode">${d.source === "sensor" ? this.renderSensor(f, d) : this.renderEstimate(d)}</div>
      </section>
      <section>
        <h3>Spostamento</h3>
        ${this.renderShift(d, problems.window)}
      </section>
    `;
  }

  private renderFooter(d: LoadDef | undefined) {
    if (!d) return html`<span class="spacer"></span><button @click=${this.close}>Annulla</button>`;
    if (this.confirmDelete)
      return html`
        <span class="confirm small">Eliminare «${d.name}»? I carichi che lo aspettano partiranno da soli.</span>
        <button @click=${() => (this.confirmDelete = false)}>Annulla</button>
        <button class="danger filled" @click=${this.deleteLoad}>Elimina</button>
      `;
    const valid = Object.keys(this.problems(d)).length === 0;
    return html`
      ${this.isNew
        ? html`<button @click=${() => (this.step = "preset")}>Indietro</button>`
        : html`<button class="danger" @click=${() => (this.confirmDelete = true)}>Elimina</button>`}
      <span class="spacer"></span>
      <button @click=${this.close}>Annulla</button>
      <button class="primary" ?disabled=${!valid} @click=${this.save}>Salva</button>
    `;
  }

  render() {
    const f = formatters(this.locale);
    const d = this.step === "form" ? this.draft : undefined;
    const title = !d ? "Che elettrodomestico è?" : this.isNew ? d.name.trim() || "Nuovo carico" : d.name.trim() || "Carico";
    return html`<dialog aria-label=${title} @close=${this.onClosed}>
      ${this.config
        ? html`
            <header>
              <h2>${title}</h2>
              <button class="icon" aria-label="Chiudi" @click=${this.close}>×</button>
            </header>
            <div class="body">${d ? this.renderForm(f, d) : this.renderPresets()}</div>
            <footer>${this.renderFooter(d)}</footer>
          `
        : nothing}
    </dialog>`;
  }
}

if (!customElements.get("pv-load-dialog")) customElements.define("pv-load-dialog", PvLoadDialog);
