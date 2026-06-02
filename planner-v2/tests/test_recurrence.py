from datetime import date

import pytest

from planner.services.tasks import RecurrenceNotImplementedError, next_date


def _rec(**kw):
    base = {
        "freq": "daily",
        "interval": 1,
        "weekdays": None,
        "monthday": None,
        "base": "due",
        "specific_dates": None,
        "end": {"type": "never", "value": None},
    }
    base.update(kw)
    return base


# --- daily ----------------------------------------------------------------- #

def test_daily_next():
    assert next_date(_rec(freq="daily"), date(2026, 6, 2)) == date(2026, 6, 3)


def test_daily_interval():
    assert next_date(_rec(freq="daily", interval=3), date(2026, 6, 2)) == date(2026, 6, 5)


# --- weekly ---------------------------------------------------------------- #

def test_weekly_plain():
    # 2026-06-02 is a Tuesday
    assert next_date(_rec(freq="weekly"), date(2026, 6, 2)) == date(2026, 6, 9)


def test_weekly_interval():
    assert next_date(_rec(freq="weekly", interval=2), date(2026, 6, 2)) == date(2026, 6, 16)


def test_weekly_weekdays_same_week():
    # Tue (1). weekdays Mon/Wed/Fri (0,2,4) -> next is Wed 2026-06-03
    nxt = next_date(_rec(freq="weekly", weekdays=[0, 2, 4]), date(2026, 6, 2))
    assert nxt == date(2026, 6, 3)
    assert nxt.weekday() == 2


def test_weekly_weekdays_wrap_next_week():
    # Fri 2026-06-05, weekdays Mon (0) -> next Monday 2026-06-08
    nxt = next_date(_rec(freq="weekly", weekdays=[0]), date(2026, 6, 5))
    assert nxt == date(2026, 6, 8)
    assert nxt.weekday() == 0


# --- monthly --------------------------------------------------------------- #

def test_monthly_next():
    assert next_date(_rec(freq="monthly"), date(2026, 6, 2)) == date(2026, 7, 2)


def test_monthly_clamp_end_of_month():
    # Jan 31 + 1 month -> Feb 28 (2026 not leap)
    assert next_date(_rec(freq="monthly"), date(2026, 1, 31)) == date(2026, 2, 28)


def test_monthly_with_monthday():
    nxt = next_date(_rec(freq="monthly", monthday=15), date(2026, 6, 2))
    assert nxt == date(2026, 7, 15)


# --- yearly ---------------------------------------------------------------- #

def test_yearly_next():
    assert next_date(_rec(freq="yearly"), date(2026, 6, 2)) == date(2027, 6, 2)


def test_yearly_feb29_clamp():
    assert next_date(_rec(freq="yearly"), date(2024, 2, 29)) == date(2025, 2, 28)


# --- base ------------------------------------------------------------------ #

def test_base_completion_uses_from_date():
    # base=completion: caller passes today as from_date; engine just adds interval
    assert next_date(_rec(freq="daily", base="completion"), date(2026, 6, 10)) == date(2026, 6, 11)


def test_base_dates_not_implemented():
    with pytest.raises(RecurrenceNotImplementedError):
        next_date(_rec(freq="daily", base="dates"), date(2026, 6, 2))


# --- end ------------------------------------------------------------------- #

def test_end_never():
    rec = _rec(freq="daily", end={"type": "never", "value": None})
    assert next_date(rec, date(2026, 6, 2)) == date(2026, 6, 3)


def test_end_date_before_stop():
    rec = _rec(freq="daily", end={"type": "date", "value": "2026-06-10"})
    assert next_date(rec, date(2026, 6, 2)) == date(2026, 6, 3)


def test_end_date_after_stops():
    rec = _rec(freq="daily", end={"type": "date", "value": "2026-06-02"})
    assert next_date(rec, date(2026, 6, 2)) is None


def test_end_count_positive_continues():
    rec = _rec(freq="daily", end={"type": "count", "value": 3})
    assert next_date(rec, date(2026, 6, 2)) == date(2026, 6, 3)


def test_end_count_exhausted_stops():
    rec = _rec(freq="daily", end={"type": "count", "value": 0})
    assert next_date(rec, date(2026, 6, 2)) is None


def test_unsupported_freq_raises():
    with pytest.raises(RecurrenceNotImplementedError):
        next_date(_rec(freq="hourly"), date(2026, 6, 2))
