from __future__ import annotations
from pathlib import Path

_WHISPER_PRICE_PER_MIN = 0.006


class WhisperClient:
    def __init__(self, *, client, model: str = "whisper-1"):
        self._client = client
        self._model = model

    async def transcribe(self, audio_path: Path,
                         duration_sec: int | None = None,
                         language: str = "ru") -> dict:
        with audio_path.open("rb") as f:
            resp = await self._client.audio.transcriptions.create(
                model=self._model, file=f, language=language,
            )
        if duration_sec is None:
            size = audio_path.stat().st_size
            duration_sec = max(1, int(size / 8_000))
        cost = (duration_sec / 60.0) * _WHISPER_PRICE_PER_MIN
        return {"text": resp.text, "tokens_in": 0, "tokens_out": 0,
                "cost_usd": cost}
