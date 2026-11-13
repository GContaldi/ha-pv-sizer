"""Settings, loads and cached data in a versioned Home Assistant Store."""

from __future__ import annotations

import copy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .engine.settings import DEFAULT_LOADS, migrate_loads, with_defaults


class PvSizerStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.settings: dict[str, Any] = with_defaults(None)
        self.loads: list[dict[str, Any]] = copy.deepcopy(DEFAULT_LOADS)
        # Data fetched from outside (PVGIS) that should survive restarts and network outages.
        self.cache: dict[str, Any] = {}
        # Nothing saved yet: first setup.
        self.is_new = True

    async def async_load(self) -> None:
        data = await self._store.async_load()
        self.is_new = data is None
        data = data or {}
        self.settings = with_defaults(data.get("settings"))
        self.loads = migrate_loads(data.get("loads")) or copy.deepcopy(DEFAULT_LOADS)
        self.cache = data.get("cache") if isinstance(data.get("cache"), dict) else {}

    async def async_set_settings(self, settings: Any) -> None:
        self.settings = with_defaults(settings)
        await self.async_save()

    async def async_set_loads(self, loads: Any) -> None:
        self.loads = migrate_loads(loads) or []
        await self.async_save()

    async def async_set_cache(self, key: str, value: Any) -> None:
        self.cache[key] = value
        await self.async_save()

    async def async_remove(self) -> None:
        await self._store.async_remove()

    async def async_save(self) -> None:
        self.is_new = False
        await self._store.async_save({"settings": self.settings, "loads": self.loads, "cache": self.cache})
