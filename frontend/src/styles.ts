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
  input[type="text"],
  select {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    height: 40px;
    padding: 0 10px;
    font: inherit;
    font-size: 14px;
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
    gap: 16px;
    min-height: 52px;
    padding: 6px 0;
    border-bottom: 1px solid var(--divider-color);
    box-sizing: border-box;
  }
  .field:last-child {
    border-bottom: none;
  }
  .field-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .field-label {
    font-size: 14px;
  }
  .field-hint {
    font-size: 12px;
    line-height: 16px;
    color: var(--secondary-text-color);
  }
  .field-control {
    flex: none;
    width: 180px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .field-control input[type="text"] {
    flex: 1;
    min-width: 0;
    text-align: right;
  }
  .field-control select {
    flex: 1;
    min-width: 0;
  }
  .field-suffix {
    flex: none;
    width: 64px;
    font-size: 12px;
    color: var(--secondary-text-color);
  }
  .switch {
    display: inline-block;
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
  .switch input:focus-visible + span {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
  }
`;
