import { css } from "lit";

export const shared = css`
  :host {
    color: var(--primary-text-color);
    font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif);
    font-size: 14px;
    line-height: 20px;
  }
  h2 {
    font-size: 18px;
    line-height: 24px;
    font-weight: 500;
    margin: 0;
  }
  h3 {
    font-size: 15px;
    line-height: 22px;
    font-weight: 500;
    margin: 0;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--secondary-text-color);
  }
  .small {
    font-size: 12px;
    line-height: 16px;
  }
  .strong {
    font-weight: 500;
  }
  .card {
    background: var(--card-background-color);
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
    padding: 16px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--secondary-text-color);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pill {
    font: inherit;
    font-size: 13px;
    color: var(--primary-text-color);
    background: transparent;
    border: 1px solid var(--divider-color);
    border-radius: 999px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .pill.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .pill.sm {
    font-size: 12px;
    padding: 2px 10px;
  }
  button.btn {
    font: inherit;
    font-size: 13px;
    color: var(--primary-color);
    background: transparent;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    padding: 4px 12px;
    cursor: pointer;
  }
  button.btn.ghost {
    border-color: transparent;
    color: var(--secondary-text-color);
  }
  input[type="text"],
  select {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 6px;
    height: 30px;
    padding: 0 8px;
    font: inherit;
    font-size: 13px;
    box-sizing: border-box;
  }
  input[type="text"]:focus,
  select:focus {
    outline: 2px solid var(--primary-color);
    outline-offset: -1px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--divider-color);
    text-align: left;
    vertical-align: top;
  }
  th {
    color: var(--secondary-text-color);
    font-weight: 500;
    font-size: 12px;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tr.total td {
    font-weight: 500;
  }
  .banner {
    border-radius: 8px;
    padding: 10px 14px;
    border: 1px solid var(--divider-color);
    background: color-mix(in srgb, var(--warning-color) 12%, transparent);
  }
  .banner.info {
    background: color-mix(in srgb, var(--info-color, var(--primary-color)) 10%, transparent);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }
  .field-label {
    flex: 1;
    font-size: 13px;
    color: var(--secondary-text-color);
  }
  .field input[type="text"] {
    width: 84px;
    text-align: right;
  }
  .field-suffix {
    width: 72px;
    font-size: 12px;
    color: var(--secondary-text-color);
  }
  .switch {
    position: relative;
    width: 34px;
    height: 20px;
    flex: none;
  }
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .switch span {
    position: absolute;
    inset: 0;
    border-radius: 10px;
    background: var(--disabled-text-color, #888);
    cursor: pointer;
    transition: background 0.15s;
  }
  .switch span::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    left: 3px;
    top: 3px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .switch input:checked + span {
    background: var(--primary-color);
  }
  .switch input:checked + span::after {
    transform: translateX(14px);
  }
`;
