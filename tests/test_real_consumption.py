from datetime import timedelta

import pytest
from homeassistant.components.energy.data import async_get_manager
from homeassistant.components.recorder.models import StatisticMeanType
from homeassistant.components.recorder.statistics import async_import_statistics
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from custom_components.pv_sizer.const import DOMAIN

pytestmark = pytest.mark.usefixtures("ha_env")

GRID = "sensor.casa_prelievo"
WASHER = "sensor.lavatrice_energia"
EXPORT = "sensor.casa_immissione"


def import_sum(hass: HomeAssistant, statistic_id: str, name: str, days: int, kwh_per_hour: float) -> None:
    hass.states.async_set(statistic_id, "0", {"friendly_name": name, "unit_of_measurement": "kWh"})
    end = dt_util.start_of_local_day()
    start = end - timedelta(days=days)
    rows, total, t = [], 0.0, start
    while t < end:
        total += kwh_per_hour
        rows.append({"start": dt_util.as_utc(t), "state": total, "sum": total})
        t += timedelta(hours=1)
    async_import_statistics(
        hass,
        {
            "mean_type": StatisticMeanType.NONE,
            "has_sum": True,
            "name": None,
            "source": "recorder",
            "statistic_id": statistic_id,
            "unit_class": "energy",
            "unit_of_measurement": "kWh",
        },
        rows,
    )


async def test_meter_history_from_the_energy_dashboard(hass: HomeAssistant, hass_ws_client) -> None:
    await hass.config.async_set_time_zone("Europe/Rome")
    import_sum(hass, GRID, "Prelievo rete", 40, 0.6)
    import_sum(hass, WASHER, "Lavatrice", 40, 0.05)
    import_sum(hass, EXPORT, "Immissione", 40, 0.1)
    await async_wait_recording_done(hass)
    manager = await async_get_manager(hass)
    await manager.async_update(
        {
            "energy_sources": [
                {
                    "type": "grid",
                    "stat_energy_from": GRID,
                    "stat_energy_to": EXPORT,
                    "stat_cost": None,
                    "entity_energy_price": None,
                    "number_energy_price": None,
                    "stat_compensation": None,
                    "entity_energy_price_export": None,
                    "number_energy_price_export": None,
                    "cost_adjustment_day": 0,
                }
            ],
            "device_consumption": [{"stat_consumption": WASHER}],
        }
    )

    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "pv_sizer/config"})
    cfg = (await client.receive_json())["result"]

    assert cfg["settings"]["consumption"]["meter_entity_id"] == GRID
    assert cfg["meter_options"][0] == {"entity_id": GRID, "name": "Prelievo rete"}
    assert EXPORT not in {o["entity_id"] for o in cfg["meter_options"] + cfg["sensor_options"]}
    assert cfg["sensor_options"][0]["entity_id"] == WASHER
    data = cfg["data"]
    assert data["source"] == "mixed"
    assert data["pattern_source"] == "sensor"
    # The first day has no hour before it in the history: dropped as possibly after a gap.
    assert 38 <= data["days"] <= 40
    assert data["to"] == (dt_util.now().date() - timedelta(days=1)).isoformat()
    measured_month = max(data["months"], key=lambda m: m["measured_share"])
    assert measured_month["measured_share"] > 0.5

    await client.send_json({"id": 2, "type": "pv_sizer/results"})
    assert (await client.receive_json())["success"]
