import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.voice_capture import capture_voice
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_voice_pipeline_creates_inbox_with_transcript(tmp_path: Path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 99})
    inbox_repo.update = AsyncMock()
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    transcribe = AsyncMock(return_value={
        "text": "купить молоко завтра",
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.001,
    })
    classify = AsyncMock(return_value={
        "title": "Купить молоко завтра",
        "summary": "Заметка про покупку.",
        "guess_project_slug": "personal-sasha",
        "confidence": 0.85,
        "tokens_in": 50, "tokens_out": 20, "cost_usd": 0.0001,
    })

    async def download_to_file(path):
        Path(path).write_bytes(b"\x00")
    file_fake = type("F", (), {
        "download_to_drive": staticmethod(download_to_file),
    })()
    voice_obj = type("V", (), {
        "duration": 4,
        "get_file": AsyncMock(return_value=file_fake),
    })()
    update = make_update(text=None, user_id=42)
    update.message.voice = voice_obj
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "transcribe_voice": transcribe, "classify_inbox": classify,
        "git_safe_commit": MagicMock(),
        "repo_path": tmp_path,
    })
    await capture_voice(update, ctx)
    transcribe.assert_awaited()
    classify.assert_awaited()
    inbox_repo.create.assert_awaited()
    args = inbox_repo.create.call_args.args[0]
    assert args["source_type"] == "voice"
    assert args["transcript"] == "купить молоко завтра"
