import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.document_capture import capture_document
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_document_pipeline(tmp_path: Path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 5})
    inbox_repo.update = AsyncMock()
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()

    async def download(path):
        Path(path).write_bytes(b"%PDF")
    doc = type("D", (), {
        "file_id": "X", "file_unique_id": "U",
        "file_name": "report.pdf",
        "mime_type": "application/pdf",
        "get_file": AsyncMock(return_value=type("F", (), {
            "download_to_drive": staticmethod(download)})())
    })()
    upd = make_update(text=None, user_id=42)
    upd.message.document = doc
    upd.message.caption = "ZIMA отчёт за апрель"
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    (tmp_path / "_attachments").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(), "repo_path": tmp_path,
    })
    await capture_document(upd, ctx)
    args = inbox_repo.create.call_args.args[0]
    assert args["source_type"] == "file"
    assert "report.pdf" in args["raw_content"]
    assert args["caption"] == "ZIMA отчёт за апрель"
