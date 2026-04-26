import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.find_command import find_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_find_returns_results():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    inbox_repo = MagicMock()
    inbox_repo.search_text = AsyncMock(return_value=[
        {"Id": 42, "title": "PostgreSQL replication",
         "summary": "статья", "file_path_repo": "_inbox/x.md"},
    ])
    upd = make_update("/find postgresql", user_id=42)
    ctx = FakeContext()
    ctx.args = ["postgresql"]
    ctx.bot_data.update({"users_repo": users_repo, "inbox_repo": inbox_repo})
    await find_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "#42" in text
    assert "PostgreSQL" in text


@pytest.mark.asyncio
async def test_find_empty_query_help():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/find", user_id=42)
    ctx = FakeContext()
    ctx.args = []
    ctx.bot_data.update({"users_repo": users_repo})
    await find_command(upd, ctx)
    assert "найти" in upd.message.sent[0]["text"].lower() \
        or "/find" in upd.message.sent[0]["text"].lower()
