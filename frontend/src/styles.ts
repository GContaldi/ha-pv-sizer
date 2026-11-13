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
  /* The native popup can open far from the field in webviews; draw the list in the page where supported. */
  @supports (appearance: base-select) {
    select,
    select::picker(select) {
      appearance: base-select;
    }
    select {
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
    }
    select option {
      white-space: normal;
    }
    /* Fields with long values use <button><selectedcontent> so the text ellipsizes and the chevron stays. */
    select > button {
      all: unset;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
    }
    selectedcontent {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    select::picker-icon {
      content: "";
      flex: none;
      width: 20px;
      height: 20px;
      margin-left: auto;
      background: var(--secondary-text-color);
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z'/%3E%3C/svg%3E")
        center / 20px no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z'/%3E%3C/svg%3E")
        center / 20px no-repeat;
      transition: transform 0.15s;
    }
    select:open::picker-icon {
      transform: rotate(180deg);
    }
    select::picker(select) {
      margin-top: 4px;
      padding: 4px 0;
      max-height: 320px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }
    select option {
      display: flex;
      align-items: center;
      min-height: 40px;
      padding: 0 12px;
      font-size: 14px;
      cursor: pointer;
    }
    select option::checkmark {
      display: none;
    }
    select option:hover,
    select option:focus-visible {
      background: var(--secondary-background-color);
      outline: none;
    }
    select option:checked {
      color: var(--primary-color);
      font-weight: 500;
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
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
  button.link {
    font: inherit;
    font-weight: 500;
    color: var(--primary-color);
    background: none;
    border: none;
    border-radius: 8px;
    min-height: 40px;
    padding: 0 12px;
    cursor: pointer;
  }
  button.link:hover {
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }
  button.link:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
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
