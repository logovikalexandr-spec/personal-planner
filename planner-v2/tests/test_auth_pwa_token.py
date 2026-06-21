import asyncio

import pytest
from fastapi import HTTPException

from planner.api.auth import require_owner
from planner.config import Settings


def _settings(token):
    return Settings(
        telegram_bot_token="123:TEST",
        owner_telegram_id=555,
        database_url="sqlite+aiosqlite:///:memory:",
        pwa_token=token,
    )


def test_valid_bearer_token_returns_owner():
    u = asyncio.run(require_owner(
        x_telegram_init_data=None, authorization="Bearer secret123", settings=_settings("secret123"),
    ))
    assert u.id == 555


def test_wrong_bearer_rejected():
    with pytest.raises(HTTPException):
        asyncio.run(require_owner(
            x_telegram_init_data=None, authorization="Bearer nope", settings=_settings("secret123"),
        ))


def test_bearer_ignored_when_token_not_configured():
    # pwa_token=None → PWA-вход выключен, Bearer не пускает
    with pytest.raises(HTTPException):
        asyncio.run(require_owner(
            x_telegram_init_data=None, authorization="Bearer secret123", settings=_settings(None),
        ))


def test_no_auth_at_all_rejected():
    with pytest.raises(HTTPException):
        asyncio.run(require_owner(
            x_telegram_init_data=None, authorization=None, settings=_settings("secret123"),
        ))
