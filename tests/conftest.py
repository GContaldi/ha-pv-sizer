import re

import pytest

PVGIS = re.compile(r"^https://re\.jrc\.ec\.europa\.eu/")


@pytest.fixture
def ha_env(recorder_mock, enable_custom_integrations, aioclient_mock):
    """Recorder first, then Home Assistant with custom integrations. PVGIS is down unless a test says otherwise.
    Engine tests do not need it."""
    aioclient_mock.get(PVGIS, status=503, text="down")
    yield
