from __future__ import annotations

import base64
from pathlib import Path

_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}

_PROMPT = """Опиши что на изображении на русском языке.
Если есть текст — воспроизведи его дословно.
Если это скриншот товара/сайта — извлеки: название, цену, ключевые характеристики.
Если это документ/чек/таблица — извлеки структурированные данные.
Будь точным и кратким."""


async def analyze_photo(*, llm, image_path: Path, caption: str = "") -> dict:
    mime = _MIME.get(image_path.suffix.lower(), "image/jpeg")
    b64 = base64.standard_b64encode(image_path.read_bytes()).decode()
    prompt = _PROMPT
    if caption:
        prompt = f"Контекст от пользователя: «{caption}»\n\n{_PROMPT}"
    res = await llm.call_vision(image_b64=b64, media_type=mime, prompt=prompt)
    return {
        "description": res.text,
        "tokens_in": res.tokens_in,
        "tokens_out": res.tokens_out,
        "cost_usd": res.cost_usd,
    }
