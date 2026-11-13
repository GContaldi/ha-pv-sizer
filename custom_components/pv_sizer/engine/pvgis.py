"""PVGIS hourly series (seriescalc) turned into the typical year of the calculation."""

from __future__ import annotations

import calendar
from datetime import UTC, datetime, tzinfo
from statistics import median
from typing import Any

from .common import HOURS, jsum


def _hour_start(time: str) -> float:
    """ "20230101:0010" is the UTC hour 00:00–01:00 of 1 January 2023."""
    return datetime.strptime(time[:11], "%Y%m%d:%H").replace(tzinfo=UTC).timestamp()


def by_year(data: dict[str, Any]) -> dict[int, list[tuple[float, float]]]:
    """UTC hour start and kWh per kWp (P is in W for a 1 kWp system), grouped by year."""
    out: dict[int, list[tuple[float, float]]] = {}
    for row in data["outputs"]["hourly"]:
        out.setdefault(int(row["time"][:4]), []).append((_hour_start(row["time"]), row["P"] / 1000))
    return out


def median_year(totals: dict[int, float]) -> int:
    """The year whose production is closest to the median of all years; the latest one on a tie."""
    mid = median(totals.values())
    return min(totals, key=lambda y: (abs(totals[y] - mid), -y))


def typical_year(series: list[tuple[float, float]], year: int, tz: tzinfo) -> list[float]:
    """8760 local hours from 1 January; 29 February is dropped. The DST hours are at night, when PV is 0."""
    out = [0.0] * HOURS
    leap = calendar.isleap(year)
    for t, kwh in series:
        local = datetime.fromtimestamp(t, tz)
        if local.year != year or (leap and local.month == 2 and local.day == 29):
            continue
        day = local.timetuple().tm_yday - 1 - (1 if leap and local.month > 2 else 0)
        out[day * 24 + local.hour] += kwh
    return out


def pv_from_seriescalc(data: dict[str, Any], tz: tzinfo) -> dict[str, Any]:
    """What is kept in the store: the chosen year hour by hour, and the total of every year."""
    years = {y: rows for y, rows in by_year(data).items() if len(rows) >= HOURS}
    if not years:
        raise ValueError("PVGIS returned no full year")
    totals = {y: jsum(kwh for _, kwh in rows) for y, rows in years.items()}
    year = median_year(totals)
    return {
        "year": year,
        "totals": {str(y): round(v, 1) for y, v in sorted(totals.items())},
        "hourly": [round(v, 4) for v in typical_year(years[year], year, tz)],
        "radiation_db": data.get("inputs", {}).get("meteo_data", {}).get("radiation_db"),
    }
