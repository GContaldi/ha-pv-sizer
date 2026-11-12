import { LitElement, css, html, nothing } from "lit";
import type { CellSummary, Results } from "../api/types";
import { formatters } from "../format";
import { shared } from "../styles";

export type MetricKey = "saving" | "gain" | "payback" | "self_sufficiency" | "self_consumption";

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: "saving", label: "Risparmio annuo" },
  { key: "gain", label: "Guadagno in 25 anni" },
  { key: "payback", label: "Rientro" },
  { key: "self_sufficiency", label: "Autosufficienza" },
  { key: "self_consumption", label: "Autoconsumo" },
];

export interface Selection {
  pv_kwp: number;
  battery_kwh: number;
}

function metricValue(c: CellSummary, k: MetricKey): number | null {
  switch (k) {
    case "saving":
      return c.saving_eur;
    case "gain":
      return c.gain_eur;
    case "payback":
      return c.payback_years;
    case "self_sufficiency":
      return c.self_sufficiency;
    case "self_consumption":
      return c.self_consumption;
  }
}

export class PvScenarioGrid extends LitElement {
  static properties = {
    results: { attribute: false },
    pvSizes: { attribute: false },
    batterySizes: { attribute: false },
    metric: { attribute: false },
    shift: { type: Boolean },
    selected: { attribute: false },
    locale: { type: String },
  };
  declare results: Results;
  declare pvSizes: number[];
  declare batterySizes: number[];
  declare metric: MetricKey;
  declare shift: boolean;
  declare selected: Selection;
  declare locale: string;

  static styles = [
    shared,
    css`
      .grid {
        display: grid;
        gap: 6px;
      }
      .head {
        padding: 0 8px 2px;
      }
      .rowlabel {
        display: flex;
        align-items: center;
        font-size: 13px;
        font-weight: 500;
        color: var(--secondary-text-color);
      }
      .cell {
        position: relative;
        overflow: hidden;
        min-height: 48px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
        cursor: pointer;
        text-align: left;
        font: inherit;
        color: inherit;
      }
      .cell.disabled {
        cursor: default;
        background: transparent;
      }
      .cell.selected {
        outline: 2px solid var(--primary-color);
        outline-offset: -1px;
      }
      .tint {
        position: absolute;
        inset: 0;
        background: var(--primary-color);
        pointer-events: none;
      }
      .content {
        position: relative;
      }
      .value {
        font-weight: 500;
      }
    `,
  ];

  private select(pv_kwp: number, battery_kwh: number) {
    this.dispatchEvent(new CustomEvent<Selection>("scenario-select", { detail: { pv_kwp, battery_kwh }, bubbles: true, composed: true }));
  }

  render() {
    const f = formatters(this.locale);
    const cells = new Map(this.results.cells.filter((c) => c.shift === this.shift).map((c) => [`${c.pv_kwp}|${c.battery_kwh}`, c]));
    const values = [...cells.values()].map((c) => metricValue(c, this.metric)).filter((v): v is number => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const format = (v: number | null) => {
      if (this.metric === "payback") return f.years(v);
      if (v === null) return "–";
      return this.metric === "saving" || this.metric === "gain" ? f.eur(v) : f.pct(v);
    };
    const isSel = (k: number, cap: number) => this.selected.pv_kwp === k && this.selected.battery_kwh === cap;

    return html`
      <div class="grid" style="grid-template-columns: 110px repeat(${this.batterySizes.length}, minmax(0, 1fr))">
        <div></div>
        ${this.batterySizes.map((cap) => html`<div class="head small muted">${cap === 0 ? "Senza batteria" : `Batteria ${cap} kWh`}</div>`)}

        <div class="rowlabel">Senza FV</div>
        ${this.batterySizes.map((cap) =>
          cap === 0
            ? html`<button class="cell ${isSel(0, 0) ? "selected" : ""}" @click=${() => this.select(0, 0)}>
                <div class="value">Oggi</div>
                <div class="small muted">bolletta ${f.eur(this.results.baseline.bill_eur)}/anno</div>
              </button>`
            : html`<div class="cell disabled">
                <div class="muted">–</div>
                <div class="small muted">senza FV non si carica</div>
              </div>`,
        )}
        ${this.pvSizes.map(
          (k) => html`
            <div class="rowlabel">FV ${f.kwp(k)} kWp</div>
            ${this.batterySizes.map((cap) => {
              const c = cells.get(`${k}|${cap}`);
              if (!c) return html`<div class="cell disabled"></div>`;
              const v = metricValue(c, this.metric);
              let t = v !== null && max > min ? (v - min) / (max - min) : 0;
              if (this.metric === "payback" && v !== null) t = 1 - t;
              const sub = this.metric === "saving" ? `rientro ${f.years(c.payback_years)}` : `${f.eur(c.saving_eur)}/anno`;
              return html`<button class="cell ${isSel(k, cap) ? "selected" : ""}" @click=${() => this.select(k, cap)}>
                ${v !== null ? html`<div class="tint" style="opacity:${0.06 + 0.42 * t}"></div>` : nothing}
                <div class="content">
                  <div class="value">${format(v)}</div>
                  <div class="small muted">${sub}</div>
                </div>
              </button>`;
            })}
          `,
        )}
      </div>
    `;
  }
}

if (!customElements.get("pv-scenario-grid")) customElements.define("pv-scenario-grid", PvScenarioGrid);
