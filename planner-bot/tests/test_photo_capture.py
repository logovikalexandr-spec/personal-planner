import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.photo_capture import capture_photo
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_photo_creates_inbox_no_analysis(tmp_path: Path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 100})
    inbox_repo.update = AsyncMock()
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    git_safe_commit = MagicMock()

    async def download(path):
        Path(path).write_bytes(b"\x89PNG")
    photo = type("P", (), {
        "file_id": "X", "file_unique_id": "U",
        "get_file": AsyncMock(return_value=type("F", (), {
            "download_to_drive": staticmethod(download)})())
    })()

    upd = make_update(text=None, user_id=42)
    upd.message.photo = [photo]
    upd.message.caption = None
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    (tmp_path / "_attachments").mkdir()
    async def fake_classify(data):
        return {"title": "Photo U", "summary": "фото",
                "confidence": 0.5, "guess_project_slug": None,
                "tokens_in": 5, "tokens_out": 3, "cost_usd": 0.0001}

    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "classify_inbox": fake_classify,
        "git_safe_commit": git_safe_commit, "repo_path": tmp_path,
    })
    await capture_photo(upd, ctx)
    args = inbox_repo.create.call_args.args[0]
    assert args["source_type"] == "photo"
    assert args["title"] == "Photo U"
    assert any("Принято" in m["text"] for m in upd.message.sent)
