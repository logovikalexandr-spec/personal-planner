import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import task_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_task_command_inline_args():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/task Купить молоко", user_id=42)
    ctx = FakeContext()
    ctx.args = ["Купить", "молоко"]
    ctx.bot_data.update({"users_repo": users_repo})
    await task_command(upd, ctx)
    assert ctx.user_data["pending_task"]["title"] == "Купить молоко"
    assert any("Q1" in m["text"] for m in upd.message.sent)


@pytest.mark.asyncio
async def test_task_command_empty_asks_for_title():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/task", user_id=42)
    ctx = FakeContext()
    ctx.args = []
    ctx.bot_data.update({"users_repo": users_repo})
    await task_command(upd, ctx)
    assert ctx.user_data.get("pending_task_title_prompt") is True
