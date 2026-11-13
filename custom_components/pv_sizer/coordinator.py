"""Builds the engine's inputs from Home Assistant and runs the calculation off the event loop."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from homeassistant.core import HomeAssistant

from .engine.common import HORIZON_YEARS, round2
from .engine.house import heat_pump_options
from .engine.results import Engine, Inputs
from .storage import PvSizerStore


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
        self.detected: list[dict[str, Any]] = []
        self.sensor_options: list[dict[str, str]] = []
        self.meter_options: list[dict[str, str]] = []

    async def async_setup(self) -> None:
        """Nothing to prepare yet: the data sources are added stage by stage."""

    def _inputs(self) -> Inputs:
        return Inputs(settings=self.store.settings, loads=self.store.loads, detected=self.detected)

    async def _async_engine(self, compute: bool) -> Engine:
        async with self._lock:
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
