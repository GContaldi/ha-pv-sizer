import pytest
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.pv_sizer.const import DOMAIN, PANEL_URL_PATH

pytestmark = pytest.mark.usefixtures("ha_env")


async def test_config_flow_creates_one_entry(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY

    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert again["type"] is FlowResultType.ABORT
    assert again["reason"] == "single_instance_allowed"


async def test_panel_registered_for_admins_and_removed_on_unload(hass: HomeAssistant) -> None:
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    panel = hass.data["frontend_panels"][PANEL_URL_PATH]
    assert panel.require_admin
    assert panel.config["_panel_custom"]["name"] == "pv-sizer-panel"

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert PANEL_URL_PATH not in hass.data["frontend_panels"]
