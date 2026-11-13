"""Hourly meter history folded onto the typical year: valid days, monthly totals and the shape of a day."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo

from .common import DAYS_IN_MONTH, jsum
from .consumption import MeterHistory

MIN_DAYS = 14
# Fewer valid days than this for a month and a kind of day: use the shape of all months.
MIN_DAYS_PER_SHAPE = 3

# UTC timestamp of the hour start → kWh used in that hour.
Hourly = Mapping[float, float]


@dataclass
class DayRecord:
    day: date
    hours: list[float]  # 24 local hours; the DST hours are merged or left at 0
    total: float


def valid_days(meter: Hourly, tz: tzinfo, first: date, last: date) -> list[DayRecord]:
    """Days in [first, last] with every hour recorded. A day is also dropped when the hour before it is missing:
    a meter that comes back after a gap puts everything it missed in its first hour."""
    out = []
    day = first
    while day <= last:
        start = datetime(day.year, day.month, day.day, tzinfo=tz)
        nxt = day + timedelta(days=1)
        end = datetime(nxt.year, nxt.month, nxt.day, tzinfo=tz)
        t0, t1 = start.timestamp(), end.timestamp()
        stamps = [t0 + 3600 * i for i in range(round((t1 - t0) / 3600))]
        values = [meter.get(t) for t in stamps]
        before_ok = day == first or meter.get(t0 - 3600) is not None
        if before_ok and all(v is not None and v >= 0 for v in values):
            hours = [0.0] * 24
            for t, v in zip(stamps, values, strict=True):
                hours[datetime.fromtimestamp(t, tz).hour] += v
            out.append(DayRecord(day, hours, jsum(hours)))
        day = nxt
    return out


def meter_history(days: Sequence[DayRecord]) -> MeterHistory | None:
    if not days:
        return None
    days_by_month = [0] * 12
    kwh_by_month = [0.0] * 12
    for d in days:
        days_by_month[d.day.month - 1] += 1
        kwh_by_month[d.day.month - 1] += d.total
    for m in range(12):
        # 29 February, or more than a year of history: keep one month's worth.
        if days_by_month[m] > DAYS_IN_MONTH[m]:
            kwh_by_month[m] *= DAYS_IN_MONTH[m] / days_by_month[m]
            days_by_month[m] = DAYS_IN_MONTH[m]
    return MeterHistory(
        start=days[0].day.isoformat(),
        end=days[-1].day.isoformat(),
        days=sum(days_by_month),
        days_by_month=days_by_month,
        kwh_by_month=kwh_by_month,
    )


def _mean_shape(shapes: list[list[float]]) -> list[float]:
    return [jsum(s[h] for s in shapes) / len(shapes) for h in range(24)]


def day_shapes(
    days: Sequence[DayRecord], subtract: Sequence[Hourly] = (), tz: tzinfo | None = None
) -> list[list[list[float]]] | None:
    """Per month, [weekday, weekend] share of each hour of what the house uses besides the loads with their own
    sensor (`subtract`). None with fewer than MIN_DAYS valid days."""
    if len(days) < MIN_DAYS:
        return None
    by_kind: dict[tuple[int, int], list[list[float]]] = {}
    for d in days:
        hours = list(d.hours)
        if subtract and tz is not None:
            start = datetime(d.day.year, d.day.month, d.day.day, tzinfo=tz).timestamp()
            for i in range(25):
                t = start + 3600 * i
                h = datetime.fromtimestamp(t, tz)
                if h.date() != d.day:
                    break
                hours[h.hour] -= jsum(s.get(t, 0.0) for s in subtract)
            hours = [max(0.0, v) for v in hours]
        total = jsum(hours)
        if total <= 0:
            continue
        weekend = 1 if d.day.weekday() >= 5 else 0
        by_kind.setdefault((d.day.month - 1, weekend), []).append([v / total for v in hours])
    if not by_kind:
        return None
    all_shapes = [s for shapes in by_kind.values() for s in shapes]
    overall = _mean_shape(all_shapes)
    per_kind = []
    for weekend in (0, 1):
        kind = [s for (_, w), shapes in by_kind.items() if w == weekend for s in shapes]
        per_kind.append(_mean_shape(kind) if len(kind) >= MIN_DAYS_PER_SHAPE else overall)
    return [
        [
            _mean_shape(by_kind[(m, w)]) if len(by_kind.get((m, w), [])) >= MIN_DAYS_PER_SHAPE else per_kind[w]
            for w in (0, 1)
        ]
        for m in range(12)
    ]
