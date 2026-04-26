import pytest
from planner_bot.nocodb.client import NocoDBClient


@pytest.mark.asyncio
async def test_list_passes_query_params(monkeypatch):
    captured = {}

    class StubResponse:
        status_code = 200
        def json(self): return {"list": [{"Id": 1}], "pageInfo": {}}
        def raise_for_status(self): pass

    async def fake_get(self, url, params=None):
        captured["url"] = url
        captured["params"] = params
        return StubResponse()

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)
    c = NocoDBClient(base_url="http://x/api/v2", token="t")
    rows = await c.list("Inbox", where="(status,eq,new)", limit=50)
    assert rows == [{"Id": 1}]
    assert captured["url"] == "/tables/Inbox/records"
    params = captured["params"]
    assert ("limit", 50) in params
    assert ("where", "(status,eq,new)") in params


@pytest.mark.asyncio
async def test_insert_returns_record(monkeypatch):
    class StubResponse:
        status_code = 200
        def json(self): return {"Id": 42}
        def raise_for_status(self): pass

    async def fake_post(self, url, json=None):
        return StubResponse()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    c = NocoDBClient(base_url="http://x/api/v2", token="t")
    rec = await c.insert("Inbox", {"title": "x"})
    assert rec == {"Id": 42}
