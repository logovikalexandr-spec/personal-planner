import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import on_process_callback
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        self.message = type("M", (), {"reply_text":
            AsyncMock(return_value=None)})()
        self.answered = False
        self.edited = []

    async def answer(self):
        self.answered = True

    async def edit_message_text(self, text, **kw):
        self.edited.append({"text": text, **kw})


class FakeUpdate:
    def __init__(self, query, user_id):
        self.callback_query = query
        self.effective_user = type("U", (), {"id": user_id})()


@pytest.mark.asyncio
async def test_process_callback_moves_file_and_pushes(tmp_path: Path):
    repo = tmp_path
    src = repo / "_inbox" / "2026-04-26-1432-x.md"
    src.parent.mkdir(parents=True)
    src.write_text("---\ninbox_id: 42\n---\n# X")
    dest_parent = repo / "projects" / "learning" / "research"
    dest_parent.mkdir(parents=True)

    item = {"Id": 42, "title": "X", "summary": "s", "raw_content": "",
            "source_type": "text", "transcript": "",
            "file_path_repo": "_inbox/2026-04-26-1432-x.md", "status": "new"}
    project = {"Id": 9, "slug": "learning", "name": "Learning",
               "context_notes": "", "folder_path": "projects/learning"}

    inbox_repo = MagicMock()
    inbox_repo.get = AsyncMock(return_value=item)
    inbox_repo.update = AsyncMock(return_value=item)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value=project)
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "telegram_id": 99, "name": "Sasha", "role": "sasha"})
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    process_inbox = AsyncMock(return_value={
        "project_slug": "learning", "subfolder": "research",
        "summary_md": "### TL;DR\n- a\n- b\n- c",
        "action": "moved + summary", "confidence": 0.9,
        "tokens_in": 1, "tokens_out": 1, "cost_usd": 0.001,
    })
    git_safe_commit = MagicMock()

    query = FakeQuery(data="process:42", user_id=99)
    upd = FakeUpdate(query, user_id=99)
    ctx = FakeContext()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "process_inbox": process_inbox,
        "git_safe_commit": git_safe_commit,
        "repo_path": repo,
    })

    await on_process_callback(upd, ctx)
    moved = repo / "projects" / "learning" / "research" / "2026-04-26-1432-x.md"
    assert moved.exists()
    assert not src.exists()
    inbox_repo.update.assert_awaited()
    git_safe_commit.assert_called()
    assert any("learning/research" in e["text"] for e in query.edited)
