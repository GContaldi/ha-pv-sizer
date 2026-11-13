import pytest


@pytest.fixture
def ha_env(recorder_mock, enable_custom_integrations):
    """Recorder first, then Home Assistant with custom integrations. Engine tests do not need it."""
    yield
