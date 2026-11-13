"""Runs every scenario once and answers `pv_sizer/results` and `pv_sizer/scenario` from the cache."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from .base import Base, build_base
from .common import HORIZON_YEARS, js_round, round1, round2
from .consumption import MeterHistory, blend_consumption
from .finance import CashFlow, cash_flow
from .house import house_model
from .loads import to_load_cfgs
from .placement import PerLoad, Prices, place
from .simulate import BatteryCfg, Sim, simulate


class MissingConsumption(Exception):
    """Neither a meter nor a yearly total: nothing to simulate."""


@dataclass
class Inputs:
    settings: dict[str, Any]
    loads: list[dict[str, Any]]
    detected: list[dict[str, Any]] = field(default_factory=list)
    meter: MeterHistory | None = None
    # kWh per kWp for the 8760 local hours of the typical year; None = fallback model.
    pv_hourly: Sequence[float] | None = None
    # Per month, [weekday, weekend] share of each hour of the house's own use; None = typical shapes.
    day_shapes: Sequence[Sequence[Sequence[float]]] | None = None


def prices_of(settings: dict[str, Any]) -> Prices:
    t = settings["tariff"]
    vat = 1 + t["vat_pct"] / 100
    return Prices(
        grid=(t["energy_price"] + t["excise"]) * vat,
        fixed_annual=(t["fixed_monthly"] * 12 + t["power_fee"] * t["power_kw"] * 12) * vat,
        rid=t["export_price"],
    )


def _nearest(xs: Sequence[float], v: float) -> float:
    best = xs[0]
    for x in xs[1:]:
        if abs(x - v) < abs(best - v):
            best = x
    return best


class Engine:
    def __init__(self, inputs: Inputs) -> None:
        self.inputs = inputs
        self.settings = inputs.settings
        self.loads = inputs.loads
        self.model = house_model(self.settings["house"])
        self.prices = prices_of(self.settings)
        self.data_info, self.monthly = blend_consumption(self.settings["consumption"], inputs.meter)
        self._base: Base | None = None
        self._entries: dict[tuple[float, float, bool], tuple[Sim, PerLoad]] = {}

    @property
    def pv_sizes(self) -> list[float]:
        return self.settings["scenarios"]["pv_sizes_kwp"]

    @property
    def battery_sizes(self) -> list[float]:
        return [0, *self.settings["scenarios"]["battery_sizes_kwh"]]

    @property
    def base(self) -> Base:
        if self._base is None:
            self.compute()
        assert self._base is not None
        return self._base

    def loads_exceed_months(self) -> list[int]:
        return self.base.exceed if self.monthly is not None else []

    def compute(self) -> None:
        """Every PV size × battery size × shift. Slow: run it in the executor."""
        if self.monthly is None:
            raise MissingConsumption
        cycles, conts = to_load_cfgs(self.loads, self.inputs.detected, self.model)
        sys = self.settings["system"]
        bat = BatteryCfg(
            power_kw=max(0.5, sys["battery_power_kw"]),
            usable=min(1, max(0.5, sys["usable_pct"] / 100)),
            eff=min(1, max(0.5, sys["efficiency_pct"] / 100)),
            export_limit=max(0, sys["export_limit_kw"]),
        )
        base = build_base(self.monthly, cycles, conts, self.inputs.pv_hourly, self.inputs.day_shapes)
        entries: dict[tuple[float, float, bool], tuple[Sim, PerLoad]] = {}
        for shift in (False, True):
            for k in [0, *self.pv_sizes]:
                load, per = place(base, cycles, conts, len(self.loads), k, shift, self.prices)
                for cap in [0] if k == 0 else self.battery_sizes:
                    entries[(k, cap, shift)] = (simulate(load, base, k, cap, bat), per)
        self._base, self._entries = base, entries

    def _entry(self, k: float, cap: float, shift: bool) -> tuple[Sim, PerLoad]:
        if not self._entries:
            self.compute()
        return self._entries[(k, cap, shift)]

    def baseline_bill(self) -> float:
        return self._entry(0, 0, False)[0].imp * self.prices.grid + self.prices.fixed_annual

    def summary(self, k: float, cap: float, shift: bool) -> tuple[dict[str, Any], CashFlow]:
        sim = self._entry(k, cap, shift)[0]
        p = self.prices
        sys = self.settings["system"]
        bill = sim.imp * p.grid + p.fixed_annual - sim.exp * p.rid
        saving = self.baseline_bill() - bill
        cf = cash_flow(k, cap, saving, self.settings)
        cell = {
            "pv_kwp": k,
            "battery_kwh": cap,
            "shift": shift,
            "bill_eur": round2(bill),
            "saving_eur": round2(saving),
            "self_sufficiency": (sim.cons - sim.imp) / sim.cons if sim.cons > 0 else 0,
            "self_consumption": sim.pv_self / sim.pv if sim.pv > 0 else 0,
            "consumption_kwh": js_round(sim.cons),
            "import_kwh": js_round(sim.imp),
            "pv_kwh": js_round(sim.pv),
            "pv_used_kwh": js_round(sim.pv_self),
            "investment_eur": k * sys["cost_per_kwp"] + cap * sys["cost_per_kwh"],
            "payback_years": cf.payback,
            "gain_eur": round2(cf.cumulative[HORIZON_YEARS]),
        }
        return cell, cf

    def results(self) -> dict[str, Any]:
        cells = [
            self.summary(k, cap, shift)[0]
            for shift in (False, True)
            for k in self.pv_sizes
            for cap in self.battery_sizes
        ]
        savings = []
        for k in self.pv_sizes:
            off = self._entry(k, 0, False)[1]
            on = self._entry(k, 0, True)[1]
            by_load = {load["id"]: round2(off.cost[i] - on.cost[i]) for i, load in enumerate(self.loads)}
            savings.append({"pv_kwp": k, "by_load": by_load})
        return {
            "baseline": {
                "annual_kwh": js_round(self._entry(0, 0, False)[0].cons),
                "bill_eur": round2(self.baseline_bill()),
            },
            "cells": cells,
            "load_savings_by_pv": savings,
        }

    def scenario(self, kwp: float, cap_in: float, shift: bool) -> dict[str, Any]:
        k = _nearest(self.pv_sizes, kwp) if kwp > 0 else 0
        cap = 0 if k == 0 else _nearest(self.battery_sizes, cap_in)
        sim = self._entry(k, cap, shift)[0]
        cell, cf = self.summary(k, cap, shift)
        sys, life = self.settings["system"], self.settings["lifetime"]
        items: list[dict[str, Any]] = []
        if k > 0:
            items.append(
                {"kind": "pv", "quantity": k, "unit_cost": sys["cost_per_kwp"], "amount_eur": k * sys["cost_per_kwp"]}
            )
            if cap > 0:
                items.append(
                    {
                        "kind": "battery",
                        "quantity": cap,
                        "unit_cost": sys["cost_per_kwh"],
                        "amount_eur": cap * sys["cost_per_kwh"],
                    }
                )
            if sys["deduction_pct"] > 0:
                items.append(
                    {
                        "kind": "deduction",
                        "pct": sys["deduction_pct"],
                        "per_year_eur": round2(cf.deduction_per_year),
                        "years": 10,
                    }
                )
            for y in cf.replacements:
                items.append({"kind": "battery_replacement", "year": y, "amount_eur": cap * sys["cost_per_kwh"]})
            inv_year = js_round(life["inverter_year"])
            if 1 <= inv_year <= HORIZON_YEARS:
                items.append({"kind": "inverter_replacement", "year": inv_year, "amount_eur": life["inverter_cost"]})
        if cap > 0:
            compare_cap: float | None = 0
        else:
            compare_cap = next((c for c in self.battery_sizes if c >= 5), None)
            if compare_cap is None and len(self.battery_sizes) > 1:
                compare_cap = self.battery_sizes[1]
        no_pv = self._entry(0, 0, False)[1]
        off = self._entry(k, cap, False)[1]
        on = self._entry(k, cap, True)[1]
        loads = []
        for i, load in enumerate(self.loads):
            n = off.count[i] or 1
            loads.append(
                {
                    "load_id": load["id"],
                    "kind": load["kind"],
                    "cycles_per_year": off.count[i],
                    "cost_per_cycle_no_pv": round2(no_pv.cost[i] / n),
                    "cost_per_cycle_pv": round2(off.cost[i] / n),
                    "cost_per_cycle_shifted": round2(on.cost[i] / n),
                    "saving_eur": round2(off.cost[i] - on.cost[i]),
                }
            )
        comparison = None
        if k > 0 and compare_cap is not None:
            other = self.summary(k, compare_cap, shift)[1]
            comparison = {"battery_kwh": compare_cap, "cash_flow_eur": [js_round(v) for v in other.cumulative]}
        return {
            "summary": cell,
            "energy": {
                "consumption_kwh": js_round(sim.cons),
                "pv_kwh": js_round(sim.pv),
                "pv_used_kwh": js_round(sim.pv_self),
                "import_kwh": js_round(sim.imp),
                "export_kwh": js_round(sim.exp),
                "curtailed_kwh": js_round(sim.curt),
            },
            "monthly": {
                "direct": [round1(v) for v in sim.m_direct],
                "battery": [round1(v) for v in sim.m_batt],
                "grid": [round1(v) for v in sim.m_imp],
                "pv_used": [round1(v) for v in sim.m_pv_self],
                "exported": [round1(v) for v in sim.m_exp],
                "curtailed": [round1(v) for v in sim.m_curt],
            },
            "costs": {"items": items, "cash_flow_eur": [js_round(v) for v in cf.cumulative]},
            "comparison": comparison,
            "loads": loads,
            "shift_effect_eur": round2(
                self.summary(k, cap, True)[0]["saving_eur"] - self.summary(k, cap, False)[0]["saving_eur"]
            ),
        }
