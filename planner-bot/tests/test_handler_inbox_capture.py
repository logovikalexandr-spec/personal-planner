import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_capture import capture_message
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_text_capture_creates_inbox_row_and_md(tmp_path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 99})
    inbox_repo.update = AsyncMock(return_value={"Id": 99})
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    git_safe_commit = MagicMock()
    classify = AsyncMock(return_value={
        "title": "X", "summary": "s", "guess_project_slug": "learning",
        "confidence": 0.9, "tokens_in": 100, "tokens_out": 30,
        "cost_usd": 0.0001,
    })
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()

    update = make_update("Купить молоко завтра", user_id=42)
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo,
        "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "classify_inbox": classify,
        "git_safe_commit": git_safe_commit,
        "repo_path": tmp_path,
    })
    await capture_message(update, ctx)
    inbox_repo.create.assert_awaited()
    assert any("Принято #99" in m["text"] for m in update.message.sent)
    git_safe_commit.assert_called()
