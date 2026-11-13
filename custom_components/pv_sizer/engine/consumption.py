"""Monthly totals from meter history and the bill: history wins, the estimate fills the unmeasured part."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .common import DAYS_IN_MONTH, js_round, jsum, round2
from .profiles import SEASONAL_PROFILES


@dataclass
class MeterHistory:
    """What the whole-house meter measured, folded onto one calendar year."""

    start: str
    end: str
    days: int
    days_by_month: list[int]
    kwh_by_month: list[float]


def blend_consumption(c: dict[str, Any], meter: MeterHistory | None) -> tuple[dict[str, Any], list[float] | None]:
    """DataInfo without `loads_exceed_months`, and the 12 monthly totals (None when there is nothing to go on)."""
    weights = SEASONAL_PROFILES.get(c.get("seasonal_profile"), SEASONAL_PROFILES["pdc_heating"])
    if meter is not None and meter.days <= 0:
        meter = None
    annual = c.get("annual_kwh")
    annual = annual if annual is not None and annual > 0 else None
    coverage = (
        {"from": meter.start, "to": meter.end, "days": meter.days} if meter else {"from": None, "to": None, "days": 0}
    )
    pattern_source = "sensor" if meter and meter.days >= 14 else "profile"

    def result(source: str, monthly: list[float], measured: list[float], warning: str | None = None):
        info = {
            "source": source,
            **coverage,
            "annual_kwh": js_round(jsum(monthly)),
            "months": [
                {"kwh": js_round(kwh), "measured_share": round2(min(1, measured[m] / kwh)) if kwh > 0 else 0}
                for m, kwh in enumerate(monthly)
            ],
            "pattern_source": pattern_source,
            "warning": warning,
        }
        return info, monthly

    zeros = [0.0] * 12
    if not meter and annual is None:
        return result("missing", zeros, zeros)[0], None
    if not meter:
        return result("estimate", [w * annual for w in weights], zeros)
    share = [min(1, d / DAYS_IN_MONTH[m]) for m, d in enumerate(meter.days_by_month)]
    if meter.days >= 365:
        return result("measured", list(meter.kwh_by_month), meter.kwh_by_month)
    measured = jsum(meter.kwh_by_month)
    # Full-month estimates, scaled so that measured + unmeasured parts add up to the bill,
    # or projected from the measured months.
    if annual is not None:
        unmeasured = jsum(x * (1 - share[m]) for m, x in enumerate(weights))
        estimate = [(max(0, annual - measured) * w) / unmeasured for w in weights]
    else:
        covered = jsum(x * share[m] for m, x in enumerate(weights))
        estimate = [(measured * w) / covered for w in weights]
    monthly = [kwh + (1 - share[m]) * estimate[m] for m, kwh in enumerate(meter.kwh_by_month)]
    warning = "measured_exceeds_annual" if annual is not None and measured > annual else None
    return result("mixed", monthly, meter.kwh_by_month, warning)
