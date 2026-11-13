"""The Python engine against the TypeScript demo on the same inputs (fixtures: cd frontend && npm run fixtures)."""

import json
import math
from pathlib import Path

import pytest

from custom_components.pv_sizer.engine.consumption import MeterHistory
from custom_components.pv_sizer.engine.results import Engine, Inputs, MissingConsumption
from custom_components.pv_sizer.engine.settings import migrate_loads, with_defaults

CASES = json.loads((Path(__file__).parent / "fixtures" / "demo-cases.json").read_text())
# Floating point maths differs in the last bits (sin, pow, sum order); rounded outputs may flip by one unit.
REL_TOL = 1e-9
ROUNDED_TOL = 0.011


def assert_close(actual, expected, path="$"):
    if isinstance(expected, dict):
        assert isinstance(actual, dict), path
        assert set(actual) == set(expected), f"{path}: keys {set(actual) ^ set(expected)}"
        for k, v in expected.items():
            assert_close(actual[k], v, f"{path}.{k}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), path
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_close(a, e, f"{path}[{i}]")
    elif isinstance(expected, (int, float)) and not isinstance(expected, bool):
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool), f"{path}: {actual!r}"
        tol = ROUNDED_TOL if float(expected).is_integer() or round(expected, 2) == expected else 0
        assert math.isclose(actual, expected, rel_tol=REL_TOL, abs_tol=tol), f"{path}: {actual} != {expected}"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def engine_for(case) -> Engine:
    inputs = case["inputs"]
    m = inputs["meter"]
    meter = MeterHistory(m["from"], m["to"], m["days"], m["daysByMonth"], m["kwhByMonth"]) if m else None
    return Engine(Inputs(with_defaults(inputs["settings"]), migrate_loads(inputs["loads"]), inputs["detected"], meter))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_demo(case):
    engine = engine_for(case)
    assert engine.settings == case["config"]["settings"]
    assert engine.loads == case["config"]["loads"]
    assert_close(engine.model, case["config"]["derived"]["house"], "house")
    assert_close(engine.prices.grid, case["config"]["derived"]["grid_price_eur_kwh"], "grid_price")
    if "error" in case["results"]:
        with pytest.raises(MissingConsumption):
            engine.results()
        assert_close({**engine.data_info, "loads_exceed_months": engine.loads_exceed_months()}, case["config"]["data"])
        return
    assert_close({**engine.data_info, "loads_exceed_months": engine.loads_exceed_months()}, case["config"]["data"])
    assert_close(engine.results(), case["results"]["ok"], "results")
    for sc in case["scenarios"]:
        r = sc["request"]
        assert_close(engine.scenario(r["pv_kwp"], r["battery_kwh"], r["shift"]), sc["ok"], f"scenario{r}")
