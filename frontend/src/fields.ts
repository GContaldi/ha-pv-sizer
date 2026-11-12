import { html, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { parseNumber } from "./format";

export function numberField(
  label: string,
  value: number,
  suffix: string,
  locale: string,
  onCommit: (v: number) => void,
): TemplateResult {
  const text = value.toLocaleString(locale, { maximumFractionDigits: 6, useGrouping: false });
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <input
        type="text"
        inputmode="decimal"
        .value=${live(text)}
        @change=${(e: Event) => {
          const input = e.target as HTMLInputElement;
          const v = parseNumber(input.value);
          if (v === null) input.value = text;
          else onCommit(v);
        }}
      />
      <span class="field-suffix">${suffix}</span>
    </label>
  `;
}

export function selectField(
  label: string,
  value: string,
  options: { value: string; label: string }[],
  onChange: (v: string) => void,
): TemplateResult {
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
        ${options.map((o) => html`<option value=${o.value} ?selected=${o.value === value}>${o.label}</option>`)}
      </select>
    </label>
  `;
}

export function switchField(label: string, checked: boolean, onChange: (v: boolean) => void): TemplateResult {
  return html`
    <div class="field">
      <span class="field-label">${label}</span>
      <label class="switch">
        <input type="checkbox" .checked=${live(checked)} @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)} />
        <span></span>
      </label>
    </div>
  `;
}

export const hourOptions = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: `${String(from + i).padStart(2, "0")}:00` }));
