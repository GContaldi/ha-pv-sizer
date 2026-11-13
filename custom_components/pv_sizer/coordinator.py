"""Builds the engine's inputs from Home Assistant and runs the calculation off the event loop."""

from __future__ import annotations

import asyncio
import copy
import json
from datetime import date, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .engine.common import HORIZON_YEARS, round2
from .engine.consumption import MeterHistory
from .engine.detect import detect_load
from .engine.history import day_shapes, meter_history, valid_days
from .engine.house import heat_pump_options
from .engine.results import Engine, Inputs
from .history import EnergyPrefs, async_energy_prefs, async_energy_statistics, async_hourly_changes
from .storage import PvSizerStore

HISTORY_DAYS = 365


def _options(first: list[str], stats: dict[str, str], exclude: set[str]) -> list[dict[str, str]]:
    """`first` in order, then every other energy statistic by name."""
    head = [s for s in dict.fromkeys(first) if s in stats]
    rest = sorted((s for s in stats if s not in exclude and s not in head), key=lambda s: stats[s].lower())
    return [{"entity_id": s, "name": stats[s]} for s in head + rest]


class PvSizerCoordinator:
    def __init__(self, hass: HomeAssistant, store: PvSizerStore) -> None:
        self.hass = hass
        self.store = store
        # One calculation at a time; requests during a calculation wait for it and reuse it.
        self._lock = asyncio.Lock()
        self._engine: Engine | None = None
        self._engine_key: str | None = None
        self._computed = False
        # Bumped whenever data from outside the store changes (meter history, sensors, PV yield).
        self.data_version = 0
        self._data_key: tuple[Any, ...] | None = None
        self.meter: MeterHistory | None = None
        self.day_shapes: list[list[list[float]]] | None = None
        self.detected: list[dict[str, Any]] = []
        self._detected_key: tuple[Any, ...] | None = None
        self.sensor_options: list[dict[str, str]] = []
        self.meter_options: list[dict[str, str]] = []

    async def async_setup(self) -> None:
        if self.store.is_new:
            prefs = await async_energy_prefs(self.hass)
            if prefs.grid_imports:
                settings = copy.deepcopy(self.store.settings)
                settings["consumption"]["meter_entity_id"] = prefs.grid_imports[0]
                await self.store.async_set_settings(settings)

    def _sensor_ids(self) -> set[str]:
        return {
            load["sensor_entity_id"]
            for load in self.store.loads
            if load.get("source") == "sensor" and load.get("sensor_entity_id")
        }

    async def _async_refresh_data(self) -> None:
        """Meter history and options once a day, or when the meter or the load sensors change."""
        meter_id = self.store.settings["consumption"]["meter_entity_id"]
        sensors = self._sensor_ids()
        today = dt_util.now().date()
        key = (meter_id, tuple(sorted(sensors)), today)
        if key == self._data_key:
            return
        prefs: EnergyPrefs = await async_energy_prefs(self.hass)
        stats = await async_energy_statistics(self.hass)
        self.meter_options = _options(prefs.grid_imports, stats, prefs.not_loads | set(prefs.devices))
        self.sensor_options = _options(prefs.devices, stats, prefs.not_loads)
        self.meter, self.day_shapes = await self._async_meter(meter_id, sensors & set(stats), today)
        option_ids = tuple(o["entity_id"] for o in self.sensor_options)
        if self._detected_key != (option_ids, today):
            self.detected = await self._async_detect(option_ids, today)
            self._detected_key = (option_ids, today)
        self._data_key = key
        self.data_version += 1

    async def _async_detect(self, statistic_ids: tuple[str, ...], today: date) -> list[dict[str, Any]]:
        """One sensor at a time: a year of hourly rows for every option at once would weigh on small boxes."""
        tz = dt_util.get_default_time_zone()
        end = dt_util.start_of_local_day(today)
        start = dt_util.start_of_local_day(today - timedelta(days=HISTORY_DAYS))
        detected = []
        for sid in statistic_ids:
            hourly = (await async_hourly_changes(self.hass, {sid}, start, end)).get(sid)
            if not hourly:
                continue
            found = await self.hass.async_add_executor_job(detect_load, sid, hourly, tz)
            if found:
                detected.append(found)
        return detected

    async def _async_meter(
        self, meter_id: str | None, sensors: set[str], today: date
    ) -> tuple[MeterHistory | None, list[list[list[float]]] | None]:
        if not meter_id:
            return None, None
        tz = dt_util.get_default_time_zone()
        end = dt_util.start_of_local_day(today)
        first = today - timedelta(days=HISTORY_DAYS)
        start = dt_util.start_of_local_day(first) - timedelta(hours=1)
        changes = await async_hourly_changes(self.hass, {meter_id, *sensors}, start, end)
        hourly = changes.get(meter_id)
        if not hourly:
            return None, None
        subtract = [changes[s] for s in sensors if s in changes and s != meter_id]

        def fold():
            days = valid_days(hourly, tz, first, today - timedelta(days=1))
            return meter_history(days), day_shapes(days, subtract, tz)

        return await self.hass.async_add_executor_job(fold)

    def _inputs(self) -> Inputs:
        return Inputs(
            settings=self.store.settings,
            loads=self.store.loads,
            detected=self.detected,
            meter=self.meter,
            day_shapes=self.day_shapes,
        )

    async def _async_engine(self, compute: bool) -> Engine:
        async with self._lock:
            await self._async_refresh_data()
            key = json.dumps([self.store.settings, self.store.loads, self.data_version], sort_keys=True)
            if self._engine is None or key != self._engine_key:
                self._engine, self._engine_key, self._computed = Engine(self._inputs()), key, False
            engine = self._engine
            if compute and not self._computed and engine.monthly is not None:
                await self.hass.async_add_executor_job(engine.compute)
                self._computed = True
            return engine

    async def async_config(self) -> dict[str, Any]:
        engine = await self._async_engine(compute=True)
        cfg = self.hass.config
        return {
            "demo": False,
            "location": {"name": cfg.location_name, "latitude": cfg.latitude, "longitude": cfg.longitude},
            "horizon_years": HORIZON_YEARS,
            "data": {**engine.data_info, "loads_exceed_months": engine.loads_exceed_months()},
            "settings": engine.settings,
            "loads": engine.loads,
            "detected": self.detected,
            "sensor_options": self.sensor_options,
            "meter_options": self.meter_options,
            "heat_pump_options": heat_pump_options(),
            "derived": {
                "grid_price_eur_kwh": engine.prices.grid,
                "fixed_annual_eur": round2(engine.prices.fixed_annual),
                "house": engine.model,
            },
        }

    async def async_results(self) -> dict[str, Any]:
        engine = await self._async_engine(compute=True)
        return await self.hass.async_add_executor_job(engine.results)

    async def async_scenario(self, pv_kwp: float, battery_kwh: float, shift: bool) -> dict[str, Any]:
        engine = await self._async_engine(compute=True)
        return await self.hass.async_add_executor_job(engine.scenario, pv_kwp, battery_kwh, shift)

    async def async_update_settings(self, settings: Any) -> dict[str, Any]:
        await self.store.async_set_settings(settings)
        return await self.async_config()

    async def async_update_loads(self, loads: Any) -> dict[str, Any]:
        await self.store.async_set_loads(loads)
        return await self.async_config()
