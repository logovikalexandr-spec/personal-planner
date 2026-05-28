from __future__ import annotations

import re

from aiogram import Router
from aiogram.types import Message

from planner.db.session import get_session
from planner.services import inbox as inbox_svc

router = Router()

_URL_RE = re.compile(r"https?://\S+")


def classify_text(text: str) -> str:
    return "link" if _URL_RE.search(text) else "text"


async def _capture_and_ack(message: Message, *, kind: str, raw: str, attachment: dict | None = None) -> None:
    async for session in get_session():
        await inbox_svc.capture(session, kind=kind, raw_content=raw, attachment=attachment)
        await session.commit()
    await message.answer("Принято в Inbox. Разобрать можно в Mini App.")


@router.message(lambda m: m.photo is not None)
async def on_photo(message: Message) -> None:
    file_id = message.photo[-1].file_id
    cap = message.caption or ""
    await _capture_and_ack(
        message, kind="photo", raw=cap,
        attachment={"kind": "photo", "url_or_fileid": file_id},
    )


@router.message(lambda m: m.text is not None and not m.text.startswith("/"))
async def on_text(message: Message) -> None:
    text = message.text or ""
    kind = classify_text(text)
    att = {"kind": "link", "url_or_fileid": _URL_RE.search(text).group(0)} if kind == "link" else None
    await _capture_and_ack(message, kind=kind, raw=text, attachment=att)
