import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { fetchConfig, fetchResults, fetchScenario, updateLoads, updateSettings, type HomeAssistant } from "./api/client";
import type { LoadDef, PanelConfig, Results, ScenarioDetail, Settings } from "./api/types";
import { metrics, type MetricKey, type Selection } from "./components/scenario-grid";
import { shared } from "./styles";
import "./components/scenario-grid";
import "./components/scenario-detail";
import "./components/shift-savings";
import "./components/settings-page";

type Tab = "scenari" | "impostazioni";

const TABS: { key: Tab; label: string }[] = [
  { key: "scenari", label: "Scenari" },
  { key: "impostazioni", label: "Impostazioni" },
];

/** `#impostazioni/carichi` → tab + section to scroll to. */
function readRoute(): { tab: Tab; section?: string } {
  const [tab, section] = location.hash.replace(/^#/, "").split("/");
  return tab === "impostazioni" ? { tab, section: section || undefined } : { tab: "scenari" };
}

export class PvSizerPanel extends LitElement {
  static properties = {
    hass: { attribute: false },
    narrow: { type: Boolean, reflect: true },
    tab: { state: true },
    section: { state: true },
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
  declare section?: string;
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
    this.metric = "saving";
    this.shift = false;
    this.selected = { pv_kwp: 6, battery_kwh: 5 };
    this.busy = false;
    this.themeKey = "";
    this.onRoute();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onRoute);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onRoute);
  }

  private onRoute = () => {
    const { tab, section } = readRoute();
    this.tab = tab;
    this.section = section;
  };

  /** Writing the hash adds a history entry, so the browser Back button returns here. */
  private go(route: string) {
    if (location.hash === `#${route}`) this.onRoute();
    else location.hash = route;
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
        border-top: 3px solid transparent;
        border-bottom: 3px solid transparent;
        height: 56px;
        padding: 0 16px;
        cursor: pointer;
      }
      .tab.active {
        opacity: 1;
        font-weight: 500;
        border-bottom-color: var(--app-header-selection-bar-color, currentColor);
      }
      .tab:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: -6px;
        border-radius: 8px;
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
        gap: 12px;
        min-height: 48px;
        padding: 0 4px;
        font-size: 14px;
        white-space: nowrap;
        cursor: pointer;
      }
      #grid {
        scroll-margin-top: 16px;
      }
      .segmented {
        display: flex;
        max-width: 100%;
        overflow-x: auto;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
      }
      .segmented button {
        font: inherit;
        font-size: 14px;
        flex: none;
        height: 40px;
        padding: 0 16px;
        border: none;
        border-left: 1px solid var(--divider-color);
        background: none;
        color: var(--primary-text-color);
        white-space: nowrap;
        cursor: pointer;
      }
      .segmented button:first-child {
        border-left: none;
      }
      .segmented button[aria-pressed="true"] {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
        color: var(--primary-color);
        font-weight: 500;
      }
      .segmented button:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
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

  private shiftToggle() {
    return html`<label class="shift">
      <span>Includi spostamento carichi</span>
      <span class="switch">
        <input type="checkbox" .checked=${this.shift} @change=${(e: Event) => this.onShift((e.target as HTMLInputElement).checked)} />
        <span></span>
      </span>
    </label>`;
  }

  private scrollToGrid() {
    this.renderRoot.querySelector("#grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private renderScenari() {
    if (!this.results || !this.config) return nothing;
    return html`
      <div class="stack" id="grid" style="gap:12px">
        <div class="row">
          <div class="segmented" role="group" aria-label="Misura mostrata nella tabella">
            ${metrics(this.config.horizon_years).map(
              (m) => html`<button aria-pressed=${this.metric === m.key} @click=${() => (this.metric = m.key)}>${m.label}</button>`,
            )}
          </div>
          <span class="spacer"></span>
          ${this.shiftToggle()}
        </div>
        <pv-scenario-grid
          .results=${this.results}
          .pvSizes=${this.config.settings.scenarios.pv_sizes_kwp}
          .batterySizes=${[0, ...this.config.settings.scenarios.battery_sizes_kwh]}
          .metric=${this.metric}
          .shift=${this.shift}
          .selected=${this.selected}
          .locale=${this.locale}
          .horizonYears=${this.config.horizon_years}
          @scenario-select=${this.onSelect}
        ></pv-scenario-grid>
      </div>
      ${this.detail
        ? html`<pv-scenario-detail
              .detail=${this.detail}
              .config=${this.config}
              .locale=${this.locale}
              .themeKey=${this.themeKey}
              @change-scenario=${this.scrollToGrid}
            ></pv-scenario-detail>
            <pv-shift-savings
              .detail=${this.detail}
              .config=${this.config}
              .results=${this.results}
              .locale=${this.locale}
              .themeKey=${this.themeKey}
              .shift=${this.shift}
              @shift-change=${(e: CustomEvent<boolean>) => this.onShift(e.detail)}
              @navigate=${(e: CustomEvent<string>) => this.go(e.detail)}
            ></pv-shift-savings>`
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
          ${TABS.map(
            (t) =>
              html`<button class="tab ${this.tab === t.key ? "active" : ""}" aria-current=${this.tab === t.key ? "page" : "false"} @click=${() => this.go(t.key)}>
                ${t.label}
              </button>`,
          )}
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
        ${this.tab === "impostazioni" && c
          ? html`<pv-settings-page
              .config=${c}
              .locale=${this.locale}
              .section=${this.section}
              @settings-change=${this.onSettings}
              @loads-change=${this.onLoads}
            ></pv-settings-page>`
          : nothing}
      </main>
    `;
  }
}

if (!customElements.get("pv-sizer-panel")) customElements.define("pv-sizer-panel", PvSizerPanel);
