import { LitElement, css, html, nothing } from "lit";
import type { CellSummary, DataInfo, Results } from "../api/types";
import { sourceLine } from "../consumption";
import { formatters, type Formatters } from "../format";
import { shared } from "../styles";

export type MetricKey = "saving" | "gain" | "payback" | "self_sufficiency" | "self_consumption";

export const metrics = (horizonYears: number): { key: MetricKey; label: string }[] => [
  { key: "saving", label: "Risparmio annuo" },
  { key: "gain", label: `Guadagno in ${horizonYears} anni` },
  { key: "payback", label: "Rientro" },
  { key: "self_sufficiency", label: "Autosufficienza" },
  { key: "self_consumption", label: "Autoconsumo" },
];

const LEGEND: Record<MetricKey, [string, string]> = {
  saving: ["risparmia meno", "risparmia di più"],
  gain: ["guadagna meno", "guadagna di più"],
  payback: ["rientra più tardi", "rientra prima"],
  self_sufficiency: ["meno autosufficiente", "più autosufficiente"],
  self_consumption: ["usa meno del suo FV", "usa più del suo FV"],
};

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

function cellDetail(f: Formatters, c: CellSummary, k: MetricKey): string {
  switch (k) {
    case "saving":
      return `bolletta ${f.eur(c.bill_eur)}/anno`;
    case "gain":
      return `${f.eur(c.saving_eur)}/anno`;
    case "payback":
      return `${f.eur(c.saving_eur)}/anno su ${f.eur(c.investment_eur)}`;
    case "self_sufficiency":
      return `${f.num(c.consumption_kwh - c.import_kwh, 0)} su ${f.kwh(c.consumption_kwh)}`;
    case "self_consumption":
      return `${f.num(c.pv_used_kwh, 0)} su ${f.kwh(c.pv_kwh)}`;
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
    horizonYears: { type: Number },
    data: { attribute: false },
  };
  declare horizonYears: number;
  declare data?: DataInfo;
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
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      button {
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .today {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 16px;
        padding: 10px 14px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
      }
      .today .figs {
        font-variant-numeric: tabular-nums;
      }
      .today .why {
        flex-basis: 100%;
      }
      .source {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0 4px;
        margin: -6px 0 0 14px;
      }
      .source button.link {
        font-size: 12px;
      }
      .scroller {
        overflow-x: auto;
      }
      .grid {
        display: grid;
        gap: 6px;
      }
      .corner,
      .head {
        padding: 0 10px 2px;
        white-space: nowrap;
      }
      .corner {
        padding-left: 0;
        align-items: flex-end;
      }
      .axis {
        padding: 0 10px;
        font-weight: 500;
        color: var(--secondary-text-color);
        border-bottom: 1px solid var(--divider-color);
      }
      .rowlabel {
        position: sticky;
        left: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        background: var(--primary-background-color);
        font-size: 13px;
        font-weight: 500;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .cell {
        position: relative;
        overflow: hidden;
        min-height: 48px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
      }
      .cell.empty {
        cursor: default;
        background: transparent;
      }
      .selected {
        border-color: var(--primary-color);
        box-shadow: inset 0 0 0 2px var(--primary-color);
      }
      button:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .tint {
        position: absolute;
        inset: 0;
        background: var(--primary-color);
        pointer-events: none;
      }
      .content {
        position: relative;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .content > div {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .value {
        font-weight: 500;
      }
      .best {
        position: absolute;
        top: 0;
        right: 0;
        padding: 0 8px;
        border-radius: 0 7px 0 8px;
        font-size: 12px;
        line-height: 20px;
        font-weight: 500;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
      }
      .ramp {
        width: 96px;
        height: 10px;
        border-radius: 5px;
        background: linear-gradient(
          to right,
          color-mix(in srgb, var(--primary-color) 6%, var(--secondary-background-color)),
          color-mix(in srgb, var(--primary-color) 48%, var(--secondary-background-color))
        );
      }
    `,
  ];

  private select(pv_kwp: number, battery_kwh: number) {
    this.dispatchEvent(new CustomEvent<Selection>("scenario-select", { detail: { pv_kwp, battery_kwh }, bubbles: true, composed: true }));
  }

  render() {
    const f = formatters(this.locale, this.horizonYears);
    const cells = new Map(this.results.cells.filter((c) => c.shift === this.shift).map((c) => [`${c.pv_kwp}|${c.battery_kwh}`, c]));
    const shown = this.pvSizes.flatMap((k) => this.batterySizes.map((cap) => cells.get(`${k}|${cap}`))).filter((c): c is CellSummary => !!c);
    const values = shown.map((c) => metricValue(c, this.metric)).filter((v): v is number => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bestValue = this.metric === "payback" ? min : max;
    const best = shown.find((c) => metricValue(c, this.metric) === bestValue);
    const format = (v: number | null) => {
      if (this.metric === "payback") return f.years(v);
      if (v === null) return "–";
      return this.metric === "saving" || this.metric === "gain" ? f.eur(v) : f.pct(v);
    };
    const isSel = (k: number, cap: number) => this.selected.pv_kwp === k && this.selected.battery_kwh === cap;

    const base = this.results.baseline;
    return html`
      <button class="today ${isSel(0, 0) ? "selected" : ""}" aria-pressed=${isSel(0, 0)} @click=${() => this.select(0, 0)}>
        <span class="strong">Oggi, senza FV</span>
        <span class="figs muted">Bolletta <span class="strong">${f.eur(base.bill_eur)}/anno</span> · consumo <span class="strong">${f.kwh(base.annual_kwh)}</span></span>
        <span class="why small muted">È il punto di partenza. Senza FV la batteria non serve: con la tariffa monoraria caricarla dalla rete non fa risparmiare.</span>
      </button>
      ${this.data && sourceLine(this.data, f)
        ? html`<div class="source small muted">
            <span>${sourceLine(this.data, f)}</span>
            <button
              class="link"
              @click=${() => this.dispatchEvent(new CustomEvent("navigate", { detail: "impostazioni/dati", bubbles: true, composed: true }))}
            >
              Modifica
            </button>
          </div>`
        : nothing}

      <div class="scroller">
        <div class="grid" style="grid-template-columns: 72px repeat(${this.batterySizes.length}, minmax(120px, 1fr))">
          <div class="rowlabel"></div>
          <div class="axis small" style="grid-column: span ${this.batterySizes.length}">Batteria</div>
          <div class="corner rowlabel small">FV</div>
          ${this.batterySizes.map((cap) => html`<div class="head small muted">${cap === 0 ? "Nessuna" : `${f.num(cap)} kWh`}</div>`)}
          ${this.pvSizes.map(
            (k) => html`
              <div class="rowlabel">${f.kwp(k)} kWp</div>
              ${this.batterySizes.map((cap) => {
                const c = cells.get(`${k}|${cap}`);
                if (!c) return html`<div class="cell empty"></div>`;
                const v = metricValue(c, this.metric);
                let t = v !== null && max > min ? (v - min) / (max - min) : 0;
                if (this.metric === "payback" && v !== null) t = 1 - t;
                const sub = cellDetail(f, c, this.metric);
                return html`<button class="cell ${isSel(k, cap) ? "selected" : ""}" aria-pressed=${isSel(k, cap)} @click=${() => this.select(k, cap)}>
                  ${v !== null ? html`<div class="tint" style="opacity:${0.06 + 0.42 * t}"></div>` : nothing}
                  ${c === best ? html`<span class="best">Migliore</span>` : nothing}
                  <div class="content">
                    <div class="value">${format(v)}</div>
                    <div class="small muted">${sub}</div>
                  </div>
                </button>`;
              })}
            `,
          )}
        </div>
      </div>
      <div class="legend small muted">
        <span>${LEGEND[this.metric][0]}</span>
        <span class="ramp" aria-hidden="true"></span>
        <span>${LEGEND[this.metric][1]}</span>
        <span>· Tocca una casella per vederne il dettaglio.</span>
      </div>
    `;
  }
}

if (!customElements.get("pv-scenario-grid")) customElements.define("pv-scenario-grid", PvScenarioGrid);
