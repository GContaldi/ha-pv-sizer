"""PV Sizer: size photovoltaics and batteries on the house's own consumption."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .panel import async_register_panel, async_unregister_panel
from .storage import PvSizerStore

type PvSizerConfigEntry = ConfigEntry[PvSizerStore]


async def async_setup_entry(hass: HomeAssistant, entry: PvSizerConfigEntry) -> bool:
    store = PvSizerStore(hass)
    await store.async_load()
    entry.runtime_data = store
    hass.data[DOMAIN] = store
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PvSizerConfigEntry) -> bool:
    async_unregister_panel(hass)
    hass.data.pop(DOMAIN, None)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: PvSizerConfigEntry) -> None:
    """Removing the integration also deletes the saved settings and loads."""
    await PvSizerStore(hass).async_remove()
