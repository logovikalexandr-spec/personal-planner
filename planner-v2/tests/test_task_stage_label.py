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
    proj = Project(name="ZIMA", slug="zima")
    db_session.add(proj)
    await db_session.commit()
    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app), proj.id


def test_task_carries_stage_label_and_status(client):
    c, pid = client
    # этап «Переговоры», order_index=2 → «этап 3», статус current
    st = c.post("/api/stages", json={"project_id": pid, "name": "Переговоры", "order_index": 2, "status": "current"}, headers=HDR)
    assert st.status_code == 201, st.text
    sid = st.json()["id"]

    t = c.post("/api/tasks", json={"title": "Созвон с ZIMA", "project_id": pid}, headers=HDR).json()
    r = c.patch(f"/api/tasks/{t['id']}", json={"stage_id": sid}, headers=HDR)
    assert r.status_code == 200, r.text

    got = c.get(f"/api/tasks/{t['id']}", headers=HDR).json()
    assert got["stage_id"] == sid
    assert got["stage_label"] == "этап 3"
    assert got["stage_status"] == "current"


def test_task_without_stage_has_null_label(client):
    c, pid = client
    t = c.post("/api/tasks", json={"title": "Без этапа"}, headers=HDR).json()
    got = c.get(f"/api/tasks/{t['id']}", headers=HDR).json()
    assert got["stage_label"] is None
    assert got["stage_status"] is None
