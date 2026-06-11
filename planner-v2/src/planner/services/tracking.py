"""Форк E — сервис привычек и метрик. ZERO-AFK: чистый трекер, LLM не зовёт.

Семантика:
- привычка check: value=1 (есть отметка = сделано); count: value = СУММА за день vs target.
- метрика: ЗАМЕНА (upsert по дню, last-wins).
- зачёт привычки-счётчика = ГРАДИЕНТ (heat_level 0-4 по доле value/target).
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import delete, select

from planner.db.models import Habit, HabitEntry, Metric, MetricEntry

_HABIT_FIELDS = {
    "name", "color", "mark_type", "target", "unit", "step",
    "schedule_kind", "schedule_n", "schedule_days", "goal_date", "goal_total",
    "archived", "order_index",
}
_METRIC_FIELDS = {"name", "unit", "good_direction", "color", "archived", "order_index"}


# ── чистая логика (без БД) ────────────────────────────────────────────────── #
def habit_is_done(mark_type: str, value: float, target: float | None) -> bool:
    """Засчитан ли день. check: value>=1. count: value>=target (target<=0 → любой value>0)."""
    if mark_type == "count":
        if not target or target <= 0:
            return value > 0
        return value >= target
    return value >= 1


def habit_heat_level(mark_type: str, value: float, target: float | None) -> int:
    """Градиент-зачёт 0-4 для heatmap. check: 0 или 4. count: round(value/target*4) clamp 0-4."""
    if value <= 0:
        return 0
    if mark_type == "count" and target and target > 0:
        lvl = round((value / target) * 4)
        return max(0, min(4, lvl))
    return 4 if habit_is_done(mark_type, value, target) else 0


# ── привычки CRUD ─────────────────────────────────────────────────────────── #
async def _next_order(session, model, **filt) -> int:
    q = select(model.order_index)
    for k, v in filt.items():
        q = q.where(getattr(model, k) == v)
    rows = await session.execute(q)
    vals = [v for (v,) in rows]
    return (max(vals) + 1) if vals else 0


async def create_habit(session, data: dict) -> Habit:
    fields = {k: v for k, v in data.items() if k in _HABIT_FIELDS}
    if "order_index" not in fields:
        fields["order_index"] = await _next_order(session, Habit)
    h = Habit(**fields)
    session.add(h)
    await session.flush()
    return h


async def list_habits(session, include_archived: bool = False) -> list[Habit]:
    q = select(Habit).order_by(Habit.order_index, Habit.id)
    if not include_archived:
        q = q.where(Habit.archived.is_(False))
    return list((await session.execute(q)).scalars().all())


async def get_habit(session, habit_id: int) -> Habit | None:
    return await session.get(Habit, habit_id)


async def update_habit(session, habit_id: int, data: dict) -> Habit | None:
    h = await session.get(Habit, habit_id)
    if h is None:
        return None
    for k, v in data.items():
        if k in _HABIT_FIELDS:
            setattr(h, k, v)
    await session.flush()
    return h


async def delete_habit(session, habit_id: int) -> bool:
    h = await session.get(Habit, habit_id)
    if h is None:
        return False
    await session.delete(h)  # cascade чистит entries
    await session.flush()
    return True


# ── отметки привычки ──────────────────────────────────────────────────────── #
async def _get_entry(session, habit_id: int, day: date) -> HabitEntry | None:
    q = select(HabitEntry).where(
        HabitEntry.habit_id == habit_id, HabitEntry.entry_date == day
    )
    return (await session.execute(q)).scalar_one_or_none()


async def toggle_habit(session, habit_id: int, day: date) -> bool:
    """check-привычка: тап галки. Есть отметка → снять (откат), нет → поставить value=1.
    Возвращает новое состояние done (True=отмечено)."""
    e = await _get_entry(session, habit_id, day)
    if e is not None:
        await session.delete(e)
        await session.flush()
        return False
    session.add(HabitEntry(habit_id=habit_id, entry_date=day, value=1))
    await session.flush()
    return True


async def add_habit_value(session, habit_id: int, day: date, delta: float) -> float:
    """count-привычка: +delta к сумме дня (upsert). Не опускается ниже 0. Возвращает новую сумму."""
    e = await _get_entry(session, habit_id, day)
    if e is None:
        e = HabitEntry(habit_id=habit_id, entry_date=day, value=max(0.0, delta))
        session.add(e)
    else:
        e.value = max(0.0, e.value + delta)
    await session.flush()
    return e.value


async def set_habit_value(session, habit_id: int, day: date, value: float) -> float:
    """Бэкфилл: задать абсолютное значение дня (или удалить отметку при value<=0)."""
    e = await _get_entry(session, habit_id, day)
    if value <= 0:
        if e is not None:
            await session.delete(e)
            await session.flush()
        return 0.0
    if e is None:
        e = HabitEntry(habit_id=habit_id, entry_date=day, value=value)
        session.add(e)
    else:
        e.value = value
    await session.flush()
    return e.value


async def entries_map(session, habit_id: int, start: date, end: date) -> dict[date, float]:
    """value по дням в окне [start, end] включительно."""
    rows = await session.execute(
        select(HabitEntry.entry_date, HabitEntry.value).where(
            HabitEntry.habit_id == habit_id,
            HabitEntry.entry_date >= start,
            HabitEntry.entry_date <= end,
        )
    )
    return {d: v for (d, v) in rows}


async def compute_streak(session, habit: Habit, today: date) -> int:
    """Текущий дневной стрик: подряд дни до today (включ.) с зачётом. Обновляет record_streak."""
    rows = await session.execute(
        select(HabitEntry.entry_date, HabitEntry.value).where(HabitEntry.habit_id == habit.id)
    )
    done_days = {
        d for (d, v) in rows
        if habit_is_done(habit.mark_type, v, habit.target)
    }
    streak = 0
    cur = today
    while cur in done_days:
        streak += 1
        cur = cur - timedelta(days=1)
    if streak > habit.record_streak:
        habit.record_streak = streak
        await session.flush()
    return streak


# ── метрики ───────────────────────────────────────────────────────────────── #
async def create_metric(session, data: dict) -> Metric:
    fields = {k: v for k, v in data.items() if k in _METRIC_FIELDS}
    if "order_index" not in fields:
        fields["order_index"] = await _next_order(session, Metric)
    m = Metric(**fields)
    session.add(m)
    await session.flush()
    return m


async def list_metrics(session, include_archived: bool = False) -> list[Metric]:
    q = select(Metric).order_by(Metric.order_index, Metric.id)
    if not include_archived:
        q = q.where(Metric.archived.is_(False))
    return list((await session.execute(q)).scalars().all())


async def delete_metric(session, metric_id: int) -> bool:
    m = await session.get(Metric, metric_id)
    if m is None:
        return False
    await session.delete(m)
    await session.flush()
    return True


async def set_metric_value(session, metric_id: int, day: date, value: float) -> MetricEntry:
    """Замер: ЗАМЕНА значения дня (upsert, last-wins)."""
    q = select(MetricEntry).where(
        MetricEntry.metric_id == metric_id, MetricEntry.entry_date == day
    )
    e = (await session.execute(q)).scalar_one_or_none()
    if e is None:
        e = MetricEntry(metric_id=metric_id, entry_date=day, value=value)
        session.add(e)
    else:
        e.value = value
    await session.flush()
    return e


async def list_metric_entries(session, metric_id: int, limit: int = 30) -> list[MetricEntry]:
    q = (
        select(MetricEntry)
        .where(MetricEntry.metric_id == metric_id)
        .order_by(MetricEntry.entry_date.desc())
        .limit(limit)
    )
    return list((await session.execute(q)).scalars().all())


async def delete_metric_entry(session, metric_id: int, day: date) -> bool:
    res = await session.execute(
        delete(MetricEntry).where(
            MetricEntry.metric_id == metric_id, MetricEntry.entry_date == day
        )
    )
    await session.flush()
    return res.rowcount > 0


# ── ретро недели ──────────────────────────────────────────────────────────── #
async def week_retro(session, week_start: date) -> dict:
    """Сводка недели [week_start, +6]: сколько привычко-дней зачтено из запланированных."""
    week_end = week_start + timedelta(days=6)
    habits = await list_habits(session)
    done = 0
    for h in habits:
        rows = await session.execute(
            select(HabitEntry.entry_date, HabitEntry.value).where(
                HabitEntry.habit_id == h.id,
                HabitEntry.entry_date >= week_start,
                HabitEntry.entry_date <= week_end,
            )
        )
        for (_d, v) in rows:
            if habit_is_done(h.mark_type, v, h.target):
                done += 1
    total = len(habits) * 7
    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "habits": len(habits),
        "done_days": done,
        "total_days": total,
    }
