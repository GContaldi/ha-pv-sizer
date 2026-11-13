from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from custom_components.pv_sizer.engine.detect import detect_load

ROME = ZoneInfo("Europe/Rome")
START = datetime(2025, 11, 12, tzinfo=ROME)


def series(days: int, kwh) -> dict[float, float]:
    out = {}
    t = START
    end = START + timedelta(days=days)
    while t < end:
        out[t.timestamp()] = kwh(t)
        t = (t.astimezone(ROME) + timedelta(hours=1)).astimezone(ROME)
    return out


def washer(t: datetime) -> float:
    # Monday, Wednesday, Saturday: 19:40–21:40 at 0.9 kW, standby 2 W.
    if t.weekday() in (0, 2, 5):
        return {19: 0.3, 20: 0.9, 21: 0.6}.get(t.hour, 0.002)
    return 0.002


def heat_pump(t: datetime) -> float:
    if t.month in (11, 12, 1, 2, 3):
        return 0.4 + (0.3 if t.hour in (6, 7, 18, 19, 20) else 0)
    return 0.01


def test_cycles_from_a_washing_machine():
    det = detect_load("sensor.lavatrice", series(365, washer), ROME)
    assert det["entity_id"] == "sensor.lavatrice"
    assert 150 <= det["cycles_per_year"] <= 160
    # Net of standby.
    assert det["kwh_per_cycle"] == 1.79
    assert det["duration_h"] == 2
    assert det["usual_start_hour"] == 19
    assert "continuous" not in det


def test_short_history_scales_to_a_year():
    det = detect_load("sensor.lavatrice", series(70, washer), ROME)
    assert 140 <= det["cycles_per_year"] <= 170


def test_daily_draw_from_a_heat_pump():
    det = detect_load("sensor.pdc", series(365, heat_pump), ROME)
    assert det["cycles_per_year"] == 0
    cont = det["continuous"]
    assert cont["kwh_per_day_by_month"][0] == round(24 * 0.39 + 5 * 0.3, 1)
    assert cont["kwh_per_day_by_month"][6] == 0
    assert cont["hour_profile"][7] > cont["hour_profile"][3]


def test_nothing_to_find():
    assert detect_load("sensor.frigo", series(365, lambda t: 0.04), ROME) is None
    assert detect_load("sensor.nuovo", series(5, washer), ROME) is None
