import { html, nothing, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { parseNumber } from "./format";

export interface NumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  hint?: string;
  /** Makes the field optional: emptying it calls this instead of restoring the value. */
  onClear?: () => void;
  placeholder?: string;
}

const fieldText = (label: string, hint?: string) =>
  html`<span class="field-text"><span class="field-label">${label}</span>${hint ? html`<span class="field-hint">${hint}</span>` : nothing}</span>`;

export function numberField(
  label: string,
  value: number | null,
  suffix: string,
  locale: string,
  onCommit: (v: number) => void,
  opts: NumberOptions = {},
): TemplateResult {
  const show = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 4, useGrouping: false });
  const text = value === null ? "" : show(value);
  const range = opts.min !== undefined && opts.max !== undefined ? `da ${show(opts.min)} a ${show(opts.max)}` : "";
  return html`
    <label class="field">
      ${fieldText(label, opts.hint)}
      <span class="field-control">
        <input
          type="text"
          inputmode="decimal"
          title=${range}
          placeholder=${opts.placeholder ?? ""}
          .value=${live(text)}
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            let v = parseNumber(input.value);
            if (v === null && input.value.trim() === "" && opts.onClear) {
              if (value !== null) opts.onClear();
              return;
            }
            if (v === null) {
              input.value = text;
              return;
            }
            if (opts.integer) v = Math.round(v);
            if (opts.min !== undefined) v = Math.max(opts.min, v);
            if (opts.max !== undefined) v = Math.min(opts.max, v);
            input.value = show(v);
            if (v !== value) onCommit(v);
          }}
        />
        <span class="field-suffix">${suffix}</span>
      </span>
    </label>
  `;
}

export function selectField(
  label: string,
  value: string,
  options: { value: string; label: string }[],
  onChange: (v: string) => void,
  hint?: string,
  wide = false,
): TemplateResult {
  return html`
    <label class="field">
      ${fieldText(label, hint)}
      <span class="field-control ${wide ? "wide" : ""}">
        <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
          ${options.map((o) => html`<option value=${o.value} ?selected=${o.value === value}>${o.label}</option>`)}
        </select>
      </span>
    </label>
  `;
}

export function switchField(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): TemplateResult {
  return html`
    <label class="field">
      ${fieldText(label, hint)}
      <span class="switch">
        <input type="checkbox" .checked=${live(checked)} @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)} />
        <span></span>
      </span>
    </label>
  `;
}

export const hourOptions = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: `${String(from + i).padStart(2, "0")}:00` }));
