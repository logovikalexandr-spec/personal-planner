from __future__ import annotations
import re
from datetime import date, time, timedelta
from dateutil import parser as du

_RU = {
    "сегодня": 0, "завтра": 1, "послезавтра": 2,
    "today": 0, "tomorrow": 1,
}


def parse_relative_date(text: str, *, today: date) -> date | None:
    s = text.strip().lower()
    if s in _RU:
        return today + timedelta(days=_RU[s])
    try:
        d = du.parse(s, dayfirst=False, yearfirst=True, fuzzy=True).date()
        return d
    except Exception:
        return None


_TIME_RE = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*$")


def parse_time(text: str) -> time | None:
    m = _TIME_RE.match(text)
    if not m:
        return None
    h, mn = int(m.group(1)), int(m.group(2))
    if not (0 <= h < 24 and 0 <= mn < 60):
        return None
    return time(h, mn)
