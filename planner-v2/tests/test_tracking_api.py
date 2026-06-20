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


def test_habit_crud_and_toggle(client):
    r = client.post("/api/habits", json={"name": "Медит", "mark_type": "check"}, headers=HDR)
    assert r.status_code == 201, r.text
    hid = r.json()["id"]

    lst = client.get("/api/habits?on=2026-06-11", headers=HDR).json()
    assert len(lst) == 1 and lst[0]["name"] == "Медит"

    t = client.post(f"/api/habits/{hid}/toggle", json={"date": "2026-06-11"}, headers=HDR)
    assert t.status_code == 200, t.text
    assert t.json()["done_today"] is True
    assert t.json()["streak"] == 1

    # откат
    t2 = client.post(f"/api/habits/{hid}/toggle", json={"date": "2026-06-11"}, headers=HDR)
    assert t2.json()["done_today"] is False

    d = client.delete(f"/api/habits/{hid}", headers=HDR)
    assert d.status_code == 204
    assert client.get("/api/habits", headers=HDR).json() == []


def test_count_habit_add_and_gradient(client):
    r = client.post(
        "/api/habits",
        json={"name": "Вода", "mark_type": "count", "target": 2.0, "unit": "л"},
        headers=HDR,
    )
    hid = r.json()["id"]
    client.post(f"/api/habits/{hid}/add", json={"date": "2026-06-11", "delta": 0.5}, headers=HDR)
    out = client.post(
        f"/api/habits/{hid}/add", json={"date": "2026-06-11", "delta": 0.5}, headers=HDR
    ).json()
    assert out["today_value"] == 1.0  # сумма
    assert out["done_today"] is False  # 1 < 2
    # норма достигнута
    full = client.post(
        f"/api/habits/{hid}/add", json={"date": "2026-06-11", "delta": 1.0}, headers=HDR
    ).json()
    assert full["today_value"] == 2.0
    assert full["done_today"] is True


def test_metric_measure_replace(client):
    r = client.post(
        "/api/metrics", json={"name": "Вес", "unit": "кг", "good_direction": "down"}, headers=HDR
    )
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    client.post(
        f"/api/metrics/{mid}/measure", json={"date": "2026-06-10", "value": 78.4}, headers=HDR
    )
    out = client.post(
        f"/api/metrics/{mid}/measure", json={"date": "2026-06-11", "value": 78.2}, headers=HDR
    ).json()
    assert out["latest"] == 78.2
    assert out["delta"] == pytest.approx(-0.2)
    # замена того же дня
    client.post(
        f"/api/metrics/{mid}/measure", json={"date": "2026-06-11", "value": 78.0}, headers=HDR
    )
    lst = client.get("/api/metrics", headers=HDR).json()
    assert lst[0]["latest"] == 78.0
    assert len(lst[0]["entries"]) == 2  # два разных дня, не три


def test_retro(client):
    r = client.post("/api/habits", json={"name": "Зарядка", "mark_type": "check"}, headers=HDR)
    hid = r.json()["id"]
    for d in ("2026-06-08", "2026-06-09", "2026-06-10"):
        client.post(f"/api/habits/{hid}/toggle", json={"date": d}, headers=HDR)
    out = client.get("/api/tracking/retro?week_start=2026-06-08", headers=HDR).json()
    assert out["habits"]["done_days"] == 3
    assert out["habits"]["total_days"] == 7
    assert "tasks" in out and "overdue" in out["tasks"]


def test_retro_tasks_overdue_and_projects(client):
    # задача недели (выполнена) + просроченная
    t1 = client.post(
        "/api/tasks", json={"title": "Созвон", "due_date": "2026-06-09"}, headers=HDR
    ).json()
    client.patch(f"/api/tasks/{t1['id']}", json={"impact": 80, "status": "done"}, headers=HDR)
    client.post(
        "/api/tasks", json={"title": "Оплатить аренду", "due_date": "2026-06-01"}, headers=HDR
    )  # просрочена
    # today после недели, week_start = пн
    out = client.get("/api/tracking/retro?week_start=2026-06-08", headers=HDR).json()
    tasks = out["tasks"]
    assert tasks["done"] == 1
    assert tasks["impact_sum"] == 80
    assert tasks["top_task"]["title"] == "Созвон"
    titles = [o["title"] for o in tasks["overdue"]]
    assert "Оплатить аренду" in titles


def test_habit_history(client):
    r = client.post("/api/habits", json={"name": "Бег", "mark_type": "check"}, headers=HDR)
    hid = r.json()["id"]
    # бэкфилл двух дней в июне 2026
    client.post(f"/api/habits/{hid}/backfill", json={"date": "2026-06-03", "value": 1}, headers=HDR)
    client.post(f"/api/habits/{hid}/backfill", json={"date": "2026-06-05", "value": 1}, headers=HDR)
    h = client.get(f"/api/habits/{hid}/history?month=2026-06", headers=HDR)
    assert h.status_code == 200, h.text
    body = h.json()
    assert body["month"] == "2026-06"
    dates = {d["date"] for d in body["days"]}
    assert "2026-06-03" in dates and "2026-06-05" in dates
    assert all(d["level"] >= 1 for d in body["days"])
    assert 0.0 <= body["pct30"] <= 1.0


def test_metric_patch_and_delete_entry(client):
    r = client.post("/api/metrics", json={"name": "Вес", "unit": "кг", "good_direction": "down", "color": "#5B8DEF"}, headers=HDR)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    assert r.json()["color"] == "#5B8DEF"   # #7 цвет принят

    p = client.patch(f"/api/metrics/{mid}", json={"name": "Масса", "color": "#EE8A3C"}, headers=HDR)
    assert p.status_code == 200, p.text
    assert p.json()["name"] == "Масса" and p.json()["color"] == "#EE8A3C"

    client.post(f"/api/metrics/{mid}/measure", json={"date": "2026-06-10", "value": 78.0}, headers=HDR)
    client.post(f"/api/metrics/{mid}/measure", json={"date": "2026-06-11", "value": 77.5}, headers=HDR)
    d = client.request("DELETE", f"/api/metrics/{mid}/entries?date=2026-06-11", headers=HDR)
    assert d.status_code == 200, d.text
    left = {e["entry_date"] for e in d.json()["entries"]}
    assert "2026-06-11" not in left and "2026-06-10" in left


def test_habit_create_full_schedule(client):
    # count + по дням + шаг + цвет
    r = client.post("/api/habits", json={
        "name": "Вода", "mark_type": "count", "target": 2, "unit": "л", "step": 0.25,
        "color": "#5B8DEF", "schedule_kind": "by_days", "schedule_days": [0, 2, 4],
    }, headers=HDR)
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["step"] == 0.25 and b["unit"] == "л" and b["schedule_kind"] == "by_days"
    assert b["schedule_days"] == [0, 2, 4]

    # цель к дате
    r2 = client.post("/api/habits", json={
        "name": "Без травы", "mark_type": "check", "schedule_kind": "goal_date",
        "goal_date": "2026-06-22", "goal_total": 16,
    }, headers=HDR)
    assert r2.status_code == 201, r2.text
    assert r2.json()["goal_total"] == 16

    # N раз в неделю
    r3 = client.post("/api/habits", json={"name": "Зал", "schedule_kind": "weekly_n", "schedule_n": 3}, headers=HDR)
    assert r3.status_code == 201 and r3.json()["schedule_n"] == 3
