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


def _make_task(client, **kw):
    r = client.post("/api/tasks", json={"title": "T", **kw}, headers=HDR)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_impact_defaults_null_and_roundtrips(client):
    t = _make_task(client)
    assert t["impact"] is None
    r = client.patch(f"/api/tasks/{t['id']}", json={"impact": 80}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["task"]["impact"] == 80
    g = client.get(f"/api/tasks/{t['id']}", headers=HDR)
    assert g.json()["impact"] == 80


def test_impact_clear_to_null(client):
    t = _make_task(client)
    client.patch(f"/api/tasks/{t['id']}", json={"impact": 50}, headers=HDR)
    r = client.patch(f"/api/tasks/{t['id']}", json={"impact": None}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["task"]["impact"] is None
