import { LitElement, css, html, nothing, unsafeCSS, type PropertyValues } from "lit";
import type { PanelConfig, Settings } from "../api/types";
import { formatters } from "../format";
import { shared } from "../styles";
import { SECTIONS, SECTION_GROUPS, sectionId, sectionStyles, type SectionContext, type SectionId, type SizeKind } from "./settings-sections";

const icon = (path: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='${path}'/%3E%3C/svg%3E")`;

/** The element that scrolls the page: the panel sits inside Home Assistant's own layout. */
function scroller(from: Element): Element {
  let node: Node | null = from;
  while (node) {
    if (node instanceof Element) {
      const overflow = getComputedStyle(node).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
    }
    node = node instanceof ShadowRoot ? node.host : node.parentNode;
  }
  return document.scrollingElement ?? document.documentElement;
}

export class PvSettingsPage extends LitElement {
  static properties = {
    config: { attribute: false },
    locale: { type: String },
    section: { type: String },
    busy: { type: Boolean },
    addingSize: { state: true },
    savedIn: { state: true },
  };
  declare config: PanelConfig;
  declare locale: string;
  /** Raw route section; unknown values show the index. */
  declare section?: string;
  declare busy: boolean;
  declare addingSize: SizeKind | null;
  /** Subpage whose last edit is being saved, for the "Salvato" status. */
  declare savedIn?: SectionId;
  private savedTimer?: number;
  private indexScroll = 0;
  /** Page on screen after the last render; null before the first one. */
  private shownSection: SectionId | undefined | null = null;

  constructor() {
    super();
    this.busy = false;
    this.addingSize = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.savedTimer);
  }

  static styles = [
    shared,
    sectionStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        --chevron-right: ${unsafeCSS(icon("M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"))};
        --arrow-back: ${unsafeCSS(icon("M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"))};
      }
      .group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .group + .group {
        margin-top: 8px;
      }
      .group-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--secondary-text-color);
        padding: 0 4px;
      }
      .card.list {
        padding: 0;
        overflow: hidden;
      }
      button.entry {
        font: inherit;
        color: inherit;
        text-align: left;
        width: 100%;
        min-height: 72px;
        padding: 12px 8px 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        border: none;
        background: none;
        cursor: pointer;
      }
      button.entry + button.entry {
        border-top: 1px solid var(--divider-color);
      }
      button.entry:hover {
        background: var(--secondary-background-color);
      }
      button.entry:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .entry-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .entry-title {
        font-size: 15px;
        font-weight: 500;
      }
      .entry-summary {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .warns {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
      }
      .warn {
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        padding: 0 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--warning-color) 22%, transparent);
      }
      .chevron,
      .back span {
        flex: none;
        width: 24px;
        height: 24px;
        background: var(--secondary-text-color);
        -webkit-mask: var(--chevron-right) center / 24px no-repeat;
        mask: var(--chevron-right) center / 24px no-repeat;
      }
      .subhead {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 48px;
        margin-left: -12px;
      }
      .subhead h2 {
        flex: 1;
        min-width: 0;
        font-size: 20px;
        line-height: 28px;
        font-weight: 400;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button.back {
        flex: none;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border: none;
        border-radius: 50%;
        background: none;
        cursor: pointer;
      }
      button.back:hover {
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
      }
      button.back:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .back span {
        background: var(--primary-text-color);
        -webkit-mask-image: var(--arrow-back);
        mask-image: var(--arrow-back);
      }
      .saved {
        flex: none;
        font-size: 12px;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .sections {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
    `,
  ];

  protected updated(changed: PropertyValues<this>) {
    if (changed.has("busy") && !this.busy && this.savedIn) {
      clearTimeout(this.savedTimer);
      this.savedTimer = window.setTimeout(() => (this.savedIn = undefined), 2500);
    }
    if (!this.config) return;
    const now = sectionId(this.section);
    if (this.shownSection !== null && this.shownSection === now) return;
    const first = this.shownSection === null;
    this.shownSection = now;
    scroller(this).scrollTop = now || first ? 0 : this.indexScroll;
  }

  private open(id: SectionId) {
    this.indexScroll = scroller(this).scrollTop;
    this.dispatchEvent(new CustomEvent<string>("navigate", { detail: `impostazioni/${id}`, bubbles: true, composed: true }));
  }

  private back() {
    this.dispatchEvent(new CustomEvent("navigate-back", { bubbles: true, composed: true }));
  }

  private markSaved(id: SectionId) {
    clearTimeout(this.savedTimer);
    this.savedIn = id;
  }

  private savedBadge(id: SectionId) {
    if (this.savedIn !== id) return nothing;
    return html`<span class="saved" role="status">${this.busy ? "Salvato · ricalcolo…" : "Salvato"}</span>`;
  }

  private emit(settings: Settings) {
    const id = sectionId(this.section);
    if (id) this.markSaved(id);
    this.dispatchEvent(new CustomEvent<Settings>("settings-change", { detail: settings, bubbles: true, composed: true }));
  }

  private async setAdding(kind: SizeKind | null) {
    this.addingSize = kind;
    if (!kind) return;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLInputElement>(".chips input")?.focus();
  }

  private renderIndex(ctx: SectionContext) {
    return SECTION_GROUPS.map(
      (g) => html`<section class="group">
        <h2 class="group-title">${g.title}</h2>
        <div class="card list">
          ${g.ids.map((id) => {
            const s = SECTIONS[id];
            const warnings = s.warnings(ctx);
            return html`<button class="entry" @click=${() => this.open(id)}>
              <span class="entry-text">
                <span class="entry-title">${s.title}</span>
                <span class="small muted entry-summary">${s.summary(ctx)}</span>
                ${warnings.length ? html`<span class="warns">${warnings.map((w) => html`<span class="warn">${w}</span>`)}</span>` : nothing}
              </span>
              <span class="chevron" aria-hidden="true"></span>
            </button>`;
          })}
        </div>
      </section>`,
    );
  }

  private renderSubpage(id: SectionId, ctx: SectionContext) {
    return html`
      <div class="subhead">
        <button class="back" aria-label="Indietro" @click=${this.back}><span></span></button>
        <h2>${SECTIONS[id].title}</h2>
        ${this.savedBadge(id)}
      </div>
      <div class="sections" @loads-change=${() => this.markSaved("carichi")}>${SECTIONS[id].render(ctx)}</div>
    `;
  }

  render() {
    if (!this.config) return nothing;
    const ctx: SectionContext = {
      config: this.config,
      locale: this.locale,
      f: formatters(this.locale),
      emit: (s) => this.emit(s),
      sizes: { adding: this.addingSize, setAdding: (k) => void this.setAdding(k) },
    };
    const id = sectionId(this.section);
    return id ? this.renderSubpage(id, ctx) : this.renderIndex(ctx);
  }
}

if (!customElements.get("pv-settings-page")) customElements.define("pv-settings-page", PvSettingsPage);
