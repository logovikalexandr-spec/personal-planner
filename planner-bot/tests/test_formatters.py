from datetime import date
from planner_bot.formatters import (
    render_today, render_week, render_inbox_list, render_project_overview,
)


def test_render_today_groups_by_quadrant():
    today = date(2026, 4, 26)
    tasks = [
        {"Id": 1, "title": "A", "quadrant": "Q1",
         "due_date": "2026-04-26", "due_time": "14:00"},
        {"Id": 2, "title": "B", "quadrant": "Q2",
         "due_date": "2026-04-26", "due_time": None},
        {"Id": 3, "title": "C", "quadrant": "Q1",
         "due_date": "2026-04-26", "due_time": None},
    ]
    text = render_today(tasks, today=today)
    assert "🔥 Q1" in text
    assert "📌 Q2" in text
    assert text.index("Q1") < text.index("Q2")


def test_render_week_groups_by_day():
    today = date(2026, 4, 26)  # Sunday
    tasks = [
        {"Id": 1, "title": "Mon",
         "quadrant": "Q1", "due_date": "2026-04-27", "due_time": "10:00"},
        {"Id": 2, "title": "Wed",
         "quadrant": "Q2", "due_date": "2026-04-29", "due_time": None},
    ]
    text = render_week(tasks, today=today)
    assert "ПН" in text or "27 апр" in text
    assert "СР" in text or "29 апр" in text


def test_render_inbox_list_shows_ids():
    items = [
        {"Id": 42, "title": "X", "author_name": "sasha"},
        {"Id": 43, "title": "Y", "author_name": "sasha"},
    ]
    out = render_inbox_list(items, viewer_role="sasha")
    assert "#42" in out and "#43" in out
