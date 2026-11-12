// Development-only stand-in for the Python integration. Implements the
// WebSocket contract in src/api/types.ts on synthetic data; never bundled.
import type {
  CellSummary,
  CostItem,
  LoadDef,
  LoadDetected,
  LoadValue,
  PanelConfig,
  Results,
  ScenarioDetail,
  Settings,
  UsualTime,
} from "../src/api/types";
import { normalizeSizes } from "../src/scenario-sizes";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Typical yield for inland Salerno, south-facing 30°, ~14% losses: ~1,470 kWh/kWp/yr.
const PV_KWH_PER_KWP = [72, 85, 118, 138, 158, 168, 180, 167, 132, 108, 76, 64];
const DAY_LENGTH_H = [9.4, 10.5, 11.9, 13.3, 14.5, 15.1, 14.8, 13.8, 12.4, 11.0, 9.8, 9.1];
const CLEAR_SKY_PROB = [0.45, 0.5, 0.55, 0.6, 0.7, 0.85, 0.92, 0.9, 0.75, 0.6, 0.45, 0.4];
const DEMO_MONTHLY_KWH = [720, 640, 520, 400, 360, 420, 560, 560, 420, 400, 520, 700];
const HOURS = 8760;
const HORIZON_YEARS = 25;
const DST_START_DAY = 86;
const DST_END_DAY = 303;
const BASE_KW = 0.22;
const COOKING_KWH_DAY = 1.5;
const OTHER_KWH_DAY = 1.6;
const STORAGE_KEY = "pv-sizer-demo-v1";

const normalize = (shape: number[]) => {
  const s = shape.reduce((a, b) => a + b, 0);
  return shape.map((v) => v / s);
};
const HEAT_SHAPE = normalize([0.9, 0.9, 0.95, 1, 1.1, 1.3, 1.5, 1.5, 1.3, 1.0, 0.8, 0.6, 0.5, 0.5, 0.55, 0.65, 0.8, 1.0, 1.2, 1.25, 1.2, 1.1, 1.0, 0.95]);
const COOL_SHAPE = normalize([0.3, 0.25, 0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.3, 1.5, 1.7, 1.8, 1.8, 1.7, 1.5, 1.3, 1.1, 0.9, 0.6, 0.4]);
const OTHER_SHAPE = normalize([0.3, 0.2, 0.15, 0.15, 0.15, 0.2, 0.5, 0.8, 0.7, 0.6, 0.6, 0.6, 0.7, 0.7, 0.6, 0.6, 0.7, 0.9, 1.2, 1.5, 1.6, 1.5, 1.2, 0.7]);
const COOK_WEEKDAY = normalize([0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.15, 0.35, 0, 0, 0, 0, 0, 0.4, 0.5, 0, 0, 0]);
const COOK_WEEKEND = normalize([0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.3, 0.5, 0, 0, 0, 0, 0, 0.2, 0.4, 0, 0, 0]);
const USUAL_TIME_RANGE: Record<UsualTime, [number, number]> = {
  any: [0, 24],
  night: [0, 6],
  morning: [6, 9],
  afternoon: [13, 17],
  evening: [18, 23],
};

export const DEFAULT_SETTINGS: Settings = {
  tariff: { energy_price: 0.16375, excise: 0.0227, vat_pct: 10, fixed_monthly: 14.17, power_fee: 1.976667, power_kw: 6, export_price: 0.09 },
  system: { cost_per_kwp: 1500, cost_per_kwh: 550, deduction_pct: 50, battery_power_kw: 5, usable_pct: 90, efficiency_pct: 90, export_limit_kw: 6 },
  lifetime: { degradation_pct: 0.5, price_increase_pct: 0, battery_life_years: 12, inverter_cost: 1200, inverter_year: 12 },
  scenarios: { pv_sizes_kwp: [3, 4.5, 6, 7.5, 9], battery_sizes_kwh: [5, 10, 15] },
};

function withDefaults(s: Partial<Settings> | undefined): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!s) return d;
  return {
    tariff: { ...d.tariff, ...s.tariff },
    system: { ...d.system, ...s.system },
    lifetime: { ...d.lifetime, ...s.lifetime },
    scenarios: normalizeSizes({ ...d.scenarios, ...s.scenarios }, d.scenarios),
  };
}

const SENSOR_OPTIONS = [
  { entity_id: "sensor.demo_lavanderia_energia", name: "Pinza NodOn · lavanderia (demo)" },
  { entity_id: "sensor.demo_lavastoviglie_energia", name: "Presa smart · lavastoviglie (demo)" },
  { entity_id: "sensor.demo_acs_energia", name: "Daikin Onecta · energia ACS (demo)" },
];

export const DEFAULT_LOADS: LoadDef[] = [
  { id: "lavatrice", name: "Lavatrice", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 0.9, duration_h: 2, cycles_per_week: 4, usual_time: "any", shiftable: true, window_start: 9, window_end: 18, after: null },
  { id: "asciugatrice", name: "Asciugatrice", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 1.6, duration_h: 2, cycles_per_week: 4, usual_time: "any", shiftable: true, window_start: 9, window_end: 18, after: "lavatrice" },
  { id: "lavastoviglie", name: "Lavastoviglie", source: "estimate", sensor_entity_id: null, kwh_per_cycle: 1.0, duration_h: 3, cycles_per_week: 5, usual_time: "evening", shiftable: true, window_start: 9, window_end: 18, after: null },
  { id: "acs", name: "Acqua calda (PDC)", source: "sensor", sensor_entity_id: "sensor.demo_acs_energia", kwh_per_cycle: 2.4, duration_h: 2, cycles_per_week: 7, usual_time: "morning", shiftable: true, window_start: 10, window_end: 16, after: null },
];

type Prices = { grid: number; fixedAnnual: number; rid: number };
type BatteryCfg = { powerKw: number; usable: number; eff: number; exportLimit: number };
type LoadCfg = { id: string; kwh: number; hours: number; perWeek: number; usual: UsualTime; shiftable: boolean; ws: number; we: number; after: number };
type Cycle = { load: number; start: number; hours: number; kw: number; pairOf: number };
type Base = { load0: Float64Array; pv1: Float64Array; cycles: Cycle[]; monthOfHour: Uint8Array };
type PerLoad = { cost: number[]; count: number[] };
type Sim = {
  cons: number; pv: number; imp: number; exp: number; curt: number; pvSelf: number;
  mDirect: number[]; mBatt: number[]; mImp: number[]; mPvSelf: number[]; mExp: number[]; mCurt: number[];
};
type Entry = { sim: Sim; perLoad: PerLoad };
type CashFlow = { cumulative: number[]; payback: number | null; deductionPerYear: number; replacements: number[] };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toLoadCfgs(loads: LoadDef[]): LoadCfg[] {
  return loads.map((l) => {
    const hours = Math.max(1, Math.min(6, Math.round(l.duration_h)));
    let ws = Math.max(0, Math.min(23, Math.round(l.window_start)));
    let we = Math.max(1, Math.min(24, Math.round(l.window_end)));
    if (we - ws < hours) we = Math.min(24, ws + hours);
    if (we - ws < hours) ws = we - hours;
    return {
      id: l.id,
      kwh: Math.max(0, l.kwh_per_cycle),
      hours,
      perWeek: Math.max(0, Math.min(14, Math.round(l.cycles_per_week))),
      usual: l.usual_time,
      shiftable: l.shiftable,
      ws,
      we,
      after: l.after ? loads.findIndex((x) => x.id === l.after) : -1,
    };
  });
}

function buildBase(monthly: number[], loads: LoadCfg[]): Base {
  const rng = mulberry32(40721487);
  const load0 = new Float64Array(HOURS);
  const pv1 = new Float64Array(HOURS);
  const monthOfHour = new Uint8Array(HOURS);
  const loadsPerDay = loads.reduce((a, l) => a + (l.kwh * l.perWeek) / 7, 0);
  let day = 0;
  for (let m = 0; m < 12; m++) {
    const days = DAYS_IN_MONTH[m];
    const cloud: number[] = [];
    for (let i = 0; i < days; i++) cloud.push(rng() < CLEAR_SKY_PROB[m] ? 1.1 + 0.15 * rng() : 0.2 + 0.7 * rng());
    const meanCloud = cloud.reduce((a, b) => a + b, 0) / days;
    const cooling = m >= 5 && m <= 8;
    const hvacW = cloud.map((c) => (cooling ? 0.5 + (c > 1 ? 0.7 : 0) + 0.4 * rng() : 1 + (c < 0.8 ? 0.5 : 0) + 0.4 * rng()));
    const sumW = hvacW.reduce((a, b) => a + b, 0);
    const nonHvacDay = BASE_KW * 24 + COOKING_KWH_DAY + OTHER_KWH_DAY;
    let hvacMonth = monthly[m] - loadsPerDay * days - nonHvacDay * days;
    let scale = 1;
    if (hvacMonth < 0) {
      scale = Math.max(0, monthly[m] - loadsPerDay * days) / (nonHvacDay * days);
      hvacMonth = 0;
    }
    const hvacShape = cooling ? COOL_SHAPE : HEAT_SHAPE;
    for (let i = 0; i < days; i++, day++) {
      const dst = day >= DST_START_DAY && day < DST_END_DAY;
      const cook = (4 + day) % 7 >= 5 ? COOK_WEEKEND : COOK_WEEKDAY;
      const pvDay = (PV_KWH_PER_KWP[m] / days) * (cloud[i] / meanCloud);
      const len = DAY_LENGTH_H[m];
      const rise = (dst ? 13 : 12) - len / 2;
      const shape: number[] = [];
      let pvSum = 0;
      for (let h = 0; h < 24; h++) {
        const x = (h + 0.5 - rise) / len;
        const v = x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.5) : 0;
        shape.push(v);
        pvSum += v;
      }
      const hvacDay = (hvacMonth * hvacW[i]) / sumW;
      for (let h = 0; h < 24; h++) {
        const idx = day * 24 + h;
        monthOfHour[idx] = m;
        pv1[idx] = pvSum > 0 ? (pvDay * shape[h]) / pvSum : 0;
        load0[idx] = scale * (BASE_KW + cook[h] * COOKING_KWH_DAY + OTHER_SHAPE[h] * OTHER_KWH_DAY) + hvacDay * hvacShape[h];
      }
    }
  }

  const cycles: Cycle[] = [];
  const order = loads.map((_, i) => i).sort((a, b) => (loads[a].after >= 0 ? 1 : 0) - (loads[b].after >= 0 ? 1 : 0));
  for (let w = 0; w * 7 < 365; w++) {
    const avail = Math.min(7, 365 - w * 7);
    const weekCycles: number[][] = loads.map(() => []);
    for (const li of order) {
      const l = loads[li];
      if (l.kwh <= 0 || l.perWeek <= 0) continue;
      const days = Array.from({ length: avail }, (_, i) => i);
      for (let i = days.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [days[i], days[j]] = [days[j], days[i]];
      }
      const [from, to] = USUAL_TIME_RANGE[l.usual];
      const anchors = l.after >= 0 && l.after !== li ? weekCycles[l.after] : [];
      const n = Math.round((l.perWeek * avail) / 7);
      for (let i = 0; i < n; i++) {
        let start: number;
        let pairOf = -1;
        if (i < anchors.length) {
          const a = cycles[anchors[i]];
          start = a.start + a.hours + (rng() < 0.5 ? 0 : 1);
          pairOf = anchors[i];
        } else {
          start = (w * 7 + days[i % avail]) * 24 + from + Math.floor(rng() * (to - from));
        }
        weekCycles[li].push(cycles.length);
        cycles.push({ load: li, start: Math.min(start, HOURS - l.hours), hours: l.hours, kw: l.kwh / l.hours, pairOf });
      }
    }
  }
  return { load0, pv1, cycles, monthOfHour };
}

function placeCycles(base: Base, loads: LoadCfg[], kwp: number, shift: boolean, prices: Prices) {
  const { cycles, load0, pv1 } = base;
  const sur = new Float64Array(HOURS);
  for (let i = 0; i < HOURS; i++) sur[i] = kwp * pv1[i] - load0[i];
  const starts = new Int32Array(cycles.length);
  const perLoad: PerLoad = { cost: loads.map(() => 0), count: loads.map(() => 0) };
  const cost = (abs: number, c: Cycle) => {
    let t = 0;
    for (let j = 0; j < c.hours; j++) {
      const a = sur[abs + j];
      const fromPv = Math.min(c.kw, a > 0 ? a : 0);
      t += fromPv * prices.rid + (c.kw - fromPv) * prices.grid;
    }
    return t;
  };
  const optimize = shift && kwp > 0;
  cycles.forEach((c, i) => {
    const l = loads[c.load];
    const anchor = c.pairOf >= 0 ? cycles[c.pairOf] : null;
    const anchorMoved = anchor !== null && starts[c.pairOf] !== anchor.start;
    const dayStart = Math.floor((anchor ? anchor.start : c.start) / 24) * 24;
    let best = c.start;
    if (anchor && anchorMoved && (!optimize || !l.shiftable)) {
      best = starts[c.pairOf] + (c.start - anchor.start);
    } else if (optimize && l.shiftable) {
      let lo = dayStart + l.ws;
      const hi = dayStart + l.we - c.hours;
      if (anchor) lo = Math.max(lo, starts[c.pairOf] + anchor.hours);
      let bestCost = Infinity;
      if (anchor && anchorMoved) best = starts[c.pairOf] + anchor.hours;
      else bestCost = cost(c.start, c) - 0.005;
      for (let s = lo; s <= hi && s + c.hours <= HOURS; s++) {
        const v = cost(s, c);
        if (v < bestCost - 1e-9) {
          bestCost = v;
          best = s;
        }
      }
    }
    best = Math.max(0, Math.min(best, HOURS - c.hours));
    starts[i] = best;
    perLoad.cost[c.load] += cost(best, c);
    perLoad.count[c.load] += 1;
    for (let j = 0; j < c.hours; j++) sur[best + j] -= c.kw;
  });
  return { starts, perLoad };
}

function buildLoad(base: Base, starts: Int32Array): Float64Array {
  const load = Float64Array.from(base.load0);
  base.cycles.forEach((c, i) => {
    for (let j = 0; j < c.hours; j++) load[starts[i] + j] += c.kw;
  });
  return load;
}

function simulate(load: Float64Array, base: Base, kwp: number, cap: number, bat: BatteryCfg): Sim {
  const z = () => new Array<number>(12).fill(0);
  const s: Sim = { cons: 0, pv: 0, imp: 0, exp: 0, curt: 0, pvSelf: 0, mDirect: z(), mBatt: z(), mImp: z(), mPvSelf: z(), mExp: z(), mCurt: z() };
  const capU = cap * bat.usable;
  let soc = capU * 0.5;
  for (let h = 0; h < HOURS; h++) {
    const m = base.monthOfHour[h];
    const pv = kwp * base.pv1[h];
    const L = load[h];
    const direct = Math.min(pv, L);
    const net = pv - L;
    let ch = 0, dis = 0, im = 0, ex = 0, cu = 0;
    if (net > 0) {
      ch = capU > 0 ? Math.min(net, bat.powerKw, (capU - soc) / bat.eff) : 0;
      soc += ch * bat.eff;
      ex = Math.min(net - ch, bat.exportLimit);
      cu = net - ch - ex;
    } else {
      dis = capU > 0 ? Math.min(-net, bat.powerKw, soc) : 0;
      soc -= dis;
      im = -net - dis;
    }
    s.cons += L; s.pv += pv; s.imp += im; s.exp += ex; s.curt += cu; s.pvSelf += direct + ch;
    s.mDirect[m] += direct; s.mBatt[m] += dis; s.mImp[m] += im; s.mPvSelf[m] += direct + ch; s.mExp[m] += ex; s.mCurt[m] += cu;
  }
  return s;
}

function cashFlow(kwp: number, cap: number, saving1: number, st: Settings): CashFlow {
  const { system: sys, lifetime: life } = st;
  const invest = kwp * sys.cost_per_kwp + cap * sys.cost_per_kwh;
  const deductionPerYear = (invest * sys.deduction_pct) / 100 / 10;
  const replacements: number[] = [];
  const lifeYears = Math.max(5, Math.round(life.battery_life_years));
  if (cap > 0) for (let y = lifeYears; y <= HORIZON_YEARS - 3; y += lifeYears) replacements.push(y);
  let cum = -invest;
  const cumulative = [cum];
  for (let y = 1; y <= HORIZON_YEARS; y++) {
    let flow = saving1 * Math.pow(1 - life.degradation_pct / 100, y - 1) * Math.pow(1 + life.price_increase_pct / 100, y - 1);
    if (y <= 10) flow += deductionPerYear;
    if (replacements.includes(y)) flow -= cap * sys.cost_per_kwh;
    if (kwp > 0 && y === Math.round(life.inverter_year)) flow -= life.inverter_cost;
    cum += flow;
    cumulative.push(cum);
  }
  let payback: number | null = null;
  if (invest <= 0) payback = 0;
  else
    for (let y = 1; y <= HORIZON_YEARS; y++) {
      if (cumulative[y] >= 0 && cumulative[y - 1] < 0) {
        payback = y - 1 + -cumulative[y - 1] / (cumulative[y] - cumulative[y - 1]);
        break;
      }
    }
  return { cumulative, payback, deductionPerYear, replacements };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const roundArr = (a: number[]) => a.map((v) => Math.round(v * 10) / 10);
const key = (k: number, cap: number, shift: boolean) => `${k}|${cap}|${shift ? 1 : 0}`;

export class DemoBackend {
  private settings: Settings;
  private loads: LoadDef[];
  private cache: { key: string; base: Base; entries: Map<string, Entry>; prices: Prices } | null = null;

  constructor(private storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) {
    const saved = this.storage?.getItem(STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as { settings?: Partial<Settings>; loads?: LoadDef[] }) : null;
    this.settings = withDefaults(parsed?.settings);
    this.loads = parsed?.loads ?? structuredClone(DEFAULT_LOADS);
  }

  reset(): void {
    this.storage?.removeItem(STORAGE_KEY);
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.loads = structuredClone(DEFAULT_LOADS);
    this.cache = null;
  }

  handle(msg: { type: string; [key: string]: unknown }): unknown {
    switch (msg.type) {
      case "pv_sizer/config":
        return this.config();
      case "pv_sizer/results":
        return this.results();
      case "pv_sizer/scenario":
        return this.scenario(Number(msg.pv_kwp), Number(msg.battery_kwh), Boolean(msg.shift));
      case "pv_sizer/settings/update":
        this.settings = withDefaults(msg.settings as Settings);
        this.persist();
        return this.config();
      case "pv_sizer/loads/update":
        this.loads = msg.loads as LoadDef[];
        this.persist();
        return this.config();
      default:
        throw new Error(`Comando sconosciuto: ${msg.type}`);
    }
  }

  private persist(): void {
    this.cache = null;
    this.storage?.setItem(STORAGE_KEY, JSON.stringify({ settings: this.settings, loads: this.loads }));
  }

  private get pvSizes(): number[] {
    return this.settings.scenarios.pv_sizes_kwp;
  }

  private get batterySizes(): number[] {
    return [0, ...this.settings.scenarios.battery_sizes_kwh];
  }

  private prices(): Prices {
    const t = this.settings.tariff;
    const vat = 1 + t.vat_pct / 100;
    return {
      grid: (t.energy_price + t.excise) * vat,
      fixedAnnual: (t.fixed_monthly * 12 + t.power_fee * t.power_kw * 12) * vat,
      rid: t.export_price,
    };
  }

  private computed() {
    const cacheKey = JSON.stringify([this.settings, this.loads]);
    if (this.cache?.key === cacheKey) return this.cache;
    const cfgs = toLoadCfgs(this.loads);
    const prices = this.prices();
    const sys = this.settings.system;
    const bat: BatteryCfg = {
      powerKw: Math.max(0.5, sys.battery_power_kw),
      usable: Math.min(1, Math.max(0.5, sys.usable_pct / 100)),
      eff: Math.min(1, Math.max(0.5, sys.efficiency_pct / 100)),
      exportLimit: Math.max(0, sys.export_limit_kw),
    };
    const base = buildBase(DEMO_MONTHLY_KWH, cfgs);
    const entries = new Map<string, Entry>();
    for (const shift of [false, true]) {
      for (const k of [0, ...this.pvSizes]) {
        const pl = placeCycles(base, cfgs, k, shift, prices);
        const load = buildLoad(base, pl.starts);
        for (const cap of k === 0 ? [0] : this.batterySizes) {
          entries.set(key(k, cap, shift), { sim: simulate(load, base, k, cap, bat), perLoad: pl.perLoad });
        }
      }
    }
    this.cache = { key: cacheKey, base, entries, prices };
    return this.cache;
  }

  private baselineBill(): number {
    const { entries, prices } = this.computed();
    return entries.get(key(0, 0, false))!.sim.imp * prices.grid + prices.fixedAnnual;
  }

  private summary(k: number, cap: number, shift: boolean): { cell: CellSummary; cf: CashFlow } {
    const { entries, prices } = this.computed();
    const { sim } = entries.get(key(k, cap, shift))!;
    const bill = sim.imp * prices.grid + prices.fixedAnnual - sim.exp * prices.rid;
    const saving = this.baselineBill() - bill;
    const cf = cashFlow(k, cap, saving, this.settings);
    return {
      cf,
      cell: {
        pv_kwp: k,
        battery_kwh: cap,
        shift,
        bill_eur: round2(bill),
        saving_eur: round2(saving),
        self_sufficiency: sim.cons > 0 ? (sim.cons - sim.imp) / sim.cons : 0,
        self_consumption: sim.pv > 0 ? sim.pvSelf / sim.pv : 0,
        investment_eur: k * this.settings.system.cost_per_kwp + cap * this.settings.system.cost_per_kwh,
        payback_years: cf.payback,
        gain_eur: round2(cf.cumulative[HORIZON_YEARS]),
      },
    };
  }

  private config(): PanelConfig {
    const { base, entries, prices } = this.computed();
    const detected: LoadDetected[] = this.loads.map((l, li) => {
      const hours = new Array<number>(24).fill(0);
      let count = 0;
      for (const c of base.cycles) {
        if (c.load !== li) continue;
        count++;
        hours[c.start % 24]++;
      }
      return { load_id: l.id, cycles_per_year: count, kwh_per_cycle: l.kwh_per_cycle, duration_h: l.duration_h, usual_start_hour: hours.indexOf(Math.max(...hours)) };
    });
    return {
      location: { name: "San Cipriano Picentino (SA)", latitude: 40.72, longitude: 14.87 },
      horizon_years: HORIZON_YEARS,
      data: {
        source: "demo",
        consumption_entity_id: null,
        from: "2027-01-01",
        to: "2027-12-31",
        days: 365,
        annual_kwh: Math.round(entries.get(key(0, 0, false))!.sim.cons),
      },
      settings: this.settings,
      loads: this.loads,
      detected,
      sensor_options: SENSOR_OPTIONS,
      derived: { grid_price_eur_kwh: prices.grid, fixed_annual_eur: round2(prices.fixedAnnual) },
    };
  }

  private results(): Results {
    const { entries } = this.computed();
    const cells: CellSummary[] = [];
    for (const shift of [false, true]) for (const k of this.pvSizes) for (const cap of this.batterySizes) cells.push(this.summary(k, cap, shift).cell);
    return {
      baseline: { annual_kwh: Math.round(entries.get(key(0, 0, false))!.sim.cons), bill_eur: round2(this.baselineBill()) },
      cells,
      load_savings_by_pv: this.pvSizes.map((k) => {
        const off = entries.get(key(k, 0, false))!.perLoad;
        const on = entries.get(key(k, 0, true))!.perLoad;
        return { pv_kwp: k, by_load: Object.fromEntries(this.loads.map((l, i) => [l.id, round2(off.cost[i] - on.cost[i])])) };
      }),
    };
  }

  private scenario(kwp: number, capIn: number, shift: boolean): ScenarioDetail {
    const nearest = (xs: number[], v: number) => xs.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const k = kwp > 0 ? nearest(this.pvSizes, kwp) : 0;
    const cap = k === 0 ? 0 : nearest(this.batterySizes, capIn);
    const { entries } = this.computed();
    const { sim } = entries.get(key(k, cap, shift))!;
    const { cell, cf } = this.summary(k, cap, shift);
    const sys = this.settings.system;
    const items: CostItem[] = [];
    if (k > 0) {
      items.push({ kind: "pv", quantity: k, unit_cost: sys.cost_per_kwp, amount_eur: k * sys.cost_per_kwp });
      if (cap > 0) items.push({ kind: "battery", quantity: cap, unit_cost: sys.cost_per_kwh, amount_eur: cap * sys.cost_per_kwh });
      if (sys.deduction_pct > 0) items.push({ kind: "deduction", pct: sys.deduction_pct, per_year_eur: round2(cf.deductionPerYear), years: 10 });
      for (const y of cf.replacements) items.push({ kind: "battery_replacement", year: y, amount_eur: cap * sys.cost_per_kwh });
      const invYear = Math.round(this.settings.lifetime.inverter_year);
      if (invYear >= 1 && invYear <= HORIZON_YEARS) items.push({ kind: "inverter_replacement", year: invYear, amount_eur: this.settings.lifetime.inverter_cost });
    }
    const compareCap = cap > 0 ? 0 : (this.batterySizes.find((c) => c >= 5) ?? this.batterySizes[1] ?? null);
    const noPv = entries.get(key(0, 0, false))!.perLoad;
    const off = entries.get(key(k, cap, false))!.perLoad;
    const on = entries.get(key(k, cap, true))!.perLoad;
    const loads: LoadValue[] = this.loads.map((l, i) => {
      const n = off.count[i] || 1;
      return {
        load_id: l.id,
        cycles_per_year: off.count[i],
        cost_per_cycle_no_pv: round2(noPv.cost[i] / n),
        cost_per_cycle_pv: round2(off.cost[i] / n),
        cost_per_cycle_shifted: round2(on.cost[i] / n),
        saving_eur: round2(off.cost[i] - on.cost[i]),
      };
    });
    return {
      summary: cell,
      energy: {
        consumption_kwh: Math.round(sim.cons),
        pv_kwh: Math.round(sim.pv),
        pv_used_kwh: Math.round(sim.pvSelf),
        import_kwh: Math.round(sim.imp),
        export_kwh: Math.round(sim.exp),
        curtailed_kwh: Math.round(sim.curt),
      },
      monthly: {
        direct: roundArr(sim.mDirect),
        battery: roundArr(sim.mBatt),
        grid: roundArr(sim.mImp),
        pv_used: roundArr(sim.mPvSelf),
        exported: roundArr(sim.mExp),
        curtailed: roundArr(sim.mCurt),
      },
      costs: { items, cash_flow_eur: cf.cumulative.map(Math.round) },
      comparison: k > 0 && compareCap !== null ? { battery_kwh: compareCap, cash_flow_eur: this.summaryCashFlow(k, compareCap, shift) } : null,
      loads,
      shift_effect_eur: round2(this.summary(k, cap, true).cell.saving_eur - this.summary(k, cap, false).cell.saving_eur),
    };
  }

  private summaryCashFlow(k: number, cap: number, shift: boolean): number[] {
    return this.summary(k, cap, shift).cf.cumulative.map(Math.round);
  }
}
