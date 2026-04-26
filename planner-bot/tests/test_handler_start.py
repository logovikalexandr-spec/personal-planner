import pytest

from planner_bot.handlers.start import start_command
from tests.fakes.tg_fake import make_update, FakeContext


class FakeUsersRepo:
    def __init__(self, by_tg=None):
        self._by_tg = by_tg or {}
        self.upserts = []

    async def get_by_telegram_id(self, tg_id):
        return self._by_tg.get(tg_id)

    async def upsert_by_telegram_id(self, tg_id, name):
        self.upserts.append((tg_id, name))
        rec = {"id": 1, "telegram_id": tg_id, "name": name, "role": "sasha"}
        self._by_tg[tg_id] = rec
        return rec


@pytest.mark.asyncio
async def test_start_known_user():
    repo = FakeUsersRepo(by_tg={42: {"id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}})
    update = make_update("/start", user_id=42, chat_id=42)
    ctx = FakeContext()
    ctx.bot_data["users_repo"] = repo
    await start_command(update, ctx)
    assert any("Sasha" in m["text"] for m in update.message.sent)
    assert repo.upserts == []


@pytest.mark.asyncio
async def test_start_unknown_user_denied():
    repo = FakeUsersRepo(by_tg={})
    update = make_update("/start", user_id=999, chat_id=999, full_name="Stranger")
    ctx = FakeContext()
    ctx.bot_data["users_repo"] = repo
    await start_command(update, ctx)
    assert any("Доступа нет" in m["text"] for m in update.message.sent)
