from custom_components.pv_sizer.engine.settings import DEFAULT_SETTINGS, migrate_loads, with_defaults


def test_missing_settings_are_the_defaults():
    assert with_defaults(None) == DEFAULT_SETTINGS
    assert with_defaults(None) is not DEFAULT_SETTINGS


def test_legacy_house_becomes_one_zone_with_generic_pump():
    s = with_defaults(
        {"house": {"climate_zone": "D", "insulation": "medium", "heated_area_m2": 100, "emitter": "fancoil"}}
    )
    assert s["house"] == {
        "climate_zone": "D",
        "insulation": "medium",
        "heat_pump": "generic",
        "zones": [{"name": "Casa", "area_m2": 100, "emitter": "fancoil", "cooling": True}],
    }


def test_radiators_never_cool():
    s = with_defaults({"house": {"zones": [{"name": "Giù", "area_m2": 50, "emitter": "radiators", "cooling": True}]}})
    assert s["house"]["zones"][0]["cooling"] is False


def test_bad_numbers_keep_defaults_and_sizes_are_cleaned():
    s = with_defaults(
        {"tariff": {"energy_price": "x", "vat_pct": 22}, "scenarios": {"pv_sizes_kwp": [9, 3, 3.04, 100]}}
    )
    assert s["tariff"]["energy_price"] == DEFAULT_SETTINGS["tariff"]["energy_price"]
    assert s["tariff"]["vat_pct"] == 22
    assert s["scenarios"]["pv_sizes_kwp"] == [3, 9]
    assert s["scenarios"]["battery_sizes_kwh"] == [5, 10, 15]


def test_old_loads_get_kind_and_basis():
    loads = migrate_loads([{"id": "a"}, {"id": "b", "kind": "continuous"}, "junk"])
    assert loads == [
        {"id": "a", "kind": "cycle"},
        {"id": "b", "kind": "continuous", "use": None, "basis": "manual", "area_m2": None},
    ]
    assert migrate_loads(None) is None
