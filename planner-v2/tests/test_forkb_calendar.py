"""Форк B — Календарь (3 вида). Бэкенд: range-фильтр задач + вехи across-projects.

Неделя/Месяц/Лента читают задачи диапазоном дат (один запрос на видимое окно),
а флажки-вехи — все Stage.is_milestone в окне по всем проектам сразу.
"""
from __future__ import annotations

from datetime import date

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project, Stage, Task
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


@pytest_asyncio.fixture
async def client(db_engine, db_session):
    db_session.add(Project(name="Inbox", slug="inbox", is_inbox=True))
    await db_session.commit()
    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


# --------------------------------------------------------------------------- #
# Range-фильтр задач: GET /api/tasks?from=&to=
# --------------------------------------------------------------------------- #
def _mk(client, title, due_date, **extra):
    payload = {"title": title, "due_date": due_date, **extra}
    r = client.post("/api/tasks", json=payload, headers=HDR)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_range_returns_only_window(client):
    a = _mk(client, "в окне", "2026-06-10")
    b = _mk(client, "до окна", "2026-06-08")
    c = _mk(client, "после окна", "2026-06-16")
    _mk(client, "без даты", None)
    got = client.get("/api/tasks?from=2026-06-09&to=2026-06-15", headers=HDR).json()
    ids = {t["id"] for t in got}
    assert a in ids
    assert b not in ids
    assert c not in ids


def test_range_boundaries_inclusive(client):
    lo = _mk(client, "левый край", "2026-06-09")
    hi = _mk(client, "правый край", "2026-06-15")
    got = {t["id"] for t in client.get("/api/tasks?from=2026-06-09&to=2026-06-15", headers=HDR).json()}
    assert lo in got and hi in got


def test_range_includes_done_excludes_archived(client):
    d = _mk(client, "сделана", "2026-06-10")
    client.patch(f"/api/tasks/{d}", json={"status": "done"}, headers=HDR)
    ar = _mk(client, "архив", "2026-06-10")
    client.patch(f"/api/tasks/{ar}", json={"status": "archived"}, headers=HDR)
    got = {t["id"] for t in client.get("/api/tasks?from=2026-06-09&to=2026-06-15", headers=HDR).json()}
    assert d in got       # done показываем (зачёркнуто в ленте/неделе)
    assert ar not in got  # archived скрыт


def test_range_requires_auth(client):
    assert client.get("/api/tasks?from=2026-06-09&to=2026-06-15").status_code == 401


# --------------------------------------------------------------------------- #
# Вехи across-projects: GET /api/milestones?from=&to=
# --------------------------------------------------------------------------- #
@pytest_asyncio.fixture
async def projects_with_milestones(db_session):
    zima = Project(name="ZIMA", slug="zima", color="#3FB68B")
    health = Project(name="Здоровье", slug="health", color="#5B8DEF")
    db_session.add_all([zima, health])
    await db_session.flush()
    # веха в окне (zima)
    db_session.add(Stage(project_id=zima.id, name="Запуск", is_milestone=True,
                         milestone_date=date(2026, 6, 12), status="current"))
    # веха в окне (health)
    db_session.add(Stage(project_id=health.id, name="Анализы", is_milestone=True,
                         milestone_date=date(2026, 6, 15), status="future"))
    # веха вне окна
    db_session.add(Stage(project_id=zima.id, name="Поздняя", is_milestone=True,
                         milestone_date=date(2026, 7, 1), status="future"))
    # этап-НЕ-веха в окне (не попадает)
    db_session.add(Stage(project_id=zima.id, name="Обычный этап", is_milestone=False,
                         milestone_date=date(2026, 6, 13), status="current"))
    await db_session.commit()
    return zima.id, health.id


@pytest.mark.asyncio
async def test_milestones_window_all_projects(client, projects_with_milestones):
    zima_id, health_id = projects_with_milestones
    got = client.get("/api/milestones?from=2026-06-09&to=2026-06-15", headers=HDR).json()
    names = {m["name"] for m in got}
    assert names == {"Запуск", "Анализы"}
    by_name = {m["name"]: m for m in got}
    assert by_name["Запуск"]["project_id"] == zima_id
    assert by_name["Анализы"]["project_id"] == health_id
    assert by_name["Анализы"]["milestone_date"] == "2026-06-15"


@pytest.mark.asyncio
async def test_milestones_excludes_non_milestone_and_out_of_window(client, projects_with_milestones):
    got = client.get("/api/milestones?from=2026-06-09&to=2026-06-15", headers=HDR).json()
    names = {m["name"] for m in got}
    assert "Обычный этап" not in names  # is_milestone=False
    assert "Поздняя" not in names       # вне окна


def test_milestones_requires_auth(client):
    assert client.get("/api/milestones?from=2026-06-09&to=2026-06-15").status_code == 401


def test_milestones_empty_window(client):
    assert client.get("/api/milestones?from=2026-06-09&to=2026-06-15", headers=HDR).json() == []
