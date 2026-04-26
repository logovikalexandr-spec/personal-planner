import pytest
from pathlib import Path
from planner_bot.llm.whisper_client import WhisperClient


class FakeOpenAIClient:
    def __init__(self):
        self.audio = type("A", (), {})()
        self.audio.transcriptions = type("T", (), {
            "create": self._create
        })()
        self.calls = []

    async def _create(self, *, model, file, language=None, **_):
        self.calls.append({"model": model, "lang": language})
        return type("R", (), {"text": "Привет это тест"})()


@pytest.mark.asyncio
async def test_transcribe_returns_text(tmp_path: Path):
    f = tmp_path / "v.ogg"
    f.write_bytes(b"\x00")
    client = WhisperClient(client=FakeOpenAIClient())
    out = await client.transcribe(f)
    assert out["text"] == "Привет это тест"
    assert out["cost_usd"] > 0
