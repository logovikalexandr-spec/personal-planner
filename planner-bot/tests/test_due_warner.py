import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from planner_bot.cron_jobs import warn_due_for_user


@pytest.mark.asyncio
async def test_warn_due_only_overdue_or_today():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks = MagicMock()
    tasks.list_for_user_active = AsyncMock(return_value=[
        {"Id": 1, "title": "Past", "due_date": "2026-04-25", "quadrant": "Q1",
         "status": "todo"},
        {"Id": 2, "title": "Today", "due_date": "2026-04-26", "quadrant": "Q1",
         "status": "todo"},
        {"Id": 3, "title": "Future", "due_date": "2026-05-10", "quadrant": "Q2",
         "status": "todo"},
    ])
    bot = MagicMock(); bot.send_message = AsyncMock()
    sent_today_cache = set()
    await warn_due_for_user(bot=bot, user=user, tasks_repo=tasks,
                            today=date(2026, 4, 26),
                            warned_today=sent_today_cache)
    text = bot.send_message.call_args.kwargs["text"]
    assert "#1" in text
    assert "#2" in text
    assert "#3" not in text
    # second call same day → no duplicate push
    await warn_due_for_user(bot=bot, user=user, tasks_repo=tasks,
                            today=date(2026, 4, 26),
                            warned_today=sent_today_cache)
    assert bot.send_message.await_count == 1
