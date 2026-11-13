"""Default settings and loads, and the migrations of older saves (same rules as the panel's demo)."""

from __future__ import annotations

import copy
from typing import Any

from .common import clamp, is_number, round1

CLIMATE_ZONES = ("A", "B", "C", "D", "E", "F")
INSULATIONS = ("good", "medium", "poor")
EMITTERS = ("floor", "fancoil", "radiators")
SEASONAL_PROFILES = ("pdc_heating", "pdc_heating_cooling", "no_pdc")

DEFAULT_SETTINGS: dict[str, Any] = {
    "tariff": {
        "energy_price": 0.16375,
        "excise": 0.0227,
        "vat_pct": 10,
        "fixed_monthly": 14.17,
        "power_fee": 1.976667,
        "power_kw": 6,
        "export_price": 0.09,
    },
    "system": {
        "cost_per_kwp": 1500,
        "cost_per_kwh": 550,
        "deduction_pct": 50,
        "battery_power_kw": 5,
        "usable_pct": 90,
        "efficiency_pct": 90,
        "export_limit_kw": 6,
    },
    "lifetime": {
        "degradation_pct": 0.5,
        "price_increase_pct": 0,
        "battery_life_years": 12,
        "inverter_cost": 1200,
        "inverter_year": 12,
    },
    "scenarios": {"pv_sizes_kwp": [3, 4.5, 6, 7.5, 9], "battery_sizes_kwh": [5, 10, 15]},
    # The meter defaults to the grid import of the Energy dashboard (see the coordinator).
    "consumption": {"meter_entity_id": None, "annual_kwh": None, "seasonal_profile": "pdc_heating"},
    "house": {
        "climate_zone": "C",
        "insulation": "medium",
        "heat_pump": "generic",
        "zones": [{"name": "Casa", "area_m2": None, "emitter": "fancoil", "cooling": True}],
    },
    "pv": {"roofs": [{"tilt_deg": 30, "azimuth_deg": 0, "loss_pct": 14}]},
}

ROOF_LIMITS = {"tilt_deg": (0, 90), "azimuth_deg": (-180, 180), "loss_pct": (0, 50)}

_CYCLE = {"kind": "cycle", "source": "estimate", "sensor_entity_id": None, "shiftable": True, "after": None}
_CONTINUOUS = {"kind": "continuous", "source": "estimate", "sensor_entity_id": None, "shiftable": True}

DEFAULT_LOADS: list[dict[str, Any]] = [
    {
        **_CYCLE,
        "id": "lavatrice",
        "name": "Lavatrice",
        "kwh_per_cycle": 0.9,
        "duration_h": 2,
        "cycles_per_week": 4,
        "usual_time": "any",
        "window_start": 9,
        "window_end": 18,
    },
    {
        **_CYCLE,
        "id": "asciugatrice",
        "name": "Asciugatrice",
        "kwh_per_cycle": 1.6,
        "duration_h": 2,
        "cycles_per_week": 4,
        "usual_time": "any",
        "window_start": 9,
        "window_end": 18,
        "after": "lavatrice",
    },
    {
        **_CYCLE,
        "id": "lavastoviglie",
        "name": "Lavastoviglie",
        "kwh_per_cycle": 1.0,
        "duration_h": 3,
        "cycles_per_week": 5,
        "usual_time": "evening",
        "window_start": 9,
        "window_end": 18,
    },
    {
        **_CYCLE,
        "id": "acs",
        "name": "Acqua calda (PDC)",
        "kwh_per_cycle": 2.4,
        "duration_h": 2,
        "cycles_per_week": 7,
        "usual_time": "morning",
        "window_start": 10,
        "window_end": 16,
    },
    {
        **_CONTINUOUS,
        "id": "pdc_riscaldamento",
        "name": "PDC riscaldamento",
        "use": "heating",
        "basis": "house",
        "area_m2": None,
        "kwh_per_day": 12,
        "months": [11, 12, 1, 2, 3],
        "hour_profile": "heating",
        "shift_share": 0.3,
        "shift_advance_h": 3,
    },
    {
        **_CONTINUOUS,
        "id": "pdc_raffrescamento",
        "name": "PDC raffrescamento",
        "use": "cooling",
        "basis": "house",
        "area_m2": None,
        "kwh_per_day": 6,
        "months": [6, 7, 8, 9],
        "hour_profile": "cooling",
        "shift_share": 0.3,
        "shift_advance_h": 2,
    },
]

SIZE_LIMITS = {
    "pv": {"min": 0.5, "max": 30, "max_count": 6},
    "battery": {"min": 1, "max": 40, "max_count": 4},
}


def _clean_sizes(values: Any, limits: dict[str, float]) -> list[float]:
    if not isinstance(values, list):
        return []
    kept = [round1(v) for v in values if is_number(v) and limits["min"] <= v <= limits["max"]]
    return sorted(dict.fromkeys(kept))[: int(limits["max_count"])]


def normalize_sizes(s: dict[str, Any], fallback: dict[str, Any]) -> dict[str, list[float]]:
    """Sorted, deduplicated, within limits: the panel applies the same rules."""
    pv = _clean_sizes(s.get("pv_sizes_kwp"), SIZE_LIMITS["pv"])
    return {
        "pv_sizes_kwp": pv or list(fallback["pv_sizes_kwp"]),
        "battery_sizes_kwh": _clean_sizes(s.get("battery_sizes_kwh"), SIZE_LIMITS["battery"]),
    }


def _merge_numbers(defaults: dict[str, Any], saved: Any) -> dict[str, Any]:
    """Known keys only; anything that is not a number keeps the default."""
    saved = saved if isinstance(saved, dict) else {}
    return {k: saved[k] if is_number(saved.get(k)) else d for k, d in defaults.items()}


def _consumption(saved: Any, d: dict[str, Any]) -> dict[str, Any]:
    saved = saved if isinstance(saved, dict) else {}
    meter = saved.get("meter_entity_id", d["meter_entity_id"])
    annual = saved.get("annual_kwh", d["annual_kwh"])
    profile = saved.get("seasonal_profile")
    return {
        "meter_entity_id": meter if isinstance(meter, str) and meter else None,
        "annual_kwh": annual if is_number(annual) else None,
        "seasonal_profile": profile if profile in SEASONAL_PROFILES else d["seasonal_profile"],
    }


def _zone(z: Any) -> dict[str, Any] | None:
    if not isinstance(z, dict):
        return None
    area = z.get("area_m2")
    emitter = z.get("emitter") if z.get("emitter") in EMITTERS else "fancoil"
    return {
        "name": str(z.get("name") or "Casa"),
        "area_m2": area if is_number(area) else None,
        "emitter": emitter,
        "cooling": bool(z.get("cooling")) and emitter != "radiators",
    }


def migrate_house(h: Any, d: dict[str, Any]) -> dict[str, Any]:
    """Saves from before zones had one heated area and one emitter: they become a single "Casa" zone."""
    if not isinstance(h, dict):
        return copy.deepcopy(d)
    if isinstance(h.get("zones"), list):
        zones = [z for z in map(_zone, h["zones"]) if z]
    elif h.get("emitter"):
        zones = [
            z
            for z in [
                _zone(
                    {
                        "name": "Casa",
                        "area_m2": h.get("heated_area_m2"),
                        "emitter": h["emitter"],
                        "cooling": h["emitter"] != "radiators",
                    }
                )
            ]
            if z
        ]
    else:
        zones = copy.deepcopy(d["zones"])
    heat_pump = h.get("heat_pump")
    if not isinstance(heat_pump, str):
        heat_pump = d["heat_pump"] if "zones" in h else "generic"
    return {
        "climate_zone": h.get("climate_zone") if h.get("climate_zone") in CLIMATE_ZONES else d["climate_zone"],
        "insulation": h.get("insulation") if h.get("insulation") in INSULATIONS else d["insulation"],
        "heat_pump": heat_pump,
        "zones": zones,
    }


def _pv(saved: Any, d: dict[str, Any]) -> dict[str, Any]:
    roofs = saved.get("roofs") if isinstance(saved, dict) else None
    out = []
    for roof in roofs if isinstance(roofs, list) else []:
        if isinstance(roof, dict):
            merged = _merge_numbers(d["roofs"][0], roof)
            out.append({k: clamp(v, *ROOF_LIMITS[k]) for k, v in merged.items()})
    return {"roofs": out} if out else copy.deepcopy(d)


def with_defaults(s: Any, defaults: dict[str, Any] = DEFAULT_SETTINGS) -> dict[str, Any]:
    d = copy.deepcopy(defaults)
    if not isinstance(s, dict):
        return d
    scenarios = s.get("scenarios") if isinstance(s.get("scenarios"), dict) else {}
    return {
        "tariff": _merge_numbers(d["tariff"], s.get("tariff")),
        "system": _merge_numbers(d["system"], s.get("system")),
        "lifetime": _merge_numbers(d["lifetime"], s.get("lifetime")),
        "scenarios": normalize_sizes({**d["scenarios"], **scenarios}, d["scenarios"]),
        "consumption": _consumption(s.get("consumption"), d["consumption"]),
        "house": migrate_house(s.get("house"), d["house"]),
        "pv": _pv(s.get("pv"), d["pv"]),
    }


def migrate_loads(loads: Any) -> list[dict[str, Any]] | None:
    """Saved loads without `kind` are cycle loads; continuous loads without `basis` are manual estimates."""
    if not isinstance(loads, list):
        return None
    out = []
    for load in loads:
        if not isinstance(load, dict):
            continue
        if "kind" not in load:
            load = {**load, "kind": "cycle"}
        elif load["kind"] == "continuous" and "basis" not in load:
            load = {**load, "use": None, "basis": "manual", "area_m2": None}
        out.append(load)
    return out
