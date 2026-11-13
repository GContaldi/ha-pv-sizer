"""Reads the Energy dashboard preferences and hourly long-term statistics from the recorder.

These are internal Home Assistant APIs: hacs.json sets the minimum version they were checked against.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from homeassistant.components.energy.data import async_get_manager
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import async_list_statistic_ids, statistics_during_period
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


@dataclass
class EnergyPrefs:
    grid_imports: list[str] = field(default_factory=list)
    # Statistics that are not consumption: grid export, solar, batteries.
    not_loads: set[str] = field(default_factory=set)
    devices: list[str] = field(default_factory=list)


async def async_energy_prefs(hass: HomeAssistant) -> EnergyPrefs:
    """Grid import meters and individual devices from the Energy dashboard; empty when it is not set up."""
    try:
        manager = await async_get_manager(hass)
    except Exception:  # noqa: BLE001
        _LOGGER.debug("Energy preferences not available", exc_info=True)
        return EnergyPrefs()
    data: dict[str, Any] = manager.data or {}
    prefs = EnergyPrefs()
    for source in data.get("energy_sources", []):
        if source.get("type") == "grid":
            # Unified format (2026+) has one import per grid; the legacy format a flow_from list.
            imports = [source.get("stat_energy_from")] + [
                f.get("stat_energy_from") for f in source.get("flow_from", [])
            ]
            prefs.grid_imports += [s for s in imports if s and s not in prefs.grid_imports]
            exports = [source.get("stat_energy_to")] + [f.get("stat_energy_to") for f in source.get("flow_to", [])]
            prefs.not_loads.update(s for s in exports if s)
        else:
            prefs.not_loads.update(source.get(k) for k in ("stat_energy_from", "stat_energy_to") if source.get(k))
    prefs.not_loads.update(prefs.grid_imports)
    prefs.devices = [d["stat_consumption"] for d in data.get("device_consumption", []) if d.get("stat_consumption")]
    return prefs


async def async_energy_statistics(hass: HomeAssistant) -> dict[str, str]:
    """statistic_id → display name, for every energy statistic with a running sum (kWh, Wh, MWh…)."""
    out = {}
    for item in await async_list_statistic_ids(hass, statistic_type="sum"):
        if item.get("unit_class") != "energy" or not item.get("has_sum"):
            continue
        sid = item["statistic_id"]
        state = hass.states.get(sid)
        out[sid] = item.get("name") or (state.name if state else None) or sid
    return out


async def async_hourly_changes(
    hass: HomeAssistant, statistic_ids: set[str], start: datetime, end: datetime
) -> dict[str, dict[float, float]]:
    """kWh per hour for each statistic: UTC timestamp of the hour start → change."""
    if not statistic_ids:
        return {}
    rows = await get_instance(hass).async_add_executor_job(
        statistics_during_period, hass, start, end, statistic_ids, "hour", {"energy": "kWh"}, {"change"}
    )
    return {
        sid: {r["start"]: r["change"] for r in series if r.get("change") is not None} for sid, series in rows.items()
    }
