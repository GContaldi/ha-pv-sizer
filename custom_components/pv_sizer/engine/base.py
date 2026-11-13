"""The typical year, hour by hour: house load without the listed loads, PV per kWp and the cycles to place."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from .common import DAYS_IN_MONTH, HOURS, js_round, jsum
from .loads import ContCfg, CycleCfg
from .profiles import COOK_WEEKDAY, COOK_WEEKEND, COOL_SHAPE, HEAT_SHAPE, OTHER_SHAPE, USUAL_TIME_RANGE

# Fallback PV model when PVGIS is not available: inland Salerno, south-facing 30°, ~14% losses,
# ~1,470 kWh/kWp/yr.
PV_KWH_PER_KWP = [72, 85, 118, 138, 158, 168, 180, 167, 132, 108, 76, 64]
DAY_LENGTH_H = [9.4, 10.5, 11.9, 13.3, 14.5, 15.1, 14.8, 13.8, 12.4, 11.0, 9.8, 9.1]
CLEAR_SKY_PROB = [0.45, 0.5, 0.55, 0.6, 0.7, 0.85, 0.92, 0.9, 0.75, 0.6, 0.45, 0.4]
DST_START_DAY = 86
DST_END_DAY = 303
BASE_KW = 0.22
COOKING_KWH_DAY = 1.5
OTHER_KWH_DAY = 1.6
SEED = 40721487
# Day 0 of the typical year is a Thursday: (4 + day) % 7 >= 5 is Saturday or Sunday.
FIRST_WEEKDAY = 4


class Mulberry32:
    """Same generator and seed as the demo, so both draw the same weather and the same cycles."""

    def __init__(self, seed: int) -> None:
        self.a = seed & 0xFFFFFFFF

    def __call__(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def pick_weighted(weights: Sequence[float], r: float) -> int:
    x = r * jsum(weights)
    for h, w in enumerate(weights):
        x -= w
        if x < 0:
            return h
    return len(weights) - 1


def is_weekend(day: int) -> bool:
    return (FIRST_WEEKDAY + day) % 7 >= 5


@dataclass(slots=True)
class Cycle:
    load: int  # index in the cycle list
    start: int
    hours: int
    kw: float
    pair_of: int  # index of the cycle it waits for, -1 = none


@dataclass
class Base:
    load0: list[float]
    pv1: list[float]
    cycles: list[Cycle]
    month_of_hour: list[int]
    # Hourly draw of each continuous load at the usual times, and its active days.
    conts: list[list[float]]
    cont_days: list[int]
    # 0-based months where loads exceeded the month's total and continuous loads were cut back.
    exceed: list[int]


def _synthetic_pv_day(m: int, day: int, pv_day: float) -> list[float]:
    dst = DST_START_DAY <= day < DST_END_DAY
    length = DAY_LENGTH_H[m]
    rise = (13 if dst else 12) - length / 2
    shape = []
    for h in range(24):
        x = (h + 0.5 - rise) / length
        shape.append(math.sin(math.pi * x) ** 1.5 if 0 < x < 1 else 0.0)
    total = jsum(shape)
    return [pv_day * v / total if total > 0 else 0.0 for v in shape]


def build_base(
    monthly: Sequence[float],
    loads: list[CycleCfg],
    conts: list[ContCfg],
    pv_hourly: Sequence[float] | None = None,
    day_shapes: Sequence[Sequence[Sequence[float]]] | None = None,
) -> Base:
    """`pv_hourly`: kWh per kWp for the 8760 local hours (PVGIS); None uses the fallback model.
    `day_shapes`: per month, the measured share of each hour for [weekday, weekend]; None uses typical shapes.
    Daily totals stay the same either way: they come from the monthly totals and the weather."""
    rng = Mulberry32(SEED)
    load0 = [0.0] * HOURS
    pv1 = [0.0] * HOURS
    month_of_hour = [0] * HOURS
    cont_series = [[0.0] * HOURS for _ in conts]
    cont_days = [0] * len(conts)
    exceed: list[int] = []
    loads_per_day = jsum(c.kwh * c.per_week / 7 for c in loads)
    day = 0
    for m in range(12):
        days = DAYS_IN_MONTH[m]
        if pv_hourly is None:
            cloud = []
            for _ in range(days):
                cloud.append(1.1 + 0.15 * rng() if rng() < CLEAR_SKY_PROB[m] else 0.2 + 0.7 * rng())
        else:
            # Sunnier than usual for the month = clear day.
            pv_days = [jsum(pv_hourly[(day + i) * 24 : (day + i + 1) * 24]) for i in range(days)]
            mean_pv = jsum(pv_days) / days
            cloud = [v / mean_pv if mean_pv > 0 else 1.0 for v in pv_days]
        mean_cloud = jsum(cloud) / days
        cooling = 5 <= m <= 8
        hvac_w = [
            0.5 + (0.7 if c > 1 else 0) + 0.4 * rng() if cooling else 1 + (0.5 if c < 0.8 else 0) + 0.4 * rng()
            for c in cloud
        ]
        sum_w = jsum(hvac_w)
        non_hvac_day = BASE_KW * 24 + COOKING_KWH_DAY + OTHER_KWH_DAY
        cycle_month = loads_per_day * days
        cont_month = jsum(c.kwh_by_month[m] * days for c in conts)
        cont_scale = 1.0
        if cont_month > 0 and cycle_month + cont_month > monthly[m] + 0.5:
            cont_scale = max(0, monthly[m] - cycle_month) / cont_month
            exceed.append(m)
        rest = monthly[m] - cycle_month - cont_month * cont_scale
        hvac_month = rest - non_hvac_day * days
        scale = 1.0
        if hvac_month < 0:
            scale = max(0, rest) / (non_hvac_day * days)
            hvac_month = 0
        for ci, c in enumerate(conts):
            if c.kwh_by_month[m] * cont_scale > 0:
                cont_days[ci] += days
        hvac_shape = COOL_SHAPE if cooling else HEAT_SHAPE
        for i in range(days):
            weekend = is_weekend(day)
            hvac_day = hvac_month * hvac_w[i] / sum_w
            cont_day = [c.kwh_by_month[m] * cont_scale * (hvac_w[i] * days / sum_w if c.weather else 1) for c in conts]
            if pv_hourly is None:
                pv_day = PV_KWH_PER_KWP[m] / days * (cloud[i] / mean_cloud)
                pv_hours = _synthetic_pv_day(m, day, pv_day)
            else:
                pv_hours = pv_hourly[day * 24 : (day + 1) * 24]
            if day_shapes is None:
                cook = COOK_WEEKEND if weekend else COOK_WEEKDAY
                rest_hours = [
                    scale * (BASE_KW + cook[h] * COOKING_KWH_DAY + OTHER_SHAPE[h] * OTHER_KWH_DAY)
                    + hvac_day * hvac_shape[h]
                    for h in range(24)
                ]
            else:
                rest_day = scale * non_hvac_day + hvac_day
                shape = day_shapes[m][1 if weekend else 0]
                rest_hours = [rest_day * shape[h] for h in range(24)]
            o = day * 24
            for h in range(24):
                month_of_hour[o + h] = m
                pv1[o + h] = pv_hours[h]
                load0[o + h] = rest_hours[h]
            for ci, c in enumerate(conts):
                series, kwh, weights = cont_series[ci], cont_day[ci], c.hour_weights
                for h in range(24):
                    series[o + h] = kwh * weights[h]
            day += 1

    cycles: list[Cycle] = []

    def depth(i: int) -> int:
        return 0 if loads[i].after < 0 else 1 + depth(loads[i].after)

    order = sorted(range(len(loads)), key=depth)
    w = 0
    while w * 7 < 365:
        avail = min(7, 365 - w * 7)
        week_cycles: list[list[int]] = [[] for _ in loads]
        for li in order:
            ld = loads[li]
            if ld.kwh <= 0 or ld.per_week <= 0:
                continue
            days_order = list(range(avail))
            for i in range(avail - 1, 0, -1):
                j = math.floor(rng() * (i + 1))
                days_order[i], days_order[j] = days_order[j], days_order[i]
            lo, hi = USUAL_TIME_RANGE.get(ld.usual, USUAL_TIME_RANGE["any"])
            anchors = week_cycles[ld.after] if ld.after >= 0 else []
            n = js_round(ld.per_week * avail / 7)
            for i in range(n):
                pair_of = -1
                if i < len(anchors):
                    a = cycles[anchors[i]]
                    start = a.start + a.hours + (0 if rng() < 0.5 else 1)
                    pair_of = anchors[i]
                else:
                    if ld.start_weights:
                        hour = pick_weighted(ld.start_weights, rng())
                    else:
                        hour = lo + math.floor(rng() * (hi - lo))
                    start = (w * 7 + days_order[i % avail]) * 24 + hour
                week_cycles[li].append(len(cycles))
                cycles.append(Cycle(li, min(start, HOURS - ld.hours), ld.hours, ld.kwh / ld.hours, pair_of))
        w += 1
    return Base(load0, pv1, cycles, month_of_hour, cont_series, cont_days, exceed)
