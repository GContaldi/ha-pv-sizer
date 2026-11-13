"""What a load's energy sensor shows over the last year: distinct cycles, or a daily draw (heat pump).

Works on hourly statistics, so a cycle is a run of hours above standby. Its duration is energy ÷ peak hour:
a 2-hour cycle that straddles three clock hours still counts as about 2 hours.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime, tzinfo
from statistics import median
from typing import Any

from .common import js_round, jsum, round1, round2, round3

MIN_DAYS = 14
MIN_HOURS_PER_DAY = 20
MIN_CYCLE_KWH = 0.1
# Average active hours on the days the load runs at all: above this it is a continuous load.
CONTINUOUS_HOURS_PER_DAY = 8
MIN_KWH_PER_DAY = 0.05


def _standby(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 5]


def detect_load(entity_id: str, hourly: Mapping[float, float], tz: tzinfo) -> dict[str, Any] | None:
    """LoadDetected for one sensor, or None when the history is too short or shows nothing."""
    by_day: dict[date, list[tuple[datetime, float]]] = {}
    for t in sorted(hourly):
        local = datetime.fromtimestamp(t, tz)
        by_day.setdefault(local.date(), []).append((local, max(0.0, hourly[t])))
    days = {d: rows for d, rows in by_day.items() if len(rows) >= MIN_HOURS_PER_DAY}
    if len(days) < MIN_DAYS:
        return None
    values = [v for rows in days.values() for _, v in rows]
    standby = _standby(values)
    threshold = max(0.05, 3 * standby)

    runs: list[list[tuple[datetime, float]]] = []
    active_hours_by_day: dict[date, int] = {}
    current: list[tuple[datetime, float]] = []
    previous: float | None = None
    for t in sorted(hourly):
        local = datetime.fromtimestamp(t, tz)
        if local.date() not in days:
            continue
        v = max(0.0, hourly[t])
        contiguous = previous is not None and t - previous == 3600
        previous = t
        if v > standby + threshold:
            active_hours_by_day[local.date()] = active_hours_by_day.get(local.date(), 0) + 1
            if current and not contiguous:
                runs.append(current)
                current = []
            current.append((local, v - standby))
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)

    active_days = [n for n in active_hours_by_day.values() if n > 0]
    if not active_days:
        return None
    empty = {
        "cycles_per_year": 0,
        "kwh_per_cycle": 0,
        "duration_h": 0,
        "usual_start_hour": 0,
        "start_histogram": [0] * 24,
    }

    if jsum(active_days) / len(active_days) >= CONTINUOUS_HOURS_PER_DAY:
        kwh_by_month: list[list[float]] = [[] for _ in range(12)]
        profile = [0.0] * 24
        # Standby stays with the rest of the house: months with only standby are off.
        for d, rows in days.items():
            kwh_by_month[d.month - 1].append(jsum(max(0.0, v - standby) for _, v in rows))
            if active_hours_by_day.get(d):
                for local, v in rows:
                    profile[local.hour] += max(0.0, v - standby)
        per_day = [jsum(k) / len(k) if k else 0.0 for k in kwh_by_month]
        total = jsum(profile)
        return {
            "entity_id": entity_id,
            **empty,
            "continuous": {
                "kwh_per_day_by_month": [round1(v) if v >= MIN_KWH_PER_DAY else 0 for v in per_day],
                "hour_profile": [round3(v / total) for v in profile] if total > 0 else [round3(1 / 24)] * 24,
            },
        }

    cycles = []
    for run in runs:
        energy = jsum(v for _, v in run)
        if energy < MIN_CYCLE_KWH:
            continue
        peak = max(v for _, v in run)
        cycles.append((run[0][0].hour, energy, max(1.0, energy / peak)))
    if not cycles:
        return None
    histogram = [0] * 24
    for hour, _, _ in cycles:
        histogram[hour] += 1
    covered = len(days)
    return {
        "entity_id": entity_id,
        "cycles_per_year": js_round(len(cycles) * 365 / covered) if covered < 365 else len(cycles),
        "kwh_per_cycle": round2(median(c[1] for c in cycles)),
        "duration_h": round1(median(c[2] for c in cycles)),
        "usual_start_hour": histogram.index(max(histogram)),
        "start_histogram": histogram,
    }
