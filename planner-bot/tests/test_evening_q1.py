import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from planner_bot.cron_jobs import evening_q1_for_user


@pytest.mark.asyncio
async def test_evening_q1_skips_when_empty():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks = MagicMock()
    tasks.list_q1_today = AsyncMock(return_value=[])
    bot = MagicMock(); bot.send_message = AsyncMock()
    await evening_q1_for_user(bot=bot, user=user, tasks_repo=tasks,
                              today=date(2026, 4, 26))
    bot.send_message.assert_not_awaited()


@pytest.mark.asyncio
async def test_evening_q1_sends_when_todo():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks = MagicMock()
    tasks.list_q1_today = AsyncMock(return_value=[
        {"Id": 7, "title": "Дописать prompt", "status": "todo"},
    ])
    bot = MagicMock(); bot.send_message = AsyncMock()
    await evening_q1_for_user(bot=bot, user=user, tasks_repo=tasks,
                              today=date(2026, 4, 26))
    bot.send_message.assert_awaited()
    assert "Дописать prompt" in bot.send_message.call_args.kwargs["text"]
