import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import (
    prompt_quadrant_for_task, on_quadrant_selected,
)
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_prompt_quadrant_stores_pending(tmp_path):
    upd = make_update("ignored", user_id=42)
    ctx = FakeContext()
    await prompt_quadrant_for_task(
        update=upd, context=ctx,
        title="Созвон с Vesna", description="",
        project_slug="vesna-web",
        due_date="2026-04-27", due_time="14:00",
        source_text="завтра 14:00 созвон с Vesna",
    )
    assert ctx.user_data["pending_task"]["title"] == "Созвон с Vesna"
    assert any("Q1" in m["text"] for m in upd.message.sent)


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


@pytest.mark.asyncio
async def test_quadrant_selected_creates_task(tmp_path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    tasks_repo = MagicMock()
    tasks_repo.create = AsyncMock(return_value={"Id": 11})
    tasks_repo.update = AsyncMock()
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "Id": 5, "slug": "vesna-web", "visibility": "shared"})
    actions_repo = MagicMock(); actions_repo.log = AsyncMock()

    q = FakeQuery("quad:Q2", user_id=42)
    upd = type("U", (), {
        "callback_query": q,
        "effective_user": type("X", (), {"id": 42})(),
    })()
    ctx = FakeContext()
    ctx.user_data["pending_task"] = {
        "title": "X", "description": "", "project_slug": "vesna-web",
        "due_date": "2026-04-27", "due_time": "14:00",
        "source_text": "завтра 14:00 X",
    }
    (tmp_path / "tasks").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "tasks_repo": tasks_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(), "repo_path": tmp_path,
    })
    await on_quadrant_selected(upd, ctx)
    args = tasks_repo.create.call_args.args[0]
    assert args["quadrant"] == "Q2"
    assert "pending_task" not in ctx.user_data
