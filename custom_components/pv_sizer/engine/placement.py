"""Where each load runs in a scenario: at its usual time, or moved onto leftover PV when shifting is on."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .base import Base
from .common import HOURS
from .loads import ContCfg, CycleCfg


@dataclass
class Prices:
    grid: float  # EUR per imported kWh, taxes included
    fixed_annual: float
    rid: float  # EUR per exported kWh


@dataclass
class PerLoad:
    cost: list[float]
    count: list[int]


def place_cycles(
    base: Base, loads: list[CycleCfg], sur: list[float], load: list[float], optimize: bool, prices: Prices, per: PerLoad
) -> None:
    cycles = base.cycles
    starts = [0] * len(cycles)
    rid, grid = prices.rid, prices.grid

    def cost(start: int, kw: float, hours: int) -> float:
        t = 0.0
        for j in range(hours):
            a = sur[start + j]
            from_pv = min(kw, a if a > 0 else 0)
            t += from_pv * rid + (kw - from_pv) * grid
        return t

    for i, c in enumerate(cycles):
        ld = loads[c.load]
        anchor = cycles[c.pair_of] if c.pair_of >= 0 else None
        anchor_moved = anchor is not None and starts[c.pair_of] != anchor.start
        day_start = math.floor((anchor.start if anchor else c.start) / 24) * 24
        best = c.start
        if anchor and anchor_moved and (not optimize or not ld.shiftable):
            best = starts[c.pair_of] + (c.start - anchor.start)
        elif optimize and ld.shiftable:
            lo = day_start + ld.ws
            hi = day_start + ld.we - c.hours
            if anchor:
                lo = max(lo, starts[c.pair_of] + anchor.hours)
            best_cost = math.inf
            if anchor and anchor_moved:
                best = starts[c.pair_of] + anchor.hours
            else:
                best_cost = cost(c.start, c.kw, c.hours) - 0.005
            s = lo
            while s <= hi and s + c.hours <= HOURS:
                v = cost(s, c.kw, c.hours)
                if v < best_cost - 1e-9:
                    best_cost = v
                    best = s
                s += 1
        best = max(0, min(best, HOURS - c.hours))
        per.cost[ld.idx] += cost(best, c.kw, c.hours)
        per.count[ld.idx] += 1
        starts[i] = best
        for j in range(c.hours):
            sur[best + j] -= c.kw
            load[best + j] += c.kw


def place_conts(
    base: Base, conts: list[ContCfg], sur: list[float], load: list[float], optimize: bool, prices: Prices, per: PerLoad
) -> None:
    """Continuous loads go first: each hour not covered by PV can move up to `share` of its draw
    to the `advance` hours before it (same day) where PV is left over."""
    rid, grid = prices.rid, prices.grid
    for ci, usual in enumerate(base.conts):
        c = conts[ci]
        s = list(usual)
        if optimize and c.shiftable and c.share > 0:
            for i in range(HOURS):
                movable = min(c.share * usual[i], s[i] - min(s[i], max(0, sur[i])))
                j = i - 1
                floor_j = max(i - (i % 24), i - c.advance)
                while j >= floor_j and movable > 1e-9:
                    spare = sur[j] - s[j]
                    if spare > 0:
                        take = min(movable, spare)
                        s[j] += take
                        s[i] -= take
                        movable -= take
                    j -= 1
        total = 0.0
        for i in range(HOURS):
            from_pv = min(s[i], max(0, sur[i]))
            total += from_pv * rid + (s[i] - from_pv) * grid
            sur[i] -= s[i]
            load[i] += s[i]
        per.cost[c.idx] += total
        per.count[c.idx] = base.cont_days[ci]


def place(
    base: Base, cycles: list[CycleCfg], conts: list[ContCfg], n_loads: int, kwp: float, shift: bool, prices: Prices
) -> tuple[list[float], PerLoad]:
    """Hourly load of one scenario with its per-load costs."""
    pv1, load0 = base.pv1, base.load0
    sur = [kwp * pv1[i] - load0[i] for i in range(HOURS)]
    load = list(load0)
    per = PerLoad([0.0] * n_loads, [0] * n_loads)
    optimize = shift and kwp > 0
    place_conts(base, conts, sur, load, optimize, prices, per)
    place_cycles(base, cycles, sur, load, optimize, prices, per)
    return load, per
