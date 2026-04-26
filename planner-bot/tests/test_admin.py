import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.admin import admin_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_admin_denied_for_non_admin():
    upd = make_update("/admin", user_id=999)
    ctx = FakeContext()
    settings = MagicMock(); settings.admin_chat_id = 42
    ctx.bot_data.update({"settings": settings})
    await admin_command(upd, ctx)
    assert "не админ" in upd.message.sent[0]["text"].lower() \
        or "denied" in upd.message.sent[0]["text"].lower()


@pytest.mark.asyncio
async def test_admin_health_for_admin():
    upd = make_update("/admin", user_id=42)
    ctx = FakeContext()
    settings = MagicMock(); settings.admin_chat_id = 42
    ctx.args = ["health"]
    ctx.bot_data.update({"settings": settings})
    await admin_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "DB" in text or "Bot" in text
