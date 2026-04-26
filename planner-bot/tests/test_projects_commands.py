import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.projects_commands import (
    projects_command, project_command,
)
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_projects_filters_by_acl():
    user = {"Id": 1, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    projects_repo = MagicMock()
    projects_repo.list_visible_to = AsyncMock(return_value=[
        {"slug": "personal-seryozha", "category": "personal",
         "name": "Personal — Seryozha"},
        {"slug": "learning", "category": "learning", "name": "Learning"},
    ])
    upd = make_update("/projects", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "projects_repo": projects_repo})
    await projects_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "personal-seryozha" in text
    assert "learning" in text
    assert "ctok" not in text


@pytest.mark.asyncio
async def test_project_command_acl_denied():
    user = {"Id": 1, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "slug": "ctok", "visibility": "private", "owner_role": "sasha"})
    upd = make_update("/project ctok", user_id=42)
    ctx = FakeContext()
    ctx.args = ["ctok"]
    ctx.bot_data.update({"users_repo": users_repo,
                         "projects_repo": projects_repo})
    await project_command(upd, ctx)
    assert any("приватный" in m["text"].lower()
               or "доступа нет" in m["text"].lower()
               for m in upd.message.sent)
