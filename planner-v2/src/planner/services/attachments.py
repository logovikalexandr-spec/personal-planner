from __future__ import annotations

import hashlib
import mimetypes
import uuid
from pathlib import Path

import httpx

from planner.config import Settings
from planner.db.models import Attachment

LOCAL_PREFIX = "local:"


def _media_root(settings: Settings) -> Path:
    root = Path(settings.media_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _guess_type(name: str) -> str:
    mt, _ = mimetypes.guess_type(name)
    return mt or "application/octet-stream"


async def get(session, att_id: int) -> Attachment | None:
    return await session.get(Attachment, att_id)


async def create_upload(
    session, settings: Settings, *, task_id: int, filename: str, content: bytes,
) -> Attachment:
    """Сохранить загруженный с устройства файл на диск и завести вложение."""
    ext = Path(filename).suffix.lower() or ".bin"
    rel = f"up/{uuid.uuid4().hex}{ext}"
    dst = _media_root(settings) / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(content)
    kind = "photo" if _guess_type(filename).startswith("image/") else "file"
    att = Attachment(task_id=task_id, kind=kind, url_or_fileid=f"{LOCAL_PREFIX}{rel}")
    session.add(att)
    await session.flush()
    return att


async def delete(session, settings: Settings, att: Attachment) -> None:
    """Удалить вложение (и локальный файл, если он наш — telegram-кэш не трогаем)."""
    ref = att.url_or_fileid or ""
    if ref.startswith(LOCAL_PREFIX):
        path = _media_root(settings) / ref[len(LOCAL_PREFIX):]
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
    await session.delete(att)
    await session.flush()


async def resolve_bytes(settings: Settings, att: Attachment) -> tuple[bytes, str]:
    """Вернуть (байты, content_type) вложения.

    local: читаем с диска. Иначе url_or_fileid = telegram file_id —
    качаем у бота (getFile + download), кэшируем на диск, дальше отдаём из кэша.
    """
    ref = att.url_or_fileid or ""
    if ref.startswith(LOCAL_PREFIX):
        rel = ref[len(LOCAL_PREFIX):]
        path = _media_root(settings) / rel
        return path.read_bytes(), _guess_type(rel)

    # telegram file_id → кэш по хэшу
    cache_dir = _media_root(settings) / "tg"
    cache_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(ref.encode("utf-8")).hexdigest()
    hits = list(cache_dir.glob(f"{h}.*"))
    if hits:
        return hits[0].read_bytes(), _guess_type(hits[0].name)

    token = settings.telegram_bot_token
    async with httpx.AsyncClient(timeout=30) as client:
        meta = await client.get(
            f"https://api.telegram.org/bot{token}/getFile",
            params={"file_id": ref},
        )
        meta.raise_for_status()
        file_path = meta.json()["result"]["file_path"]
        blob = await client.get(f"https://api.telegram.org/file/bot{token}/{file_path}")
        blob.raise_for_status()
        data = blob.content

    ext = Path(file_path).suffix.lower() or ".jpg"
    (cache_dir / f"{h}{ext}").write_bytes(data)
    return data, _guess_type(f"x{ext}")
