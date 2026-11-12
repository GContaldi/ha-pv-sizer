import { LitElement, css, html, type PropertyValues } from "lit";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

export interface ChartColors {
  font: string;
  text: string;
  secondary: string;
  divider: string;
  card: string;
  primary: string;
  solar: string;
  grid: string;
  gridReturn: string;
  batteryOut: string;
  batteryIn: string;
  error: string;
  palette: string[];
}

export function readColors(el: Element): ChartColors {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  const c = {
    font: s.fontFamily || "Roboto, sans-serif",
    text: v("--primary-text-color", "#e1e1e1"),
    secondary: v("--secondary-text-color", "#9b9b9b"),
    divider: v("--divider-color", "rgba(127,127,127,0.2)"),
    card: v("--card-background-color", "#1c1c1c"),
    primary: v("--primary-color", "#03a9f4"),
    solar: v("--energy-solar-color", "#ff9800"),
    grid: v("--energy-grid-consumption-color", "#488fc2"),
    gridReturn: v("--energy-grid-return-color", "#8353d1"),
    batteryOut: v("--energy-battery-out-color", "#4db6ac"),
    batteryIn: v("--energy-battery-in-color", "#f06292"),
    error: v("--error-color", "#db4437"),
  };
  return { ...c, palette: [c.primary, c.solar, c.batteryOut, c.gridReturn, c.grid, c.error] };
}

export function baseOption(
  c: ChartColors,
  opts: { categories: string[]; xName?: string; valueFormatter: (v: number) => string; axisFormatter: (v: number) => string },
): ChartOption {
  return {
    color: c.palette,
    textStyle: { color: c.secondary, fontFamily: c.font },
    grid: { left: 4, right: 12, top: 36, bottom: opts.xName ? 24 : 4, containLabel: true },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 16, textStyle: { color: c.secondary, fontFamily: c.font } },
    tooltip: {
      trigger: "axis",
      backgroundColor: c.card,
      borderColor: c.divider,
      textStyle: { color: c.text, fontFamily: c.font },
      valueFormatter: (v: unknown) => opts.valueFormatter(Number(v)),
    },
    xAxis: {
      type: "category",
      data: opts.categories,
      name: opts.xName,
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: { color: c.secondary },
      axisLine: { lineStyle: { color: c.divider } },
      axisTick: { show: false },
      axisLabel: { color: c.secondary },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: c.divider } },
      axisLabel: { color: c.secondary, formatter: (v: number) => opts.axisFormatter(v) },
    },
  };
}

export class PvChart extends LitElement {
  static properties = { option: { attribute: false }, height: { type: Number } };
  declare option?: ChartOption;
  declare height: number;
  private chart?: echarts.ECharts;
  private resizeObserver?: ResizeObserver;

  constructor() {
    super();
    this.height = 240;
  }

  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`<div style="width:100%;height:${this.height}px"></div>`;
  }

  firstUpdated() {
    this.initChart();
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated && !this.chart) this.initChart();
  }

  private initChart() {
    const el = this.renderRoot.querySelector("div") as HTMLDivElement;
    this.chart = echarts.init(el, undefined, { renderer: "svg" });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(el);
    if (this.option) this.chart.setOption(this.option, true);
  }

  updated(changed: PropertyValues<this>) {
    if (changed.has("option") && this.chart && this.option) this.chart.setOption(this.option, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }
}

if (!customElements.get("pv-chart")) customElements.define("pv-chart", PvChart);
