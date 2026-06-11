"""Fork 0 — фундамент модели: Stage, StageDependency, Project AI поля, Task.stage_id.

Покрытие: модель/дефолты, сервис (CRUD + зависимости + валидация),
API (CRUD стейджей, auth, PUT project ai), edge (пустой проект, невалидный статус,
несуществующий проект/стейдж, каскад stage->task SET NULL).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project, Stage, Task
from planner.services import stages as svc
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


# --------------------------------------------------------------------------- #
# Модель
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_stage_defaults(db_session):
    p = Project(name="ZIMA", slug="zima-s")
    db_session.add(p)
    await db_session.flush()
    s = Stage(project_id=p.id, name="Переговоры")
    db_session.add(s)
    await db_session.flush()
    assert s.status == "future"
    assert s.progress == 0
    assert s.is_milestone is False
    assert s.order_index == 0


@pytest.mark.asyncio
async def test_project_ai_fields_default_null(db_session):
    p = Project(name="P", slug="p-ai")
    db_session.add(p)
    await db_session.flush()
    assert p.success_probability is None
    assert p.target_date is None
    assert p.ai_notes is None


@pytest.mark.asyncio
async def test_task_stage_id_nullable(db_session):
    p = Project(name="P", slug="p-t")
    db_session.add(p)
    await db_session.flush()
    t = Task(title="x", project_id=p.id)
    db_session.add(t)
    await db_session.flush()
    assert t.stage_id is None


# --------------------------------------------------------------------------- #
# Сервис
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_create_stage_auto_order_index(db_session):
    p = Project(name="P", slug="p-ord")
    db_session.add(p)
    await db_session.flush()
    s1 = await svc.create_stage(db_session, {"project_id": p.id, "name": "A"})
    s2 = await svc.create_stage(db_session, {"project_id": p.id, "name": "B"})
    assert s1.order_index == 0
    assert s2.order_index == 1


@pytest.mark.asyncio
async def test_create_stage_unknown_project_raises(db_session):
    with pytest.raises(ValueError, match="project not found"):
        await svc.create_stage(db_session, {"project_id": 999, "name": "A"})


@pytest.mark.asyncio
async def test_create_stage_invalid_status_raises(db_session):
    p = Project(name="P", slug="p-st")
    db_session.add(p)
    await db_session.flush()
    with pytest.raises(ValueError, match="invalid status"):
        await svc.create_stage(db_session, {"project_id": p.id, "name": "A", "status": "bogus"})


@pytest.mark.asyncio
async def test_dependencies_roundtrip(db_session):
    p = Project(name="P", slug="p-dep")
    db_session.add(p)
    await db_session.flush()
    a = await svc.create_stage(db_session, {"project_id": p.id, "name": "A"})
    b = await svc.create_stage(db_session, {"project_id": p.id, "name": "B"})
    c = await svc.create_stage(
        db_session, {"project_id": p.id, "name": "C", "depends_on_ids": [a.id, b.id]}
    )
    assert sorted(await svc.depends_on_ids(db_session, c.id)) == sorted([a.id, b.id])
    # обновление зависимостей — заменяет набор
    await svc.update_stage(db_session, c.id, {"depends_on_ids": [a.id]})
    assert await svc.depends_on_ids(db_session, c.id) == [a.id]


@pytest.mark.asyncio
async def test_no_self_dependency(db_session):
    p = Project(name="P", slug="p-self")
    db_session.add(p)
    await db_session.flush()
    a = await svc.create_stage(db_session, {"project_id": p.id, "name": "A"})
    await svc.update_stage(db_session, a.id, {"depends_on_ids": [a.id]})
    assert await svc.depends_on_ids(db_session, a.id) == []


@pytest.mark.asyncio
async def test_delete_stage_sets_task_stage_null(db_session):
    p = Project(name="P", slug="p-del")
    db_session.add(p)
    await db_session.flush()
    s = await svc.create_stage(db_session, {"project_id": p.id, "name": "A"})
    t = Task(title="x", project_id=p.id, stage_id=s.id)
    db_session.add(t)
    await db_session.flush()
    await svc.delete_stage(db_session, s.id)
    await db_session.refresh(t)
    assert t.stage_id is None


@pytest.mark.asyncio
async def test_update_project_ai_validates_probability(db_session):
    p = Project(name="P", slug="p-prob")
    db_session.add(p)
    await db_session.flush()
    with pytest.raises(ValueError, match=r"0\.\.100"):
        await svc.update_project_ai(db_session, p.id, {"success_probability": 150})


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@pytest_asyncio.fixture
async def client(db_engine, db_session):
    p = Project(name="ZIMA", slug="zima-api")
    db_session.add(p)
    await db_session.commit()

    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app), p.id


def test_stage_crud_api(client):
    c, pid = client
    # create
    r = c.post("/api/stages", json={"project_id": pid, "name": "Переговоры"}, headers=HDR)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["status"] == "future"
    assert r.json()["depends_on_ids"] == []
    # list
    r = c.get(f"/api/stages?project_id={pid}", headers=HDR)
    assert r.status_code == 200
    assert len(r.json()) == 1
    # update
    r = c.put(f"/api/stages/{sid}", json={"status": "current", "progress": 40}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "current"
    assert r.json()["progress"] == 40
    # delete
    assert c.delete(f"/api/stages/{sid}", headers=HDR).status_code == 204
    assert c.get(f"/api/stages?project_id={pid}", headers=HDR).json() == []


def test_stage_api_requires_auth(client):
    c, pid = client
    assert c.get(f"/api/stages?project_id={pid}").status_code == 401
    assert c.post("/api/stages", json={"project_id": pid, "name": "X"}).status_code == 401


def test_stage_create_unknown_project_400(client):
    c, _ = client
    r = c.post("/api/stages", json={"project_id": 9999, "name": "X"}, headers=HDR)
    assert r.status_code == 400


def test_stage_update_unknown_404(client):
    c, _ = client
    assert c.put("/api/stages/9999", json={"name": "X"}, headers=HDR).status_code == 404


def test_list_empty_project(client):
    c, pid = client
    assert c.get(f"/api/stages?project_id={pid}", headers=HDR).json() == []


def test_project_ai_endpoint(client):
    c, pid = client
    body = {
        "success_probability": 72,
        "target_date": "2026-09-01",
        "ai_notes": [{"date": "2026-06-10", "type": "accelerate", "text": "нанять помощника"}],
    }
    r = c.put(f"/api/projects/{pid}/ai", json=body, headers=HDR)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success_probability"] == 72
    assert data["target_date"] == "2026-09-01"
    assert data["ai_notes"][0]["type"] == "accelerate"
    assert data["weeks_left"] is not None
    # читается в общем списке
    r = c.get("/api/projects", headers=HDR)
    proj = next(p for p in r.json() if p["id"] == pid)
    assert proj["success_probability"] == 72


def test_project_ai_unknown_404(client):
    c, _ = client
    r = c.put("/api/projects/9999/ai", json={"success_probability": 10}, headers=HDR)
    assert r.status_code == 404


def test_project_ai_bad_probability_400(client):
    c, pid = client
    r = c.put(f"/api/projects/{pid}/ai", json={"success_probability": 999}, headers=HDR)
    assert r.status_code == 400


def test_stage_with_dependencies_api(client):
    c, pid = client
    a = c.post("/api/stages", json={"project_id": pid, "name": "A"}, headers=HDR).json()["id"]
    b = c.post(
        "/api/stages",
        json={"project_id": pid, "name": "B", "depends_on_ids": [a]},
        headers=HDR,
    ).json()
    assert b["depends_on_ids"] == [a]
