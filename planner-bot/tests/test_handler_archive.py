import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import on_archive_callback
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        async def ans(): return None
        self.answer = ans
        self.edited = []
        async def edit(text, **kw):
            self.edited.append({"text": text, **kw})
        self.edit_message_text = edit


class FakeUpd:
    def __init__(self, q, uid):
        self.callback_query = q
        self.effective_user = type("U", (), {"id": uid})()


@pytest.mark.asyncio
async def test_archive_marks_status_and_logs():
    inbox = MagicMock()
    inbox.get = AsyncMock(return_value={"Id": 7, "status": "new"})
    inbox.update = AsyncMock()
    users = MagicMock()
    users.get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "name": "Sasha", "role": "sasha"})
    actions = MagicMock()
    actions.log = AsyncMock()

    q = FakeQuery("archive:7", user_id=99)
    upd = FakeUpd(q, 99)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users, "inbox_repo": inbox,
                         "actions_repo": actions})

    await on_archive_callback(upd, ctx)
    inbox.update.assert_awaited_with(7, {"status": "archived"})
    actions.log.assert_awaited()
    assert q.edited[0]["text"].startswith("🗑")
