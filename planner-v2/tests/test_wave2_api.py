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


def _new_task(client, **body):
    body.setdefault("title", "task")
    r = client.post("/api/tasks", json=body, headers=HDR)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# --- TaskDetail serialization ---------------------------------------------- #

def test_get_task_detail_shape(client):
    tid = _new_task(client, title="детальная")
    r = client.get(f"/api/tasks/{tid}", headers=HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("checkitems", "reminders", "subtasks", "progress", "pinned"):
        assert key in body, key
    assert body["progress"] == 0
    assert body["pinned"] is False
    assert body["checkitems"] == []


def test_get_task_detail_includes_subtasks(client):
    parent = _new_task(client, title="родитель")
    _new_task(client, title="шаг 1", parent_task_id=parent)
    r = client.get(f"/api/tasks/{parent}", headers=HDR)
    assert r.status_code == 200, r.text
    titles = {s["title"] for s in r.json()["subtasks"]}
    assert titles == {"шаг 1"}


def test_get_task_detail_404(client):
    assert client.get("/api/tasks/99999", headers=HDR).status_code == 404


# --- checkitem CRUD -------------------------------------------------------- #

def test_checkitem_crud_and_progress(client):
    tid = _new_task(client)
    c1 = client.post(f"/api/tasks/{tid}/checkitems", json={"title": "a"}, headers=HDR)
    assert c1.status_code == 201, c1.text
    c2 = client.post(f"/api/tasks/{tid}/checkitems", json={"title": "b"}, headers=HDR)
    id1 = c1.json()["id"]

    # mark first done -> 50%
    r = client.patch(f"/api/checkitems/{id1}", json={"done": True}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["done"] is True
    detail = client.get(f"/api/tasks/{tid}", headers=HDR).json()
    assert detail["progress"] == 50
    assert len(detail["checkitems"]) == 2

    # delete the second -> 100%
    rd = client.delete(f"/api/checkitems/{c2.json()['id']}", headers=HDR)
    assert rd.status_code == 204
    detail = client.get(f"/api/tasks/{tid}", headers=HDR).json()
    assert detail["progress"] == 100


def test_checkitem_patch_title_only(client):
    tid = _new_task(client)
    cid = client.post(f"/api/tasks/{tid}/checkitems", json={"title": "a"}, headers=HDR).json()["id"]
    r = client.patch(f"/api/checkitems/{cid}", json={"title": "renamed"}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "renamed"


# --- reminders ------------------------------------------------------------- #

def test_put_reminders_replace(client):
    tid = _new_task(client)
    r = client.put(
        f"/api/tasks/{tid}/reminders",
        json={"reminders": [
            {"kind": "relative", "offset_minutes": 30},
            {"kind": "absolute", "at_time": "09:00:00"},
        ]},
        headers=HDR,
    )
    assert r.status_code == 200, r.text
    assert len(r.json()) == 2
    detail = client.get(f"/api/tasks/{tid}", headers=HDR).json()
    assert len(detail["reminders"]) == 2

    # replace with empty -> cleared
    r2 = client.put(f"/api/tasks/{tid}/reminders", json={"reminders": []}, headers=HDR)
    assert r2.status_code == 200
    assert r2.json() == []


# --- PATCH recurrence completion ------------------------------------------- #

def test_patch_done_with_recurrence_generates_next(client):
    rec = {"freq": "daily", "interval": 1, "base": "due", "end": {"type": "never"}}
    tid = _new_task(client, title="ежедневно", due_date="2026-06-02")
    # set recurrence_json first
    client.patch(f"/api/tasks/{tid}", json={"recurrence_json": rec}, headers=HDR)
    r = client.patch(f"/api/tasks/{tid}", json={"status": "done"}, headers=HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"]["status"] == "done"
    assert body["next_task"] is not None
    assert body["next_task"]["due_date"] == "2026-06-03"


def test_patch_wont_do(client):
    tid = _new_task(client)
    r = client.patch(f"/api/tasks/{tid}", json={"status": "wont_do"}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["task"]["status"] == "wont_do"
    assert r.json()["next_task"] is None


def test_patch_pinned_and_progress(client):
    tid = _new_task(client)
    r = client.patch(f"/api/tasks/{tid}", json={"pinned": True, "progress": 40}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["task"]["pinned"] is True
    assert r.json()["task"]["progress"] == 40
