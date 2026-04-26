from __future__ import annotations
from datetime import date, timedelta

_QUAD_ICON = {"Q1": "🔥", "Q2": "📌", "Q3": "⏰", "Q4": "💤"}
_RU_DOW = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"]
_RU_MONTH = ["янв", "фев", "мар", "апр", "май", "июн",
             "июл", "авг", "сен", "окт", "ноя", "дек"]


def _line(t: dict) -> str:
    tm = (t.get("due_time") or "").strip()
    prefix = f"{tm} " if tm else ""
    return f"  • {prefix}#{t['Id']} {t['title']}"


def render_today(tasks: list[dict], today: date) -> str:
    if not tasks:
        return "📅 На сегодня задач нет."
    out = [f"📅 Сегодня ({_RU_DOW[today.weekday()]} {today.day} {_RU_MONTH[today.month-1]})"]
    for q in ("Q1", "Q2", "Q3", "Q4"):
        rows = [t for t in tasks if t.get("quadrant") == q]
        if not rows:
            continue
        out.append(f"\n{_QUAD_ICON[q]} {q}")
        for t in rows:
            out.append(_line(t))
    return "\n".join(out)


def render_week(tasks: list[dict], today: date) -> str:
    if not tasks:
        return "📅 На этой неделе задач нет."
    by_day: dict[str, list[dict]] = {}
    for t in tasks:
        by_day.setdefault(t["due_date"], []).append(t)
    out = ["📅 Эта неделя"]
    for delta in range(7):
        d = today + timedelta(days=delta)
        rows = by_day.get(d.isoformat(), [])
        if not rows:
            continue
        out.append(f"\n{_RU_DOW[d.weekday()]} {d.day} {_RU_MONTH[d.month-1]}")
        for t in rows:
            icon = _QUAD_ICON.get(t.get("quadrant", ""), "")
            tm = (t.get("due_time") or "").strip()
            prefix = f"{tm} " if tm else ""
            out.append(f"  {icon} {prefix}#{t['Id']} {t['title']}")
    return "\n".join(out)


def render_inbox_list(items: list[dict], viewer_role: str) -> str:
    if not items:
        return "📥 Inbox пуст."
    out = [f"📥 Необработано ({len(items)}):"]
    for i in items:
        author = i.get("author_name") or ""
        suffix = f" ({author})" if author else ""
        out.append(f"  #{i['Id']} {i['title'] or '(без названия)'}{suffix}")
    return "\n".join(out)


def render_project_overview(project: dict, tasks: list[dict],
                            recent_inbox: list[dict]) -> str:
    out = [f"🎯 {project['name']} ({project['slug']})"]
    if tasks:
        out.append("\nАктивные задачи:")
        for t in tasks[:10]:
            icon = _QUAD_ICON.get(t.get("quadrant", ""), "")
            due = t.get("due_date") or "—"
            out.append(f"  {icon} #{t['Id']} {t['title']} (до {due})")
    if recent_inbox:
        out.append("\nПоследние items:")
        for i in recent_inbox[:5]:
            out.append(f"  #{i['Id']} {i['title']}")
    notes = (project.get("context_notes_compact")
             or project.get("context_notes") or "")
    if notes:
        out.append("\nКонтекст:\n" + notes[:600])
    return "\n".join(out)
