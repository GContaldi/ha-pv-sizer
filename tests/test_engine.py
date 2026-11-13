import copy

import pytest

from custom_components.pv_sizer.engine.base import Mulberry32
from custom_components.pv_sizer.engine.results import Engine, Inputs, MissingConsumption
from custom_components.pv_sizer.engine.settings import DEFAULT_LOADS, with_defaults


def test_rng_matches_the_demo():
    r = Mulberry32(40721487)
    # First draws of the demo's mulberry32(40721487) in Node.
    assert [r() for _ in range(3)] == [0.30942073464393616, 0.5769832679070532, 0.1869903423357755]


def test_missing_consumption_cannot_be_simulated():
    engine = Engine(Inputs(with_defaults(None), copy.deepcopy(DEFAULT_LOADS)))
    assert engine.data_info["source"] == "missing"
    assert engine.loads_exceed_months() == []
    with pytest.raises(MissingConsumption):
        engine.results()


def test_scenario_falls_back_to_the_nearest_size():
    engine = Engine(Inputs(with_defaults({"consumption": {"annual_kwh": 5000}}), copy.deepcopy(DEFAULT_LOADS)))
    detail = engine.scenario(5.9, 12, False)
    assert (detail["summary"]["pv_kwp"], detail["summary"]["battery_kwh"]) == (6, 10)
    assert engine.scenario(0, 10, False)["summary"]["battery_kwh"] == 0
