import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { fetchConfig, fetchResults, fetchScenario, updateLoads, updateSettings, type HomeAssistant } from "./api/client";
import type { LoadDef, PanelConfig, Results, ScenarioDetail, Settings } from "./api/types";
import { METRICS, type MetricKey, type Selection } from "./components/scenario-grid";
import { shared } from "./styles";
import "./components/scenario-grid";
import "./components/scenario-detail";
import "./components/loads-editor";
import "./components/settings-form";

type Tab = "scenari" | "carichi" | "impostazioni";

const TABS: { key: Tab; label: string }[] = [
  { key: "scenari", label: "Scenari" },
  { key: "carichi", label: "Carichi" },
  { key: "impostazioni", label: "Impostazioni" },
];

export class PvSizerPanel extends LitElement {
  static properties = {
    hass: { attribute: false },
    narrow: { type: Boolean, reflect: true },
    tab: { state: true },
    config: { state: true },
    results: { state: true },
    detail: { state: true },
    metric: { state: true },
    shift: { state: true },
    selected: { state: true },
    busy: { state: true },
    error: { state: true },
    themeKey: { state: true },
  };
  declare hass?: HomeAssistant;
  declare narrow: boolean;
  declare tab: Tab;
  declare config?: PanelConfig;
  declare results?: Results;
  declare detail?: ScenarioDetail;
  declare metric: MetricKey;
  declare shift: boolean;
  declare selected: Selection;
  declare busy: boolean;
  declare error?: string;
  declare themeKey: string;
  private started = false;
  private detailRequest = 0;

  constructor() {
    super();
    this.narrow = false;
    this.tab = "scenari";
    this.metric = "saving";
    this.shift = false;
    this.selected = { pv_kwp: 6, battery_kwh: 5 };
    this.busy = false;
    this.themeKey = "";
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        min-height: 100%;
        background: var(--primary-background-color);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        height: 56px;
        padding: 0 12px;
        border-bottom: 1px solid var(--divider-color);
        background: var(--app-header-background-color, var(--primary-background-color));
        color: var(--app-header-text-color, var(--primary-text-color));
      }
      .title {
        font-size: 20px;
        font-weight: 400;
        margin-left: 4px;
      }
      .tabs {
        display: flex;
        gap: 4px;
        margin-left: 24px;
      }
      .tab {
        font: inherit;
        font-size: 14px;
        color: inherit;
        opacity: 0.7;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        height: 56px;
        padding: 0 12px;
        cursor: pointer;
      }
      .tab.active {
        opacity: 1;
        border-bottom-color: currentColor;
      }
      .busy {
        font-size: 12px;
        opacity: 0.7;
      }
      main {
        container-type: inline-size;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 16px 48px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .demo {
        padding: 6px 12px;
      }
      .shift {
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        cursor: pointer;
      }
      :host([narrow]) .tabs {
        margin-left: 8px;
      }
      :host([narrow]) .tab {
        padding: 0 8px;
      }
    `,
  ];

  protected willUpdate(changed: PropertyValues<this>) {
    if (!changed.has("hass") || !this.hass) return;
    // HA re-assigns `hass` on every state change; only theme changes matter here.
    const themeKey = this.hass.themes?.darkMode ? "dark" : "light";
    if (themeKey !== this.themeKey) this.themeKey = themeKey;
    if (!this.started) {
      this.started = true;
      void this.refresh();
    }
  }

  private get locale(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "it";
  }

  private async run<T>(work: () => Promise<T>): Promise<T | undefined> {
    this.busy = true;
    try {
      const out = await work();
      this.error = undefined;
      return out;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      return undefined;
    } finally {
      this.busy = false;
    }
  }

  private async refresh(config?: PanelConfig) {
    const hass = this.hass!;
    await this.run(async () => {
      const [cfg, results] = await Promise.all([config ? Promise.resolve(config) : fetchConfig(hass), fetchResults(hass)]);
      this.config = cfg;
      this.results = results;
    });
    await this.loadDetail();
  }

  private async loadDetail() {
    const request = ++this.detailRequest;
    const detail = await this.run(() => fetchScenario(this.hass!, { ...this.selected, shift: this.shift }));
    if (!detail || request !== this.detailRequest) return;
    this.detail = detail;
    // The backend falls back to another scenario when the selected size was removed.
    const { pv_kwp, battery_kwh } = detail.summary;
    if (pv_kwp !== this.selected.pv_kwp || battery_kwh !== this.selected.battery_kwh) this.selected = { pv_kwp, battery_kwh };
  }

  private onSelect(e: CustomEvent<Selection>) {
    this.selected = e.detail;
    void this.loadDetail();
  }

  private onShift(checked: boolean) {
    this.shift = checked;
    void this.loadDetail();
  }

  private async onSettings(e: CustomEvent<Settings>) {
    const cfg = await this.run(() => updateSettings(this.hass!, e.detail));
    if (cfg) await this.refresh(cfg);
  }

  private async onLoads(e: CustomEvent<LoadDef[]>) {
    const cfg = await this.run(() => updateLoads(this.hass!, e.detail));
    if (cfg) await this.refresh(cfg);
  }

  private renderScenari() {
    if (!this.results || !this.config) return nothing;
    return html`
      <div class="stack" style="gap:12px">
        <div class="row">
          ${METRICS.map(
            (m) => html`<button class="pill ${this.metric === m.key ? "active" : ""}" @click=${() => (this.metric = m.key)}>${m.label}</button>`,
          )}
          <span class="spacer"></span>
          <label class="shift">
            <span class="small muted">Con spostamento carichi</span>
            <span class="switch">
              <input type="checkbox" .checked=${this.shift} @change=${(e: Event) => this.onShift((e.target as HTMLInputElement).checked)} />
              <span></span>
            </span>
          </label>
        </div>
        <pv-scenario-grid
          .results=${this.results}
          .pvSizes=${this.config.settings.scenarios.pv_sizes_kwp}
          .batterySizes=${[0, ...this.config.settings.scenarios.battery_sizes_kwh]}
          .metric=${this.metric}
          .shift=${this.shift}
          .selected=${this.selected}
          .locale=${this.locale}
          @scenario-select=${this.onSelect}
        ></pv-scenario-grid>
        <span class="small muted">Colore più intenso = migliore per la misura scelta. Clicca una casella per vederne il dettaglio.</span>
      </div>
      ${this.detail
        ? html`<pv-scenario-detail .detail=${this.detail} .config=${this.config} .locale=${this.locale} .themeKey=${this.themeKey}></pv-scenario-detail>`
        : nothing}
    `;
  }

  render() {
    const c = this.config;
    return html`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Fotovoltaico</div>
        <nav class="tabs">
          ${TABS.map((t) => html`<button class="tab ${this.tab === t.key ? "active" : ""}" @click=${() => (this.tab = t.key)}>${t.label}</button>`)}
        </nav>
        <span class="spacer"></span>
        ${this.busy ? html`<span class="busy">Calcolo…</span>` : nothing}
      </div>
      <main>
        ${this.error ? html`<div class="banner"><span class="strong">Errore:</span> ${this.error}</div>` : nothing}
        ${c?.data.source === "demo"
          ? html`<div class="banner demo small">
              <span class="strong">Dati demo</span>
              <span class="muted">· consumi e produzione simulati, solo per provare l'interfaccia</span>
            </div>`
          : nothing}
        ${this.tab === "scenari" ? this.renderScenari() : nothing}
        ${this.tab === "carichi" && c && this.detail && this.results
          ? html`<pv-loads-editor
              .config=${c}
              .detail=${this.detail}
              .results=${this.results}
              .locale=${this.locale}
              .themeKey=${this.themeKey}
              @loads-change=${this.onLoads}
              @navigate=${(e: CustomEvent<Tab>) => (this.tab = e.detail)}
            ></pv-loads-editor>`
          : nothing}
        ${this.tab === "impostazioni" && c
          ? html`<pv-settings-form .config=${c} .locale=${this.locale} @settings-change=${this.onSettings}></pv-settings-form>`
          : nothing}
      </main>
    `;
  }
}

if (!customElements.get("pv-sizer-panel")) customElements.define("pv-sizer-panel", PvSizerPanel);
