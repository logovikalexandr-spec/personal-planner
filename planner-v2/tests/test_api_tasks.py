import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


@pytest_asyncio.fixture
async def client(db_engine, db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.commit()
    app = create_app()

    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


def test_create_and_list_task(client):
    r = client.post("/api/tasks", json={"title": "купить молоко"}, headers=HDR)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    lst = client.get("/api/tasks?scope=all", headers=HDR)
    assert lst.status_code == 200
    assert any(t["id"] == tid for t in lst.json())


def test_task_requires_auth(client):
    assert client.get("/api/tasks").status_code == 401


def test_create_timed_task_with_end_time(client):
    r = client.post(
        "/api/tasks",
        json={"title": "Зал", "due_date": "2026-05-29", "due_time": "08:00:00", "end_time": "09:30:00"},
        headers=HDR,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["due_time"] == "08:00:00"
    assert body["end_time"] == "09:30:00"


def test_list_on_date_filters_by_day(client):
    client.post("/api/tasks", json={"title": "today", "due_date": "2026-05-29"}, headers=HDR)
    client.post("/api/tasks", json={"title": "other", "due_date": "2026-06-01"}, headers=HDR)
    r = client.get("/api/tasks?on_date=2026-05-29", headers=HDR)
    assert r.status_code == 200, r.text
    titles = {t["title"] for t in r.json()}
    assert "today" in titles
    assert "other" not in titles


def test_patch_task_time(client):
    tid = client.post("/api/tasks", json={"title": "x", "due_date": "2026-05-29"}, headers=HDR).json()["id"]
    r = client.patch(f"/api/tasks/{tid}", json={"due_time": "10:00:00", "end_time": "11:00:00"}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["due_time"] == "10:00:00"
    assert r.json()["end_time"] == "11:00:00"
