"""Cash flow over the horizon: investment, yearly saving, tax deduction, replacements."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .common import HORIZON_YEARS, js_round


@dataclass
class CashFlow:
    cumulative: list[float]
    payback: float | None
    deduction_per_year: float
    replacements: list[int]


def cash_flow(kwp: float, cap: float, saving1: float, settings: dict[str, Any]) -> CashFlow:
    sys, life = settings["system"], settings["lifetime"]
    invest = kwp * sys["cost_per_kwp"] + cap * sys["cost_per_kwh"]
    deduction_per_year = invest * sys["deduction_pct"] / 100 / 10
    replacements: list[int] = []
    life_years = max(5, js_round(life["battery_life_years"]))
    if cap > 0:
        replacements = list(range(life_years, HORIZON_YEARS - 3 + 1, life_years))
    inverter_year = js_round(life["inverter_year"])
    cum = -invest
    cumulative = [cum]
    for y in range(1, HORIZON_YEARS + 1):
        flow = (
            saving1 * (1 - life["degradation_pct"] / 100) ** (y - 1) * (1 + life["price_increase_pct"] / 100) ** (y - 1)
        )
        if y <= 10:
            flow += deduction_per_year
        if y in replacements:
            flow -= cap * sys["cost_per_kwh"]
        if kwp > 0 and y == inverter_year:
            flow -= life["inverter_cost"]
        cum += flow
        cumulative.append(cum)
    payback: float | None = None
    if invest <= 0:
        payback = 0
    else:
        for y in range(1, HORIZON_YEARS + 1):
            if cumulative[y] >= 0 and cumulative[y - 1] < 0:
                payback = y - 1 + -cumulative[y - 1] / (cumulative[y] - cumulative[y - 1])
                break
    return CashFlow(cumulative, payback, deduction_per_year, replacements)
