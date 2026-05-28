from fastapi.testclient import TestClient

from planner.api.app import create_app
from tests.test_auth_initdata import make_init_data


def test_me_requires_initdata():
    client = TestClient(create_app())
    assert client.get("/api/me").status_code == 401


def test_me_returns_owner():
    client = TestClient(create_app())
    r = client.get("/api/me", headers={"X-Telegram-Init-Data": make_init_data()})
    assert r.status_code == 200
    assert r.json()["id"] == 555
