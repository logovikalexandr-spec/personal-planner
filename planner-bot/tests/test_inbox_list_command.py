import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_list_command import inbox_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_inbox_command_lists_user_and_shared():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    other = {"Id": 2, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    users_repo.list_all = AsyncMock(return_value=[user, other])
    inbox_repo = MagicMock()
    inbox_repo.list_unprocessed_for_user = AsyncMock(return_value=[
        {"Id": 42, "title": "X", "author_name": "sasha"},
        {"Id": 43, "title": "Y", "author_name": "seryozha"},
    ])
    upd = make_update("/inbox", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo, "inbox_repo": inbox_repo})
    await inbox_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "#42" in text and "#43" in text
    inbox_repo.list_unprocessed_for_user.assert_awaited_with(
        author_id=1, shared_authors=[2])
