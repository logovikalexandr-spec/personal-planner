import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import today_command, week_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_today_command_returns_text():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    tasks_repo = MagicMock()
    tasks_repo.list_today = AsyncMock(return_value=[
        {"Id": 1, "title": "X", "quadrant": "Q1",
         "due_date": "2026-04-26", "due_time": "14:00"}])
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/today", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo, "tasks_repo": tasks_repo})
    await today_command(upd, ctx)
    assert any("Q1" in m["text"] for m in upd.message.sent)


@pytest.mark.asyncio
async def test_week_command_passes_args_filter():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    tasks_repo = MagicMock()
    tasks_repo.list_week = AsyncMock(return_value=[])
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/week ctok", user_id=42)
    ctx = FakeContext()
    ctx.args = ["ctok"]
    ctx.bot_data.update({"users_repo": users_repo, "tasks_repo": tasks_repo})
    await week_command(upd, ctx)
    tasks_repo.list_week.assert_awaited()
