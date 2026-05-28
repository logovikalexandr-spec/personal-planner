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
