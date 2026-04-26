import pytest

from planner_bot.handlers.help_command import help_command
from planner_bot.handlers.settings_command import settings_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_help_lists_commands():
    upd = make_update("/help", user_id=42)
    await help_command(upd, FakeContext())
    text = upd.message.sent[0]["text"]
    for cmd in ("/inbox", "/today", "/week", "/projects", "/find",
                "/task", "/stats"):
        assert cmd in text


@pytest.mark.asyncio
async def test_settings_phase2_notice():
    upd = make_update("/settings", user_id=42)
    await settings_command(upd, FakeContext())
    text = upd.message.sent[0]["text"]
    assert "Phase 2" in text or "позже" in text.lower()
