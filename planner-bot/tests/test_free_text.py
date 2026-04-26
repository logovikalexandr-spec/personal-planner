import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.free_text import handle_free_text
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_free_text_with_url_goes_to_capture():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    capture_message = AsyncMock()
    upd = make_update("https://habr.com/x", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "capture_message": capture_message,
                         "detect_intent": AsyncMock()})
    await handle_free_text(upd, ctx)
    capture_message.assert_awaited()


@pytest.mark.asyncio
async def test_free_text_intent_today_routes():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    today_command = AsyncMock()
    detect = AsyncMock(return_value={"intent": "today", "args": {},
                                     "tokens_in": 0, "tokens_out": 0,
                                     "cost_usd": 0.0})
    upd = make_update("что у меня сегодня", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "detect_intent": detect,
                         "today_command": today_command})
    await handle_free_text(upd, ctx)
    today_command.assert_awaited()


@pytest.mark.asyncio
async def test_free_text_intent_create_task_prompts_quadrant():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    detect = AsyncMock(return_value={
        "intent": "create_task",
        "args": {"title": "Созвон", "due_date": "2026-04-27",
                 "due_time": "14:00", "project_slug": "vesna-web"},
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
    })
    prompt_q = AsyncMock()
    upd = make_update("завтра 14 созвон", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "detect_intent": detect,
                         "prompt_quadrant_for_task": prompt_q})
    await handle_free_text(upd, ctx)
    prompt_q.assert_awaited()
    kwargs = prompt_q.call_args.kwargs
    assert kwargs["title"] == "Созвон"
    assert kwargs["due_date"] == "2026-04-27"
