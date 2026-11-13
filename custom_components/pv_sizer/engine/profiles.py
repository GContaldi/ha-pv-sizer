"""Typical shapes over the day and the year, used where history is missing."""

from __future__ import annotations

from .common import normalize

HEAT_SHAPE = normalize(
    [
        0.9,
        0.9,
        0.95,
        1,
        1.1,
        1.3,
        1.5,
        1.5,
        1.3,
        1.0,
        0.8,
        0.6,
        0.5,
        0.5,
        0.55,
        0.65,
        0.8,
        1.0,
        1.2,
        1.25,
        1.2,
        1.1,
        1.0,
        0.95,
    ]
)
COOL_SHAPE = normalize(
    [
        0.3,
        0.25,
        0.2,
        0.2,
        0.2,
        0.2,
        0.2,
        0.3,
        0.4,
        0.6,
        0.8,
        1.0,
        1.3,
        1.5,
        1.7,
        1.8,
        1.8,
        1.7,
        1.5,
        1.3,
        1.1,
        0.9,
        0.6,
        0.4,
    ]
)
OTHER_SHAPE = normalize(
    [
        0.3,
        0.2,
        0.15,
        0.15,
        0.15,
        0.2,
        0.5,
        0.8,
        0.7,
        0.6,
        0.6,
        0.6,
        0.7,
        0.7,
        0.6,
        0.6,
        0.7,
        0.9,
        1.2,
        1.5,
        1.6,
        1.5,
        1.2,
        0.7,
    ]
)
COOK_WEEKDAY = normalize([0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.15, 0.35, 0, 0, 0, 0, 0, 0.4, 0.5, 0, 0, 0])
COOK_WEEKEND = normalize([0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.3, 0.5, 0, 0, 0, 0, 0, 0.2, 0.4, 0, 0, 0])
HOUR_SHAPES = {"flat": [1 / 24] * 24, "heating": HEAT_SHAPE, "cooling": COOL_SHAPE}

# Share of the yearly total per month.
SEASONAL_PROFILES = {
    "pdc_heating": normalize([720, 640, 520, 400, 340, 320, 340, 340, 340, 400, 520, 700]),
    "pdc_heating_cooling": normalize([720, 640, 520, 400, 360, 420, 560, 560, 420, 400, 520, 700]),
    "no_pdc": normalize([560, 500, 510, 470, 450, 450, 480, 470, 450, 470, 500, 560]),
}

# Start-hour bands; together they cover the whole day.
USUAL_TIME_RANGE = {"any": (0, 24), "night": (0, 6), "morning": (6, 12), "afternoon": (12, 18), "evening": (18, 24)}
