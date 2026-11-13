from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from custom_components.pv_sizer.engine.history import day_shapes, meter_history, valid_days

ROME = ZoneInfo("Europe/Rome")


def hourly(first: date, days: int, kwh=lambda t: 0.5) -> dict[float, float]:
    start = datetime(first.year, first.month, first.day, tzinfo=ROME).timestamp()
    end = start + (days + 1) * 86400
    out = {}
    t = start - 3600
    while t < end:
        out[t] = kwh(t)
        t += 3600
    return out


def test_gap_drops_the_day_and_the_day_after():
    first = date(2026, 1, 1)
    meter = hourly(first, 10)
    gap = datetime(2026, 1, 3, 23, tzinfo=ROME).timestamp()
    del meter[gap]
    days = valid_days(meter, ROME, first, date(2026, 1, 10))
    assert [d.day.day for d in days] == [1, 2, 5, 6, 7, 8, 9, 10]
    assert all(abs(d.total - 12) < 1e-9 for d in days)


def test_dst_days_have_23_and_25_hours():
    spring = valid_days(hourly(date(2026, 3, 29), 1), ROME, date(2026, 3, 29), date(2026, 3, 29))
    autumn = valid_days(hourly(date(2026, 10, 25), 1), ROME, date(2026, 10, 25), date(2026, 10, 25))
    assert abs(spring[0].total - 23 * 0.5) < 1e-9
    assert abs(autumn[0].total - 25 * 0.5) < 1e-9
    assert spring[0].hours[2] == 0
    assert autumn[0].hours[2] == 1.0


def test_meter_history_folds_months():
    first = date(2025, 11, 12)
    days = valid_days(hourly(first, 365), ROME, first, first + timedelta(days=364))
    meter = meter_history(days)
    assert meter.days == 365
    assert meter.days_by_month == [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    assert abs(meter.kwh_by_month[0] - 31 * 12) < 1e-6
    assert (meter.start, meter.end) == ("2025-11-12", "2026-11-11")


def test_day_shapes_subtract_sensor_loads():
    first = date(2026, 1, 1)

    def evening(t: float) -> float:
        return 2.0 if datetime.fromtimestamp(t, ROME).hour == 20 else 0.5

    meter = hourly(first, 20, evening)
    washer = {t: 1.5 for t in meter if datetime.fromtimestamp(t, ROME).hour == 20}
    days = valid_days(meter, ROME, first, date(2026, 1, 20))
    assert day_shapes(days[:10]) is None
    shapes = day_shapes(days, [washer], ROME)
    assert len(shapes) == 12
    weekday_jan = shapes[0][0]
    assert abs(sum(weekday_jan) - 1) < 1e-9
    assert abs(weekday_jan[20] - 1 / 24) < 1e-9
    # Months without days borrow the shape of the days there are.
    assert shapes[6] == [shapes[6][0], shapes[6][1]]
