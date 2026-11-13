"""What each load draws, from its sensor, the house model or the user's estimate.

`effective_usage` and `continuous_usage` mirror frontend/src/loads.ts: the panel shows what the
calculation uses, so the two must stay in step (the golden fixtures check it).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .common import DAYS_IN_MONTH, clamp, js_round, jsum, normalize
from .profiles import HOUR_SHAPES


def _sensor_stats(load: dict[str, Any], detected: list[dict[str, Any]]) -> dict[str, Any] | None:
    if load.get("source") != "sensor":
        return None
    return next((d for d in detected if d["entity_id"] == load.get("sensor_entity_id")), None)


def effective_usage(load: dict[str, Any], detected: list[dict[str, Any]]) -> dict[str, Any]:
    """The sensor's measured cycles, or the estimate until a sensor with cycles is picked."""
    det = _sensor_stats(load, detected)
    if det and det["cycles_per_year"] > 0:
        return {
            "measured": det,
            "per_week": det["cycles_per_year"] * 7 / 365,
            "kwh": det["kwh_per_cycle"],
            "hours": max(1, js_round(det["duration_h"])),
        }
    return {
        "measured": None,
        "per_week": load["cycles_per_week"],
        "kwh": load["kwh_per_cycle"],
        "hours": load["duration_h"],
    }


def served_area(load: dict[str, Any], model: dict[str, Any]) -> float | None:
    """Area a house-based load is computed on: its own, or the heated (cooled) area of the house."""
    if load.get("area_m2") is not None:
        return load["area_m2"]
    return model["cooled_area_m2"] if load.get("use") == "cooling" else model["heated_area_m2"]


def continuous_usage(load: dict[str, Any], detected: list[dict[str, Any]], model: dict[str, Any]) -> dict[str, Any]:
    """kWh/day for each month (0 = off), from the sensor, the house model (thermal kWh × m² ÷ efficiency)
    or the manual estimate."""
    stats = _sensor_stats(load, detected)
    measured = stats.get("continuous") if stats else None
    wants_house = not measured and load.get("basis") == "house" and load.get("use") is not None
    area = served_area(load, model)
    from_house = wants_house and area is not None and area > 0
    if measured:
        kwh_by_month = list(measured["kwh_per_day_by_month"])
    elif from_house:
        heating = load["use"] == "heating"
        thermal = model["heating_kwh_th_m2"] if heating else model["cooling_kwh_th_m2"]
        eff = model["scop"] if heating else model["seer"]
        kwh_by_month = [(v * area) / eff / DAYS_IN_MONTH[m] for m, v in enumerate(thermal)]
    else:
        months = load.get("months") or []
        kwh_by_month = [load["kwh_per_day"] if m + 1 in months else 0 for m in range(12)]
    active = [m + 1 for m, v in enumerate(kwh_by_month) if v > 0.005]
    active_days = sum(DAYS_IN_MONTH[m - 1] for m in active)
    year_kwh = jsum(v * DAYS_IN_MONTH[m] for m, v in enumerate(kwh_by_month))
    return {
        "measured": measured,
        "from_house": from_house,
        "needs_area": wants_house and not from_house,
        "kwh_by_month": kwh_by_month,
        "months": active,
        "per_day": year_kwh / active_days if active_days else 0,
        "year_kwh": year_kwh,
    }


def creates_loop(loads: list[dict[str, Any]], load_id: str, candidate: str) -> bool:
    """True if `load_id` waiting for `candidate` would close a loop of "deve aspettare"."""

    def after_of(lid: str) -> str | None:
        load = next((x for x in loads if x["id"] == lid), None)
        return load.get("after") if load and load["kind"] == "cycle" else None

    seen: set[str] = set()
    cur: str | None = candidate
    while cur:
        if cur == load_id:
            return True
        if cur in seen:
            return False
        seen.add(cur)
        cur = after_of(cur)
    return False


@dataclass
class CycleCfg:
    idx: int  # position in the load list, for per-load costs
    kwh: float
    hours: int
    per_week: float
    usual: str
    start_weights: list[float] | None  # measured start-hour histogram; replaces `usual`
    shiftable: bool
    ws: int
    we: int
    after: int  # index in the cycle list, -1 = none


@dataclass
class ContCfg:
    idx: int
    kwh_by_month: list[float]
    hour_weights: list[float]
    weather: bool  # colder or hotter days draw more
    shiftable: bool
    share: float
    advance: int


def to_load_cfgs(
    loads: list[dict[str, Any]], detected: list[dict[str, Any]], model: dict[str, Any]
) -> tuple[list[CycleCfg], list[ContCfg]]:
    cycle_idx = [i for i, load in enumerate(loads) if load["kind"] == "cycle"]
    cycle_loads = [loads[i] for i in cycle_idx]
    cycles = []
    for idx, load in zip(cycle_idx, cycle_loads, strict=True):
        use = effective_usage(load, detected)
        hours = int(clamp(js_round(use["hours"]), 1, 6))
        ws = int(clamp(js_round(load["window_start"]), 0, 23))
        we = int(clamp(js_round(load["window_end"]), 1, 24))
        if we - ws < hours:
            we = min(24, ws + hours)
        if we - ws < hours:
            ws = we - hours
        after = load.get("after")
        # Every load on a loop of "deve aspettare", or waiting for a continuous load, runs on its own.
        after_idx = -1
        if after and not creates_loop(loads, load["id"], after):
            after_idx = next((i for i, x in enumerate(cycle_loads) if x["id"] == after), -1)
        cycles.append(
            CycleCfg(
                idx=idx,
                kwh=max(0, use["kwh"]),
                hours=hours,
                per_week=use["per_week"] if use["measured"] else clamp(js_round(use["per_week"]), 0, 14),
                usual=load.get("usual_time", "any"),
                start_weights=use["measured"]["start_histogram"] if use["measured"] else None,
                shiftable=bool(load.get("shiftable")),
                ws=ws,
                we=we,
                after=after_idx,
            )
        )
    conts = []
    for idx, load in enumerate(loads):
        if load["kind"] != "continuous":
            continue
        use = continuous_usage(load, detected, model)
        profile = use["measured"]["hour_profile"] if use["measured"] else None
        conts.append(
            ContCfg(
                idx=idx,
                kwh_by_month=[max(0, v) for v in use["kwh_by_month"]],
                hour_weights=normalize(profile or HOUR_SHAPES.get(load.get("hour_profile"), HOUR_SHAPES["flat"])),
                weather=use["measured"] is not None or load.get("hour_profile") != "flat",
                shiftable=bool(load.get("shiftable")),
                share=clamp(load.get("shift_share", 0), 0, 0.5),
                advance=int(clamp(js_round(load.get("shift_advance_h", 1)), 1, 4)),
            )
        )
    return cycles, conts
