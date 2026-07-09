"""Питание: add/edit/delete приёма, цель, LLM-парс (фолбэк без ключа)."""
from __future__ import annotations

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


def _new_project(client) -> int:
    r = client.post("/api/projects", json={"name": "Питание"}, headers=HDR)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_set_target_upsert(client):
    pid = _new_project(client)
    # цель по умолчанию — нули
    z = client.get(f"/api/projects/{pid}/nutrition/target", headers=HDR).json()
    assert z == {"kcal": 0, "protein": 0, "fat": 0, "carb": 0}
    # установка
    r = client.put(f"/api/projects/{pid}/nutrition/target",
                   json={"kcal": 2600, "protein": 155, "fat": 80, "carb": 300}, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["kcal"] == 2600 and r.json()["protein"] == 155
    # апдейт (upsert, не дубль)
    r2 = client.put(f"/api/projects/{pid}/nutrition/target",
                    json={"kcal": 2700, "protein": 160, "fat": 80, "carb": 310}, headers=HDR)
    assert r2.json()["kcal"] == 2700
    got = client.get(f"/api/projects/{pid}/nutrition/target", headers=HDR).json()
    assert got["kcal"] == 2700 and got["protein"] == 160


def test_add_meal_defaults_done_and_counts(client):
    pid = _new_project(client)
    client.put(f"/api/projects/{pid}/nutrition/target",
               json={"kcal": 2000, "protein": 100, "fat": 60, "carb": 200}, headers=HDR)
    day = "2026-07-09"
    r = client.post(
        f"/api/projects/{pid}/nutrition/day/{day}/meals",
        json={"name": "Курица с рисом", "kcal": 650, "protein": 55, "fat": 12, "carb": 70},
        headers=HDR)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "done"  # добавил = съел
    assert r.json()["name"] == "Курица с рисом"
    # день видит приём и он в сумме недели (done)
    d = client.get(f"/api/projects/{pid}/nutrition/day/{day}", headers=HDR).json()
    assert any(m["name"] == "Курица с рисом" for m in d["meals"])
    monday = "2026-07-06"
    w = client.get(f"/api/projects/{pid}/nutrition/week/{monday}", headers=HDR).json()
    row = next(x for x in w if x["date"] == day)
    assert row["kcal"] == 650 and row["done"] == 1


def test_add_meal_order_index_increments(client):
    pid = _new_project(client)
    day = "2026-07-09"
    a = client.post(f"/api/projects/{pid}/nutrition/day/{day}/meals",
                    json={"name": "A", "kcal": 100}, headers=HDR).json()
    b = client.post(f"/api/projects/{pid}/nutrition/day/{day}/meals",
                    json={"name": "B", "kcal": 200}, headers=HDR).json()
    assert b["order_index"] > a["order_index"]


def test_edit_and_delete_meal(client):
    pid = _new_project(client)
    day = "2026-07-09"
    m = client.post(f"/api/projects/{pid}/nutrition/day/{day}/meals",
                    json={"name": "Перекус", "kcal": 300}, headers=HDR).json()
    mid = m["id"]
    # правка
    e = client.patch(f"/api/meals/{mid}",
                     json={"name": "Перекус (2 банана)", "kcal": 210, "carb": 54}, headers=HDR)
    assert e.status_code == 200, e.text
    assert e.json()["kcal"] == 210 and e.json()["name"] == "Перекус (2 банана)"
    # удаление
    d = client.delete(f"/api/meals/{mid}", headers=HDR)
    assert d.status_code == 204
    day_after = client.get(f"/api/projects/{pid}/nutrition/day/{day}", headers=HDR).json()
    assert all(x["id"] != mid for x in day_after["meals"])


def test_delete_missing_meal_404(client):
    d = client.delete("/api/meals/999999", headers=HDR)
    assert d.status_code == 404


def test_parse_fallback_without_key(client):
    # в тестах anthropic_api_key не задан → детерминированный фолбэк, без сети
    r = client.post("/api/nutrition/parse", json={"text": "200г курицы и рис"}, headers=HDR)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["estimated"] is False
    assert b["name"] == "200г курицы и рис"
    assert b["kcal"] == 0 and b["protein"] == 0


async def test_parse_extracts_json_from_wrapped(monkeypatch):
    # ключ есть + LLM вернул JSON в markdown-обёртке → корректный разбор
    import planner.services.nutrition as n

    class _FakeResp:
        def raise_for_status(self): ...
        def json(self):
            return {"content": [{"text": '```json\n{"name":"Овсянка","kcal":320,'
                                 '"protein":12,"fat":6,"carb":54,"items":[]}\n```'}]}

    class _FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): ...
        async def post(self, *a, **k): return _FakeResp()

    class _S:
        anthropic_api_key = "test-key"
        coach_model = "claude-haiku-4-5-20251001"

    monkeypatch.setattr(n, "get_settings", lambda: _S())
    monkeypatch.setattr(n.httpx, "AsyncClient", _FakeClient)
    out = await n.parse_food("овсянка на воде")
    assert out["estimated"] is True
    assert out["name"] == "Овсянка" and out["kcal"] == 320 and out["carb"] == 54


async def test_parse_llm_error_falls_back(monkeypatch):
    import planner.services.nutrition as n

    class _FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): ...
        async def post(self, *a, **k): raise n.httpx.HTTPError("boom")

    class _S:
        anthropic_api_key = "test-key"
        coach_model = "claude-haiku-4-5-20251001"

    monkeypatch.setattr(n, "get_settings", lambda: _S())
    monkeypatch.setattr(n.httpx, "AsyncClient", _FakeClient)
    out = await n.parse_food("что-то")
    assert out["estimated"] is False and out["kcal"] == 0
