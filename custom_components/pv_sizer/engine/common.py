"""Shared helpers. Rounding and sums behave like the TypeScript demo so results match it."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
HOURS = 8760
HORIZON_YEARS = 25


def jsum(values: Iterable[float]) -> float:
    """Left-to-right sum. Python's sum() compensates float errors, which the panel's maths does not."""
    total = 0.0
    for v in values:
        total += v
    return total


def normalize(shape: Sequence[float]) -> list[float]:
    s = jsum(shape)
    return [v / s for v in shape]


def js_round(v: float) -> int:
    """Math.round: halves go up, also for negative numbers."""
    return math.floor(v + 0.5)


def round1(v: float) -> float:
    return js_round(v * 10) / 10


def round2(v: float) -> float:
    return js_round(v * 100) / 100


def round3(v: float) -> float:
    return js_round(v * 1000) / 1000


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def is_number(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
