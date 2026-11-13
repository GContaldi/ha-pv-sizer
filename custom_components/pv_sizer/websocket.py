"""The panel's WebSocket contract (frontend/src/api/types.ts). Admins only, like the panel."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DATA_WS_REGISTERED, DOMAIN
from .coordinator import PvSizerCoordinator
from .engine.results import MissingConsumption

MISSING_CONSUMPTION = "Mancano i dati di consumo: scegli un misuratore o inserisci il consumo annuo."


def async_setup(hass: HomeAssistant) -> None:
    # Commands cannot be unregistered: once per run of Home Assistant; they answer "not_loaded" after unload.
    if hass.data.get(DATA_WS_REGISTERED):
        return
    for handler in (ws_config, ws_results, ws_scenario, ws_update_settings, ws_update_loads):
        websocket_api.async_register_command(hass, handler)
    hass.data[DATA_WS_REGISTERED] = True


async def _respond(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    work: Callable[[PvSizerCoordinator], Awaitable[Any]],
) -> None:
    coordinator: PvSizerCoordinator | None = hass.data.get(DOMAIN)
    if coordinator is None:
        connection.send_error(msg["id"], "not_loaded", "L'integrazione PV Sizer non è attiva.")
        return
    try:
        connection.send_result(msg["id"], await work(coordinator))
    except MissingConsumption:
        connection.send_error(msg["id"], "missing_consumption", MISSING_CONSUMPTION)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "pv_sizer/config"})
@websocket_api.async_response
async def ws_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _respond(hass, connection, msg, lambda c: c.async_config())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "pv_sizer/results"})
@websocket_api.async_response
async def ws_results(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _respond(hass, connection, msg, lambda c: c.async_results())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "pv_sizer/scenario",
        vol.Required("pv_kwp"): vol.Coerce(float),
        vol.Required("battery_kwh"): vol.Coerce(float),
        vol.Optional("shift", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_scenario(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _respond(hass, connection, msg, lambda c: c.async_scenario(msg["pv_kwp"], msg["battery_kwh"], msg["shift"]))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "pv_sizer/settings/update", vol.Required("settings"): dict})
@websocket_api.async_response
async def ws_update_settings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    await _respond(hass, connection, msg, lambda c: c.async_update_settings(msg["settings"]))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "pv_sizer/loads/update", vol.Required("loads"): list})
@websocket_api.async_response
async def ws_update_loads(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _respond(hass, connection, msg, lambda c: c.async_update_loads(msg["loads"]))
