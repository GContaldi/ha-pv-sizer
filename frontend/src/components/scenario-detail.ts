import { LitElement, css, html, nothing } from "lit";
import type { CostItem, PanelConfig, ScenarioDetail } from "../api/types";
import { baseOption, readColors, type ChartOption } from "../chart";
import { MONTHS, formatters, scenarioName, type Formatters } from "../format";
import { shared } from "../styles";
import "../chart";

export class PvScenarioDetail extends LitElement {
  static properties = {
    detail: { attribute: false },
    config: { attribute: false },
    locale: { type: String },
    themeKey: { type: String },
  };
  declare detail: ScenarioDetail;
  declare config: PanelConfig;
  declare locale: string;
  declare themeKey: string;

  static styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 16px;
      }
      .stat-value {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }
      .stat-value.good {
        color: var(--success-color);
      }
      .two {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
      }
      .costs {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
        gap: 24px;
        align-items: start;
      }
      .title {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .tag {
        font-size: 12px;
        padding: 2px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--primary-color) 15%, transparent);
        color: var(--primary-color);
      }
      .balance {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bar {
        display: flex;
        gap: 2px;
        height: 14px;
        border-radius: 7px;
        overflow: hidden;
      }
      .bar span {
        flex-basis: 0;
        min-width: 3px;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        font-variant-numeric: tabular-nums;
      }
      .legend i {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        margin-right: 6px;
      }
      details.defs summary {
        cursor: pointer;
        color: var(--primary-color);
        font-size: 13px;
      }
      details.defs[open] summary {
        margin-bottom: 12px;
      }
      .definition {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      @container (max-width: 800px) {
        .stats {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .two,
        .costs {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @container (max-width: 600px) {
        .stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ];

  private stat(value: string, label: string, sub: string, good = false) {
    return html`<div>
      <div class="stat-value ${good ? "good" : ""}">${value}</div>
      <div class="small">${label}</div>
      <div class="small muted">${sub}</div>
    </div>`;
  }

  private balance(f: Formatters, title: string, segments: { label: string; kwh: number; color: string }[]) {
    const shown = segments.filter((s) => s.kwh >= 0.5);
    const total = shown.reduce((a, s) => a + s.kwh, 0);
    return html`<div class="balance">
      <div class="row"><span class="strong">${title}</span><span class="spacer"></span><span class="muted">${f.kwh(total)} l'anno</span></div>
      <div class="bar">${shown.map((s) => html`<span style="flex-grow:${s.kwh};background:${s.color}"></span>`)}</div>
      <div class="legend small">
        ${shown.map(
          (s) => html`<span><i style="background:${s.color}"></i>${s.label} <span class="strong">${f.kwh(s.kwh)}</span> <span class="muted">${f.pct(total ? s.kwh / total : 0)}</span></span>`,
        )}
      </div>
    </div>`;
  }

  private costLabel(f: Formatters, item: CostItem): string {
    switch (item.kind) {
      case "pv":
        return `Fotovoltaico ${f.kwp(item.quantity)} kWp × ${f.eur(item.unit_cost)}/kWp`;
      case "battery":
        return `Batteria ${item.quantity} kWh × ${f.eur(item.unit_cost)}/kWh`;
      case "deduction":
        return `Detrazione ${item.pct}% in ${item.years} rate`;
      case "battery_replacement":
        return `Batteria nuova all'anno ${item.year}`;
      case "inverter_replacement":
        return `Inverter nuovo all'anno ${item.year}`;
    }
  }

  private costAmount(f: Formatters, item: CostItem): string {
    switch (item.kind) {
      case "pv":
      case "battery":
        return f.eur(item.amount_eur);
      case "deduction":
        return `+${f.eur(item.per_year_eur)}/anno`;
      default:
        return f.eur(-item.amount_eur);
    }
  }

  render() {
    if (!this.detail) return nothing;
    const f = formatters(this.locale, this.config.horizon_years);
    const c = readColors(this);
    const { summary: s, energy: e, monthly: m } = this.detail;
    const hasPv = s.pv_kwp > 0;
    const hasBattery = s.battery_kwh > 0;
    const anyCurtailed = m.curtailed.some((v) => v > 0.5);

    const kwhAxis = { categories: MONTHS, valueFormatter: (v: number) => f.kwh(v), axisFormatter: (v: number) => f.num(v, 0) };
    const coverage: ChartOption = {
      ...baseOption(c, kwhAxis),
      series: [
        ...(hasPv ? [{ name: "FV diretto", type: "bar", stack: "c", data: m.direct, itemStyle: { color: c.solar } }] : []),
        ...(hasBattery ? [{ name: "Dalla batteria", type: "bar", stack: "c", data: m.battery, itemStyle: { color: c.batteryOut } }] : []),
        { name: "Dalla rete", type: "bar", stack: "c", data: m.grid, itemStyle: { color: c.grid } },
      ],
    };
    const production: ChartOption = {
      ...baseOption(c, kwhAxis),
      series: [
        { name: "Usata in casa o in batteria", type: "bar", stack: "p", data: m.pv_used, itemStyle: { color: c.solar } },
        { name: "Immessa in rete", type: "bar", stack: "p", data: m.exported, itemStyle: { color: c.gridReturn } },
        ...(anyCurtailed ? [{ name: "Persa (limite immissione)", type: "bar", stack: "p", data: m.curtailed, itemStyle: { color: c.error } }] : []),
      ],
    };
    const cmp = this.detail.comparison;
    const cash: ChartOption = {
      ...baseOption(c, {
        categories: this.detail.costs.cash_flow_eur.map((_, y) => String(y)),
        xName: "Anni dall'installazione",
        valueFormatter: (v) => f.eur(v),
        axisFormatter: (v) => f.eur(v),
      }),
      series: [
        {
          name: scenarioName(f, s.pv_kwp, s.battery_kwh),
          type: "line",
          data: this.detail.costs.cash_flow_eur,
          showSymbol: false,
          lineStyle: { width: 2, color: c.primary },
          itemStyle: { color: c.primary },
          markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: c.secondary, type: "dashed" }, label: { formatter: "Pari", color: c.secondary, position: "insideStartTop" } },
        },
        ...(cmp
          ? [{ name: scenarioName(f, s.pv_kwp, cmp.battery_kwh), type: "line", data: cmp.cash_flow_eur, showSymbol: false, lineStyle: { width: 2, type: "dashed", color: c.secondary }, itemStyle: { color: c.secondary } }]
          : []),
      ],
    };

    const todayBill = s.bill_eur + s.saving_eur;
    const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0);

    return html`
      <div class="title">
        <h2>${scenarioName(f, s.pv_kwp, s.battery_kwh)}</h2>
        ${s.shift && hasPv ? html`<span class="tag">con spostamento carichi</span>` : nothing}
      </div>

      <div class="stats">
        ${hasPv
          ? html`
              ${this.stat(f.eur(s.bill_eur), "Bolletta annua", `oggi ${f.eur(todayBill)}`)}
              ${this.stat(f.eur(s.saving_eur), "Risparmio annuo", `−${f.pct(s.saving_eur / todayBill)} sulla bolletta`, s.saving_eur > 0)}
              ${this.stat(f.pct(s.self_sufficiency), "Autosufficienza", "oggi 0%")}
              ${this.stat(f.pct(s.self_consumption), "Autoconsumo", "della produzione FV")}
              ${this.stat(f.years(s.payback_years), "Rientro", `su ${f.eur(s.investment_eur)} di costo`)}
            `
          : html`
              ${this.stat(f.eur(s.bill_eur), "Bolletta annua", "incluse le quote fisse")}
              ${this.stat(f.kwh(e.consumption_kwh), "Consumo annuo", "tutto dalla rete")}
              ${this.stat(f.eur2(s.bill_eur / e.consumption_kwh), "Costo medio per kWh", "quote fisse comprese")}
            `}
      </div>

      <div class="stack" style="gap:16px">
        <h3>Bilancio annuo</h3>
        <div class="two">
          ${this.balance(f, "Consumo di casa", [
            { label: "FV diretto", kwh: sum(m.direct), color: c.solar },
            { label: "Dalla batteria", kwh: sum(m.battery), color: c.batteryOut },
            { label: "Dalla rete", kwh: e.import_kwh, color: c.grid },
          ])}
          ${hasPv
            ? this.balance(f, "Produzione FV", [
                { label: "Usata in casa o in batteria", kwh: e.pv_used_kwh, color: c.solar },
                { label: "Immessa in rete", kwh: e.export_kwh, color: c.gridReturn },
                { label: "Persa (limite immissione)", kwh: e.curtailed_kwh, color: c.error },
              ])
            : nothing}
        </div>
        <details class="defs" ?hidden=${!hasPv}>
          <summary>Come si calcolano autosufficienza e autoconsumo</summary>
          <div class="two">
            <div class="definition">
              <span class="strong">Autosufficienza</span>
              <span class="muted">Quanta parte dei consumi di casa copri da solo, con il FV e la batteria, senza prendere dalla rete.</span>
              <span class="small muted">(consumi − prelievo dalla rete) ÷ consumi</span>
              <span class="small">Qui: ${f.kwh(e.consumption_kwh - e.import_kwh)} su ${f.kwh(e.consumption_kwh)} = ${f.pct(s.self_sufficiency)}</span>
            </div>
            <div class="definition">
              <span class="strong">Autoconsumo</span>
              <span class="muted">Quanta parte della produzione FV usi in casa, subito o passando dalla batteria, invece di cederla alla rete.</span>
              <span class="small muted">(produzione − immessa − persa) ÷ produzione</span>
              <span class="small">${hasPv ? `Qui: ${f.kwh(e.pv_used_kwh)} su ${f.kwh(e.pv_kwh)} = ${f.pct(s.self_consumption)}` : "Senza FV non c'è produzione."}</span>
            </div>
          </div>
        </details>
      </div>

      <div class="two">
        <div class="stack">
          <h3>Come viene coperto il consumo (kWh/mese)</h3>
          <pv-chart .option=${coverage} height="260"></pv-chart>
          <span class="small muted">D'inverno la pompa di calore consuma molto quando il FV produce poco.</span>
        </div>
        ${hasPv
          ? html`<div class="stack">
              <h3>Dove va la produzione FV (kWh/mese)</h3>
              <pv-chart .option=${production} height="260"></pv-chart>
              <span class="small muted">
                L'energia immessa vale ${f.eur3(this.config.settings.tariff.export_price)}/kWh, quella autoconsumata evita
                ${f.eur3(this.config.derived.grid_price_eur_kwh)}/kWh
              </span>
            </div>`
          : nothing}
      </div>

      ${hasPv
        ? html`<div class="stack">
            <h2>Costi e rientro</h2>
            <div class="costs">
              <table>
                <thead>
                  <tr><th>Voce</th><th class="num">Importo</th></tr>
                </thead>
                <tbody>
                  ${this.detail.costs.items
                    .filter((i) => i.kind === "pv" || i.kind === "battery")
                    .map((i) => html`<tr><td>${this.costLabel(f, i)}</td><td class="num">${this.costAmount(f, i)}</td></tr>`)}
                  <tr class="total"><td>Costo stimato</td><td class="num">${f.eur(s.investment_eur)}</td></tr>
                  ${this.detail.costs.items
                    .filter((i) => i.kind !== "pv" && i.kind !== "battery")
                    .map((i) => html`<tr><td>${this.costLabel(f, i)}</td><td class="num">${this.costAmount(f, i)}</td></tr>`)}
                  <tr><td>Risparmio sulla bolletta, primo anno</td><td class="num">+${f.eur(s.saving_eur)}</td></tr>
                  <tr class="total"><td>Rientro</td><td class="num">${f.years(s.payback_years)}</td></tr>
                  <tr class="total"><td>Guadagno netto in ${this.config.horizon_years} anni</td><td class="num">${f.eur(s.gain_eur)}</td></tr>
                </tbody>
              </table>
              <div class="stack">
                <h3>Soldi recuperati nel tempo</h3>
                <pv-chart .option=${cash} height="280"></pv-chart>
                <span class="small muted">
                  Risparmi + detrazione − costi, cumulati. Dove la linea supera lo zero c'è il rientro; i gradini verso il basso sono i ricambi.
                  ${cmp ? `Il confronto con lo stesso FV ${cmp.battery_kwh > 0 ? `con batteria ${cmp.battery_kwh} kWh` : "senza batteria"} dice se la batteria si ripaga nella sua vita.` : ""}
                </span>
              </div>
            </div>
          </div>`
        : nothing}
    `;
  }
}

if (!customElements.get("pv-scenario-detail")) customElements.define("pv-scenario-detail", PvScenarioDetail);
