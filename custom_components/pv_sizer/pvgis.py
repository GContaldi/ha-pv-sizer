"""Downloads hourly PV production for 1 kWp from PVGIS (re.jrc.ec.europa.eu)."""

from __future__ import annotations

import json
from datetime import tzinfo
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .engine.pvgis import pv_from_seriescalc

URL = "https://re.jrc.ec.europa.eu/api/v5_3/seriescalc"
# About ten years: PVGIS answers with its latest available years (one year is about 0.8 MB of JSON).
YEARS_BACK = 12
TIMEOUT = aiohttp.ClientTimeout(total=120)


class PvgisError(Exception):
    pass


def roof_key(latitude: float, longitude: float, roof: dict[str, Any]) -> str:
    return f"{latitude:.3f},{longitude:.3f},{roof['tilt_deg']:g},{roof['azimuth_deg']:g},{roof['loss_pct']:g}"


async def async_fetch(hass: HomeAssistant, latitude: float, longitude: float, roof: dict[str, Any]) -> dict[str, Any]:
    params = {
        "lat": f"{latitude:.4f}",
        "lon": f"{longitude:.4f}",
        "peakpower": 1,
        "loss": roof["loss_pct"],
        "angle": roof["tilt_deg"],
        "aspect": roof["azimuth_deg"],
        "pvcalculation": 1,
        "outputformat": "json",
        "startyear": dt_util.now().year - YEARS_BACK,
    }
    try:
        async with async_get_clientsession(hass).get(URL, params=params, timeout=TIMEOUT) as resp:
            text = await resp.text()
            if resp.status != 200:
                raise PvgisError(f"PVGIS {resp.status}: {text[:200]}")
    except (aiohttp.ClientError, TimeoutError) as err:
        raise PvgisError(str(err)) from err
    tz: tzinfo = dt_util.get_default_time_zone()

    def parse() -> dict[str, Any]:
        return pv_from_seriescalc(json.loads(text), tz)

    try:
        return await hass.async_add_executor_job(parse)
    except (ValueError, KeyError, TypeError) as err:
        raise PvgisError(f"Unexpected PVGIS answer: {err}") from err
