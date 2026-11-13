import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.pv_sizer.const import DOMAIN

pytestmark = pytest.mark.usefixtures("ha_env")


@pytest.fixture
async def ws(hass: HomeAssistant, hass_ws_client):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    seq = iter(range(1, 1000))

    async def call(type_: str, **kwargs):
        await client.send_json({"id": next(seq), "type": type_, **kwargs})
        return await client.receive_json()

    return call


async def test_config_without_consumption(ws) -> None:
    msg = await ws("pv_sizer/config")
    assert msg["success"]
    cfg = msg["result"]
    assert cfg["demo"] is False
    assert cfg["data"]["source"] == "missing"
    assert cfg["data"]["loads_exceed_months"] == []
    assert {o["id"] for o in cfg["heat_pump_options"]} == {"generic", "daikin_altherma3_rf_11"}

    msg = await ws("pv_sizer/results")
    assert not msg["success"]
    assert msg["error"]["code"] == "missing_consumption"


async def test_settings_update_then_results_and_scenario(ws) -> None:
    cfg = (await ws("pv_sizer/config"))["result"]
    settings = cfg["settings"]
    settings["consumption"]["annual_kwh"] = 5000
    msg = await ws("pv_sizer/settings/update", settings=settings)
    assert msg["success"]
    assert msg["result"]["data"]["source"] == "estimate"
    assert msg["result"]["data"]["annual_kwh"] == 5000

    results = (await ws("pv_sizer/results"))["result"]
    assert len(results["cells"]) == 2 * 5 * 4
    detail = (await ws("pv_sizer/scenario", pv_kwp=6, battery_kwh=10, shift=True))["result"]
    assert detail["summary"]["pv_kwp"] == 6
    assert len(detail["costs"]["cash_flow_eur"]) == cfg["horizon_years"] + 1

    again = (await ws("pv_sizer/config"))["result"]
    assert again["settings"]["consumption"]["annual_kwh"] == 5000


async def test_loads_update(ws) -> None:
    cfg = (await ws("pv_sizer/config"))["result"]
    loads = [load for load in cfg["loads"] if load["kind"] == "cycle"]
    msg = await ws("pv_sizer/loads/update", loads=loads)
    assert msg["success"]
    assert [load["id"] for load in msg["result"]["loads"]] == [load["id"] for load in loads]


async def test_admin_only(hass: HomeAssistant, ws, hass_admin_user) -> None:
    hass_admin_user.groups = []
    msg = await ws("pv_sizer/config")
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"
