"""Serves the built panel and adds it to the sidebar (admins only)."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    DATA_STATIC_REGISTERED,
    PANEL_FILE,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
    STATIC_URL_PATH,
)

FRONTEND_DIR = Path(__file__).parent / "frontend"


def _panel_version() -> str:
    """Changes with every build, so browsers drop the cached panel after an update."""
    try:
        return str(int((FRONTEND_DIR / PANEL_FILE).stat().st_mtime))
    except OSError:
        return "0"


async def async_register_panel(hass: HomeAssistant) -> None:
    # Static paths cannot be removed, so they are registered once per run of Home Assistant.
    if not hass.data.get(DATA_STATIC_REGISTERED):
        await hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL_PATH, str(FRONTEND_DIR), True)])
        hass.data[DATA_STATIC_REGISTERED] = True
    version = await hass.async_add_executor_job(_panel_version)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL_PATH}/{PANEL_FILE}?v={version}",
        embed_iframe=False,
        require_admin=True,
    )


def async_unregister_panel(hass: HomeAssistant) -> None:
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
