import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import (
    on_clarify_callback, on_clarify_text,
)
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        self.edited = []
        async def edit(text, **kw):
            self.edited.append({"text": text, **kw})
        self.edit_message_text = edit
        async def ans(): return None
        self.answer = ans


class FakeUpd:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


@pytest.mark.asyncio
async def test_clarify_callback_sets_pending():
    q = FakeQuery("clarify:42", user_id=99)
    upd = FakeUpd(callback_query=q,
                  effective_user=type("U", (), {"id": 99})())
    ctx = FakeContext()
    ctx.bot_data["users_repo"] = MagicMock()
    ctx.bot_data["users_repo"].get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "name": "Sasha", "role": "sasha"})
    await on_clarify_callback(upd, ctx)
    assert ctx.user_data["pending_clarify_inbox_id"] == 42


@pytest.mark.asyncio
async def test_clarify_text_updates_project_notes(tmp_path):
    inbox_repo = MagicMock()
    inbox_repo.get = AsyncMock(return_value={
        "Id": 42, "file_path_repo": "_inbox/x.md", "title": "X",
        "raw_content": "https://x", "source_type": "url",
        "summary": "", "transcript": "",
    })
    inbox_repo.update = AsyncMock()
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "Id": 5, "slug": "vesna-web", "name": "Vesna Web",
        "context_notes": "Old notes", "folder_path": "projects/work/vesna-web"})
    projects_repo.update_context_notes = AsyncMock()

    src = tmp_path / "_inbox" / "x.md"
    src.parent.mkdir(parents=True)
    src.write_text("---\n---\n# X")
    (tmp_path / "projects" / "work" / "vesna-web" / "research").mkdir(parents=True)

    user = {"Id": 1, "telegram_id": 99, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    git_safe_commit = MagicMock()

    msg_sent = []
    msg = type("M", (), {"reply_text":
        AsyncMock(side_effect=lambda t, **k: msg_sent.append(t)),
        "text": "К Vesna-Web. Технические статьи про Next.js."})()
    upd = FakeUpd(message=msg,
                  effective_user=type("U", (), {"id": 99})())
    ctx = FakeContext()
    ctx.user_data["pending_clarify_inbox_id"] = 42
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "git_safe_commit": git_safe_commit, "repo_path": tmp_path,
        "process_inbox": AsyncMock(return_value={
            "project_slug": "vesna-web", "subfolder": "research",
            "summary_md": "", "action": "moved", "confidence": 0.95,
            "tokens_in": 1, "tokens_out": 1, "cost_usd": 0.001}),
        "extract_clarification": AsyncMock(return_value={
            "project_slug": "vesna-web",
            "rule_to_remember":
                "Технические статьи про Next.js — складывать сюда.",
        }),
    })
    await on_clarify_text(upd, ctx)
    projects_repo.update_context_notes.assert_awaited()
    args = projects_repo.update_context_notes.call_args
    assert "Next.js" in args.kwargs.get("notes", args.args[1] if len(args.args) > 1 else "")
    assert "pending_clarify_inbox_id" not in ctx.user_data
