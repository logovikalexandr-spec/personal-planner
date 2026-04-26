import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.projects_commands import project_command
from planner_bot.handlers.find_command import find_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_seryozha_cannot_open_ctok_via_project_command():
    user = {"Id": 2, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "slug": "ctok", "visibility": "private", "owner_role": "sasha"})
    upd = make_update("/project ctok", user_id=99)
    ctx = FakeContext()
    ctx.args = ["ctok"]
    ctx.bot_data.update({"users_repo": users_repo,
                         "projects_repo": projects_repo,
                         "tasks_repo": MagicMock(),
                         "inbox_repo": MagicMock()})
    await project_command(upd, ctx)
    text = upd.message.sent[0]["text"].lower()
    assert "приватный" in text or "доступа нет" in text


@pytest.mark.asyncio
async def test_find_does_not_leak_other_users_private_items():
    user = {"Id": 2, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    inbox_repo = MagicMock()
    inbox_repo.search_text = AsyncMock(return_value=[
        {"Id": 1, "title": "Ctok plan", "author_name": "sasha",
         "project_slug": "ctok"}
    ])
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "slug": "ctok", "visibility": "private", "owner_role": "sasha"})
    projects_repo.list_all = AsyncMock(return_value=[
        {"slug": "ctok", "visibility": "private", "owner_role": "sasha"}
    ])
    upd = make_update("/find Ctok", user_id=99)
    ctx = FakeContext()
    ctx.args = ["Ctok"]
    ctx.bot_data.update({"users_repo": users_repo,
                         "inbox_repo": inbox_repo,
                         "projects_repo": projects_repo})
    await find_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "#1" not in text  # filtered
