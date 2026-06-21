import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from planner.api.app import create_app
from planner.api.deps import get_db
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


@pytest_asyncio.fixture
async def client(db_engine, db_session):
    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


def test_workout_api_roundtrip(client):
    ex = client.post("/api/exercises", json={"name": "Присед", "muscle_group": "quads"}, headers=HDR).json()
    ws = client.post("/api/workouts", json={"project_id": 1, "date": "2026-06-22"}, headers=HDR)
    assert ws.status_code == 201, ws.text
    sid = ws.json()["id"]
    r = client.put(f"/api/workouts/{sid}/sets", json={"sets": [
        {"exercise_id": ex["id"], "set_index": 0, "weight": 75, "reps": 8, "rpe": 8}
    ]}, headers=HDR)
    assert r.status_code == 200, r.text
    assert len(r.json()["sets"]) == 1
    hist = client.get(f"/api/exercises/{ex['id']}/history", headers=HDR).json()
    assert hist[0]["best_set"]["weight"] == 75
    # отмена
    d = client.delete(f"/api/workouts/{sid}", headers=HDR)
    assert d.status_code == 204
    assert client.get(f"/api/workouts/{sid}", headers=HDR).status_code == 404


def test_complete_schedules_coach(client, monkeypatch):
    called = {}
    import planner.api.routes.workouts as wr

    async def fake_analyze(sid):
        called["sid"] = sid

    monkeypatch.setattr(wr.coach, "analyze_session", fake_analyze)
    ws = client.post("/api/workouts", json={"project_id": 1, "date": "2026-06-22"}, headers=HDR).json()
    r = client.post(f"/api/workouts/{ws['id']}/complete", json={"review_note": "ок"}, headers=HDR)
    assert r.status_code == 200, r.text
    assert called.get("sid") == ws["id"]


@pytest.mark.asyncio
async def test_seed_idempotent(db_session):
    from planner.db.seed_workout import seed_workout
    from planner.services import workouts as svc
    await seed_workout(db_session, project_id=1)
    await db_session.commit()
    n1 = len(await svc.list_exercises(db_session))
    await seed_workout(db_session, project_id=1)
    await db_session.commit()
    n2 = len(await svc.list_exercises(db_session))
    assert n1 == n2 and n1 >= 20
    tpls = await svc.list_templates(db_session, 1)
    assert [t.name for t in tpls] == ["Верх-Сила", "Низ-Квадрицепс", "Верх-Гипертрофия", "Низ-Задняя цепь"]
