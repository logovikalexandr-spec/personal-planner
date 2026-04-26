import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import (
    on_archive_callback,
    on_assign_callback,
    on_confirm_callback,
    on_process_callback,
    on_reclassify_callback,
)
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        self.message = type("M", (), {"reply_text": AsyncMock(return_value=None)})()
        self.edited = []

    async def answer(self):
        pass

    async def edit_message_text(self, text, **kw):
        self.edited.append({"text": text, **kw})


class FakeUpdate:
    def __init__(self, query, user_id=99):
        self.callback_query = query
        self.effective_user = type("U", (), {"id": user_id})()


def _make_ctx(repo, *, item, project, extra=None):
    inbox_repo = MagicMock()
    inbox_repo.get = AsyncMock(return_value=item)
    inbox_repo.update = AsyncMock(return_value=item)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value=project)
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "telegram_id": 99, "name": "Sasha", "role": "sasha",
    })
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    ctx = FakeContext()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(),
        "repo_path": repo,
        **(extra or {}),
    })
    return ctx, inbox_repo


_DECISION = {
    "project_slug": "learning", "subfolder": "research",
    "summary_md": "### TL;DR\n- a\n- b\n- c",
    "action": "moved + summary", "confidence": 0.9,
    "tokens_in": 1, "tokens_out": 1, "cost_usd": 0.001,
}

_ITEM = {
    "Id": 42, "title": "X", "summary": "s", "raw_content": "",
    "source_type": "text", "transcript": "",
    "file_path_repo": "_inbox/2026-04-26-1432-x.md",
    "status": "new", "action_taken": "learning",
}

_PROJECT = {
    "Id": 9, "slug": "learning", "name": "Learning",
    "context_notes": "", "folder_path": "projects/learning",
}


def _make_src(repo: Path) -> Path:
    src = repo / "_inbox" / "2026-04-26-1432-x.md"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_text("---\ninbox_id: 42\n---\n# X")
    (repo / "projects" / "learning" / "research").mkdir(parents=True, exist_ok=True)
    return src


@pytest.mark.asyncio
async def test_process_callback_shows_proposal(tmp_path: Path):
    """process: → shows TL;DR proposal, does NOT move file yet."""
    src = _make_src(tmp_path)
    process_inbox = AsyncMock(return_value=_DECISION)
    ctx, _ = _make_ctx(tmp_path, item=_ITEM, project=_PROJECT,
                       extra={"process_inbox": process_inbox})
    query = FakeQuery(data="process:42", user_id=99)
    await on_process_callback(FakeUpdate(query), ctx)

    # File must still be in _inbox
    assert src.exists()
    # Proposal stored in user_data
    assert "prop:42" in ctx.user_data
    assert ctx.user_data["prop:42"]["project_slug"] == "learning"
    # Showed proposal text with ✅ Ок button
    assert any("learning" in e["text"] for e in query.edited)
    assert any("reply_markup" in e for e in query.edited)


@pytest.mark.asyncio
async def test_confirm_callback_moves_file(tmp_path: Path):
    """confirm: → moves file, clears proposal, shows re-classify buttons."""
    src = _make_src(tmp_path)
    ctx, inbox_repo = _make_ctx(tmp_path, item=_ITEM, project=_PROJECT)
    ctx.user_data["prop:42"] = {
        "project_id": 9, "project_slug": "learning",
        "subfolder": "research", "summary_md": "### TL;DR\n- a",
        "action": "moved + summary",
        "tokens_in": 1, "tokens_out": 1, "cost_usd": 0.001,
    }
    query = FakeQuery(data="confirm:42", user_id=99)
    await on_confirm_callback(FakeUpdate(query), ctx)

    moved = tmp_path / "projects" / "learning" / "research" / "2026-04-26-1432-x.md"
    assert moved.exists()
    assert not src.exists()
    assert "prop:42" not in ctx.user_data
    inbox_repo.update.assert_awaited()
    assert any("learning/research" in e["text"] for e in query.edited)
    # Re-classify / Archive buttons shown
    last = query.edited[-1]
    assert "reply_markup" in last


@pytest.mark.asyncio
async def test_confirm_callback_no_proposal(tmp_path: Path):
    """confirm: with no stored proposal → friendly error."""
    ctx, _ = _make_ctx(tmp_path, item=_ITEM, project=_PROJECT)
    query = FakeQuery(data="confirm:42", user_id=99)
    await on_confirm_callback(FakeUpdate(query), ctx)
    assert any("устарело" in e["text"] for e in query.edited)


@pytest.mark.asyncio
async def test_assign_callback_quick_move(tmp_path: Path):
    """assign: → moves to project/inbox without LLM, shows re-classify buttons."""
    src = _make_src(tmp_path)
    (tmp_path / "projects" / "learning" / "inbox").mkdir(parents=True, exist_ok=True)
    ctx, inbox_repo = _make_ctx(tmp_path, item=_ITEM, project=_PROJECT)
    query = FakeQuery(data="assign:42:learning", user_id=99)
    await on_assign_callback(FakeUpdate(query), ctx)

    moved = tmp_path / "projects" / "learning" / "inbox" / "2026-04-26-1432-x.md"
    assert moved.exists()
    assert not src.exists()
    inbox_repo.update.assert_awaited()
    last = query.edited[-1]
    assert "reply_markup" in last


@pytest.mark.asyncio
async def test_reclassify_callback_resets_and_proposes(tmp_path: Path):
    """reclassify: → resets status=new, runs proposal flow."""
    src = _make_src(tmp_path)
    processed_item = {**_ITEM, "status": "processed"}
    process_inbox = AsyncMock(return_value=_DECISION)
    inbox_repo = MagicMock()
    inbox_repo.get = AsyncMock(return_value=processed_item)
    inbox_repo.update = AsyncMock(return_value=processed_item)
    ctx, _ = _make_ctx(tmp_path, item=processed_item, project=_PROJECT,
                       extra={"process_inbox": process_inbox})
    ctx.bot_data["inbox_repo"] = inbox_repo

    query = FakeQuery(data="reclassify:42", user_id=99)
    await on_reclassify_callback(FakeUpdate(query), ctx)

    # status reset to new
    inbox_repo.update.assert_any_await(42, {"status": "new"})
    # proposal shown
    assert "prop:42" in ctx.user_data
    assert src.exists()


@pytest.mark.asyncio
async def test_archive_callback(tmp_path: Path):
    ctx, inbox_repo = _make_ctx(tmp_path, item=_ITEM, project=_PROJECT)
    query = FakeQuery(data="archive:42", user_id=99)
    await on_archive_callback(FakeUpdate(query), ctx)
    inbox_repo.update.assert_awaited_with(42, {"status": "archived"})
    assert any("архив" in e["text"] for e in query.edited)
