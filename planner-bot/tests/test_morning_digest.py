import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from planner_bot.cron_jobs import morning_digest_for_user


@pytest.mark.asyncio
async def test_morning_digest_for_user_sends_text():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox = MagicMock()
    inbox.list_unprocessed_for_user = AsyncMock(return_value=[
        {"Id": 1, "title": "X", "author_name": "sasha"},
        {"Id": 2, "title": "Y", "author_name": "sasha"},
    ])
    tasks = MagicMock()
    tasks.list_q1_today = AsyncMock(return_value=[
        {"Id": 5, "title": "Q1 task", "due_time": "14:00"}])
    tasks.list_for_user_active = AsyncMock(return_value=[
        {"Id": 5, "quadrant": "Q1"}, {"Id": 6, "quadrant": "Q2"},
        {"Id": 7, "quadrant": "Q2"}])
    bot = MagicMock(); bot.send_message = AsyncMock()

    await morning_digest_for_user(
        bot=bot, user=user, shared_authors=[2],
        inbox_repo=inbox, tasks_repo=tasks,
        today=date(2026, 4, 26),
    )
    bot.send_message.assert_awaited()
    text = bot.send_message.call_args.kwargs["text"]
    assert "Sasha" in text
    assert "Q1" in text
    assert "#1" in text or "Y" in text
