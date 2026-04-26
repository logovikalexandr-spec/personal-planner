from datetime import date
from planner_bot.dateparse import parse_relative_date, parse_time


def test_zavtra():
    today = date(2026, 4, 26)
    assert parse_relative_date("завтра", today=today) == date(2026, 4, 27)


def test_dnem_today():
    today = date(2026, 4, 26)
    assert parse_relative_date("сегодня", today=today) == today


def test_iso_date_passthrough():
    today = date(2026, 4, 26)
    assert parse_relative_date("2026-05-15", today=today) == date(2026, 5, 15)


def test_unknown_returns_none():
    assert parse_relative_date("кря", today=date(2026, 4, 26)) is None


def test_parse_time_hh_mm():
    from datetime import time
    assert parse_time("14:30") == time(14, 30)
    assert parse_time("9:05") == time(9, 5)
    assert parse_time("garbage") is None
