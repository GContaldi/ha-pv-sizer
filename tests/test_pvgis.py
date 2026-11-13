import copy
import json
import math
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.pv_sizer.const import DOMAIN
from custom_components.pv_sizer.engine.pvgis import median_year, pv_from_seriescalc
from custom_components.pv_sizer.engine.results import Engine, Inputs
from custom_components.pv_sizer.engine.settings import DEFAULT_LOADS, with_defaults

from .conftest import PVGIS

ROME = ZoneInfo("Europe/Rome")


def seriescalc(years: dict[int, float]) -> dict:
    """Bell-shaped days around 11:00 UTC; `years` maps year → scale of the production."""
    hourly = []
    for year, scale in years.items():
        t = datetime(year, 1, 1, tzinfo=UTC)
        while t.year == year:
            p = max(0.0, math.cos((t.hour + 0.5 - 11.5) / 6 * math.pi / 2)) * 800 * scale
            hourly.append({"time": t.strftime("%Y%m%d:%H10"), "P": round(p, 2), "G(i)": 0, "T2m": 10})
            t += timedelta(hours=1)
    return {"inputs": {"meteo_data": {"radiation_db": "PVGIS-SARAH3"}}, "outputs": {"hourly": hourly}}


def test_median_year():
    assert median_year({2019: 1400, 2020: 1350, 2021: 1500}) == 2019
    assert median_year({2022: 1400, 2023: 1500}) == 2023


def test_typical_year_is_local_and_drops_29_february():
    pv = pv_from_seriescalc(seriescalc({2020: 1.0, 2021: 0.9, 2022: 1.1}), ROME)
    assert pv["year"] == 2020
    assert set(pv["totals"]) == {"2020", "2021", "2022"}
    hourly = pv["hourly"]
    assert len(hourly) == 8760
    # 11:00 UTC is 12:00 in January and 13:00 in July (summer time).
    jan, jul = hourly[0:24], hourly[181 * 24 : 182 * 24]
    assert jan.index(max(jan)) == 12
    assert jul.index(max(jul)) == 13
    # One day less than 2020's 366.
    assert abs(sum(hourly) - pv["totals"]["2020"] * 365 / 366) < 0.5


def test_engine_uses_the_hourly_series():
    pv = pv_from_seriescalc(seriescalc({2021: 1.0}), ROME)
    settings = with_defaults({"consumption": {"annual_kwh": 5000}})
    engine = Engine(Inputs(settings, copy.deepcopy(DEFAULT_LOADS), pv_hourly=pv["hourly"]))
    detail = engine.scenario(6, 0, False)
    assert abs(detail["energy"]["pv_kwh"] - 6 * sum(pv["hourly"])) <= 1


@pytest.mark.usefixtures("ha_env")
async def test_pvgis_then_offline_after_a_roof_change(hass: HomeAssistant, hass_ws_client, aioclient_mock) -> None:
    await hass.config.async_set_time_zone("Europe/Rome")
    aioclient_mock.clear_requests()
    aioclient_mock.get(PVGIS, text=json.dumps(seriescalc({2021: 1.0, 2022: 1.05, 2023: 0.95})))
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json({"id": 1, "type": "pv_sizer/config"})
    cfg = (await client.receive_json())["result"]
    assert cfg["pv_yield"]["source"] == "pvgis"
    assert cfg["pv_yield"]["year"] == 2021
    assert cfg["pv_yield"]["warning"] is None
    assert len(aioclient_mock.mock_calls) == 1
    query = aioclient_mock.mock_calls[0][1].query
    assert (query["angle"], query["aspect"], query["loss"], query["peakpower"]) == ("30", "0", "14", "1")

    await client.send_json({"id": 2, "type": "pv_sizer/config"})
    await client.receive_json()
    assert len(aioclient_mock.mock_calls) == 1, "cached in the store"

    aioclient_mock.clear_requests()
    aioclient_mock.get(PVGIS, status=503, text="down")
    settings = cfg["settings"]
    settings["pv"]["roofs"][0]["azimuth_deg"] = -90
    await client.send_json({"id": 3, "type": "pv_sizer/settings/update", "settings": settings})
    cfg = (await client.receive_json())["result"]
    assert cfg["pv_yield"] == {**cfg["pv_yield"], "source": "pvgis", "year": 2021, "warning": "pvgis_unavailable"}

    await client.send_json({"id": 4, "type": "pv_sizer/config"})
    await client.receive_json()
    assert len(aioclient_mock.mock_calls) == 1, "no retry within the hour"
