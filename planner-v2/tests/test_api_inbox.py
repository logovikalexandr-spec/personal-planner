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
    db_session.add(Project(name="Inbox", slug="inbox", is_inbox=True))
    await db_session.commit()
    app = create_app()

    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


def test_inbox_list_empty(client):
    r = client.get("/api/inbox", headers=HDR)
    assert r.status_code == 200
    assert r.json() == []
