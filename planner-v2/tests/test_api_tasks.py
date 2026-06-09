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


def test_delete_task(client):
    tid = client.post("/api/tasks", json={"title": "удалить меня"}, headers=HDR).json()["id"]
    r = client.delete(f"/api/tasks/{tid}", headers=HDR)
    assert r.status_code == 204, r.text
    lst = client.get("/api/tasks?scope=all", headers=HDR).json()
    assert all(t["id"] != tid for t in lst)
    assert client.delete(f"/api/tasks/{tid}", headers=HDR).status_code == 404


def test_delete_task_with_subtask(client):
    parent = client.post("/api/tasks", json={"title": "родитель"}, headers=HDR).json()["id"]
    child = client.post("/api/tasks", json={"title": "сабтаск"}, headers=HDR).json()["id"]
    assert client.patch(f"/api/tasks/{child}", json={"parent_task_id": parent}, headers=HDR).status_code == 200
    assert client.delete(f"/api/tasks/{parent}", headers=HDR).status_code == 204
    ids = {t["id"] for t in client.get("/api/tasks?scope=all", headers=HDR).json()}
    assert parent not in ids and child not in ids


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
    body = r.json()
    assert body["task"]["due_time"] == "10:00:00"
    assert body["task"]["end_time"] == "11:00:00"
    assert body["next_task"] is None


def test_create_task_full_fields(client):
    r = client.post(
        "/api/tasks",
        json={
            "title": "Глубокая задача",
            "description": "детали",
            "recurrence": "daily",
            "reminder_at": "2026-05-29T09:00:00",
            "priority": "high",
        },
        headers=HDR,
    )
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["description"] == "детали"
    assert b["recurrence"] == "daily"
    assert b["priority"] == "high"
    assert b["reminder_at"].startswith("2026-05-29T09:00:00")


def test_tag_create_list_and_attach(client):
    t1 = client.post("/api/tags", json={"name": "важное", "color": "#E5564B"}, headers=HDR)
    assert t1.status_code == 201, t1.text
    tag_id = t1.json()["id"]
    # idempotent by name
    again = client.post("/api/tags", json={"name": "важное"}, headers=HDR)
    assert again.json()["id"] == tag_id
    lst = client.get("/api/tags", headers=HDR)
    assert any(t["name"] == "важное" for t in lst.json())
    # attach to a task
    task = client.post("/api/tasks", json={"title": "с тегом", "tag_ids": [tag_id]}, headers=HDR)
    assert task.status_code == 201, task.text
    assert [t["id"] for t in task.json()["tags"]] == [tag_id]


def test_tags_require_auth(client):
    assert client.get("/api/tags").status_code == 401


def test_subtasks_via_parent(client):
    parent = client.post("/api/tasks", json={"title": "родитель"}, headers=HDR).json()
    client.post("/api/tasks", json={"title": "шаг 1", "parent_task_id": parent["id"]}, headers=HDR)
    client.post("/api/tasks", json={"title": "шаг 2", "parent_task_id": parent["id"]}, headers=HDR)
    r = client.get(f"/api/tasks?parent_task_id={parent['id']}", headers=HDR)
    assert r.status_code == 200, r.text
    titles = {t["title"] for t in r.json()}
    assert titles == {"шаг 1", "шаг 2"}
