"""House model: thermal need per m² and heat pump efficiency.

Heating: thermal kWh/m² = degree days × need per degree day, spread over the legal heating period
(DPR 74/2013); electric = thermal ÷ SCOP. Cooling: thermal kWh/m² per zone ÷ SEER.
"""

from __future__ import annotations

from typing import Any

from .common import DAYS_IN_MONTH, jsum, normalize, round2, round3

ZONE_GG = {"A": 500, "B": 750, "C": 1150, "D": 1750, "E": 2550, "F": 3300}
# Share of each month inside the heating period, Jan..Dec.
HEATING_PERIOD = {
    "A": [1, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 1],  # 1/12 – 15/3
    "B": [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],  # 1/12 – 31/3
    "C": [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 1],  # 15/11 – 31/3
    "D": [1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0, 1, 1],  # 1/11 – 15/4
    "E": [1, 1, 1, 0.5, 0, 0, 0, 0, 0, 0.5, 1, 1],  # 15/10 – 15/4
    "F": [1, 1, 1, 1, 0.5, 0, 0, 0, 0.5, 1, 1, 1],  # no limit
}
# Heating need per day relative to January.
HDD_SHAPE = [1, 0.9, 0.7, 0.45, 0.25, 0.08, 0.03, 0.03, 0.15, 0.35, 0.6, 0.9]
NEED_PER_GG = {"good": 0.02, "medium": 0.045, "poor": 0.08}
SCOP_ZONE = {"A": 0.2, "B": 0.2, "C": 0, "D": 0, "E": -0.3, "F": -0.3}
COOLING_KWH_M2 = {"A": 40, "B": 35, "C": 30, "D": 22, "E": 12, "F": 5}
COOLING_INSULATION = {"good": 0.7, "medium": 1, "poor": 1.3}
COOLING_SHAPE = [0, 0, 0, 0, 0, 0.15, 0.35, 0.35, 0.15, 0, 0, 0]

# SCOP by emitter, average climate (EN 14825); floor = 35 °C flow, radiators = 55 °C, fancoil in between.
HEAT_PUMPS: list[dict[str, Any]] = [
    {"id": "generic", "label": "Generica", "scop": {"floor": 4.0, "fancoil": 3.5, "radiators": 2.8}, "seer": 4.5},
    # Daikin datasheet ERLA11DV3 + EBVX11S23D6V: SCOP 4.72 at 35 °C, 3.27 at 55 °C. No SEER published: typical value.
    {
        "id": "daikin_altherma3_rf_11",
        "label": "Altherma 3 RF 11 kW",
        "scop": {"floor": 4.72, "fancoil": 4.0, "radiators": 3.27},
        "seer": 4.5,
    },
]


def heat_pump_options() -> list[dict[str, str]]:
    return [{"id": p["id"], "label": p["label"]} for p in HEAT_PUMPS]


def house_model(h: dict[str, Any]) -> dict[str, Any]:
    zone = h["climate_zone"] if h.get("climate_zone") in ZONE_GG else "C"
    gg = ZONE_GG[zone]
    pump = next((p for p in HEAT_PUMPS if p["id"] == h.get("heat_pump")), HEAT_PUMPS[0])
    heat_weights = normalize([v * HEATING_PERIOD[zone][m] * DAYS_IN_MONTH[m] for m, v in enumerate(HDD_SHAPE)])
    heat_total = gg * NEED_PER_GG.get(h.get("insulation"), NEED_PER_GG["medium"])
    cool_total = COOLING_KWH_M2[zone] * COOLING_INSULATION.get(h.get("insulation"), 1)
    zones = h.get("zones") or []
    sized = [z for z in zones if z.get("area_m2") is not None and z["area_m2"] > 0]
    heated = jsum(z["area_m2"] for z in sized)
    cooled = jsum(z["area_m2"] for z in sized if z.get("cooling") and z.get("emitter") != "radiators")

    def scop_of(emitter: str) -> float:
        return pump["scop"].get(emitter, pump["scop"]["fancoil"]) + SCOP_ZONE[zone]

    # Same thermal need per m² everywhere, each zone at its own flow temperature: electric = Σ area ÷ SCOP.
    if heated:
        scop = heated / jsum(z["area_m2"] / scop_of(z["emitter"]) for z in sized)
    else:
        scop = scop_of(zones[0]["emitter"] if zones else "fancoil")
    return {
        "heating_kwh_th_m2": [round3(w * heat_total) for w in heat_weights],
        "cooling_kwh_th_m2": [round3(w * cool_total) for w in normalize(COOLING_SHAPE)],
        "heated_area_m2": heated or None,
        "cooled_area_m2": cooled if heated else None,
        "scop": round2(scop),
        "seer": pump["seer"],
        "gg": gg,
    }
