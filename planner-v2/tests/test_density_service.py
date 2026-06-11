"""TDD tests for day_density — тепловая нагрузка дней для датапикера T1·B.

Логика heat (B2): по числу ОТКРЫТЫХ задач дня + флаг просроченного важного.
  g (зелёный)  = лёгкий день (1–2 открытых)
  y (жёлтый)   = средний (3–4)
  r (красный)  = плотный (≥5) ИЛИ прошлый день с открытой важной (high) задачей
Дни без открытых задач в ответе отсутствуют (нет ключа).
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from planner.db.models import Project, Task
from planner.services.tasks import day_density


def _iso(d: date) -> str:
    return d.isoformat()


@pytest.mark.asyncio
async def test_day_density_levels(db_session):
    p = Project(name="Work", slug="work-den")
    db_session.add(p)
    await db_session.flush()

    today = date.today()
    light = today + timedelta(days=1)   # 2 задачи -> g
    mid = today + timedelta(days=2)     # 3 задачи -> y
    heavy = today + timedelta(days=3)   # 5 задач -> r

    tasks = []
    for i in range(2):
        tasks.append(Task(title=f"l{i}", project_id=p.id, status="todo", due_date=light))
    for i in range(3):
        tasks.append(Task(title=f"m{i}", project_id=p.id, status="todo", due_date=mid))
    for i in range(5):
        tasks.append(Task(title=f"h{i}", project_id=p.id, status="todo", due_date=heavy))
    db_session.add_all(tasks)
    await db_session.flush()

    d = await day_density(db_session, today, today + timedelta(days=10))
    assert d[_iso(light)] == "g"
    assert d[_iso(mid)] == "y"
    assert d[_iso(heavy)] == "r"


@pytest.mark.asyncio
async def test_day_density_overdue_important_is_red(db_session):
    p = Project(name="Work", slug="work-den2")
    db_session.add(p)
    await db_session.flush()

    today = date.today()
    past = today - timedelta(days=2)
    # один открытый high в прошлом — даже 1 задача -> r (висит важное)
    db_session.add(Task(title="urgent", project_id=p.id, status="todo",
                        priority="high", due_date=past))
    await db_session.flush()

    d = await day_density(db_session, past - timedelta(days=1), today)
    assert d[_iso(past)] == "r"


@pytest.mark.asyncio
async def test_day_density_excludes_done_and_archived(db_session):
    p = Project(name="Work", slug="work-den3")
    db_session.add(p)
    await db_session.flush()

    today = date.today()
    db_session.add_all([
        Task(title="done", project_id=p.id, status="done", due_date=today),
        Task(title="arch", project_id=p.id, status="archived", due_date=today),
    ])
    await db_session.flush()

    d = await day_density(db_session, today, today + timedelta(days=1))
    assert _iso(today) not in d  # все закрытые/архив -> дня нет в карте


@pytest.mark.asyncio
async def test_day_density_respects_range_and_empty(db_session):
    p = Project(name="Work", slug="work-den4")
    db_session.add(p)
    await db_session.flush()

    today = date.today()
    inside = today + timedelta(days=2)
    outside = today + timedelta(days=40)
    db_session.add_all([
        Task(title="in", project_id=p.id, status="todo", due_date=inside),
        Task(title="out", project_id=p.id, status="todo", due_date=outside),
    ])
    await db_session.flush()

    d = await day_density(db_session, today, today + timedelta(days=10))
    assert _iso(inside) in d
    assert _iso(outside) not in d  # вне окна


@pytest.mark.asyncio
async def test_day_density_no_tasks(db_session):
    today = date.today()
    d = await day_density(db_session, today, today + timedelta(days=10))
    assert d == {}
