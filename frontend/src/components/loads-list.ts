import { LitElement, css, html, nothing } from "lit";
import type { LoadDef, PanelConfig } from "../api/types";
import { formatters, type Formatters } from "../format";
import { effectiveUsage } from "../loads";
import { shared } from "../styles";
import type { PvLoadDialog } from "./load-dialog";
import "./load-dialog";

export class PvLoadsList extends LitElement {
  static properties = { config: { attribute: false }, locale: { type: String } };
  declare config: PanelConfig;
  declare locale: string;

  static styles = [
    shared,
    css`
      :host {
        display: block;
      }
      ul {
        list-style: none;
        margin: 0 -16px;
        padding: 0;
      }
      li + li {
        border-top: 1px solid var(--divider-color);
      }
      button.load {
        font: inherit;
        color: inherit;
        text-align: left;
        width: 100%;
        min-height: 72px;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 16px;
        background: none;
        border: none;
        cursor: pointer;
      }
      button.load:hover {
        background: var(--secondary-background-color);
      }
      button.load:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .name {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 15px;
        font-weight: 500;
      }
      .warn {
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        padding: 0 8px;
        border-radius: 999px;
        color: var(--primary-text-color);
        background: color-mix(in srgb, var(--warning-color) 22%, transparent);
      }
      .edit {
        flex: none;
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-color);
      }
      .empty {
        padding: 8px 0 16px;
      }
      button.add {
        font: inherit;
        font-weight: 500;
        color: var(--primary-color);
        background: none;
        border: none;
        border-radius: 8px;
        min-height: 44px;
        padding: 0 12px;
        margin: 8px 0 0 -12px;
        cursor: pointer;
      }
      button.add:hover {
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      }
    `,
  ];

  private get dialog(): PvLoadDialog {
    return this.renderRoot.querySelector("pv-load-dialog") as PvLoadDialog;
  }

  private usageLine(f: Formatters, l: LoadDef): string {
    const use = effectiveUsage(l, this.config.detected);
    const usage = `${f.num(use.perWeek, 0)}/sett · ${f.num(use.kwh)} kWh`;
    if (l.source === "estimate") return `Stima · ${usage}`;
    if (!l.sensor_entity_id) return `Sensore da scegliere · intanto stima: ${usage}`;
    const sensor = this.config.sensor_options.find((o) => o.entity_id === l.sensor_entity_id)?.name ?? l.sensor_entity_id;
    return `Sensore · ${sensor} · ${usage}`;
  }

  private shiftLine(l: LoadDef): string {
    if (!l.shiftable) return "Resta agli orari di oggi";
    const after = l.after ? this.config.loads.find((x) => x.id === l.after)?.name : undefined;
    return `Spostabile ${l.window_start}–${l.window_end}${after ? ` · dopo ${after}` : ""}`;
  }

  render() {
    if (!this.config) return nothing;
    const f = formatters(this.locale);
    const loads = this.config.loads;
    return html`
      ${loads.length
        ? html`<ul>
            ${loads.map(
              (l) => html`<li>
                <button class="load" aria-label="Modifica ${l.name}" @click=${() => this.dialog.openEdit(l.id)}>
                  <span class="text">
                    <span class="name">${l.name}${l.source === "sensor" && !l.sensor_entity_id ? html`<span class="warn">Sensore da scegliere</span>` : nothing}</span>
                    <span class="small muted">${this.usageLine(f, l)}</span>
                    <span class="small muted">${this.shiftLine(l)}</span>
                  </span>
                  <span class="edit" aria-hidden="true">Modifica</span>
                </button>
              </li>`,
            )}
          </ul>`
        : html`<p class="muted empty">Nessun carico. Aggiungi gli elettrodomestici che potresti far partire quando c'è sole.</p>`}
      <button class="add" @click=${() => this.dialog.openNew()}>+ Aggiungi carico</button>
      <pv-load-dialog .config=${this.config} .locale=${this.locale}></pv-load-dialog>
    `;
  }
}

if (!customElements.get("pv-loads-list")) customElements.define("pv-loads-list", PvLoadsList);
