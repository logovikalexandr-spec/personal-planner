from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Annotated
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException, status

from planner.config import Settings, get_settings


@dataclass(frozen=True)
class TelegramUser:
    id: int
    first_name: str | None
    last_name: str | None
    username: str | None
    language_code: str | None


class InitDataError(ValueError):
    """initData невалидна (структура / подпись / срок / чужой юзер)."""


def verify_init_data(
    init_data: str,
    *,
    bot_token: str,
    owner_id: int,
    max_age_sec: int,
    now_ts: float | None = None,
) -> TelegramUser:
    if not init_data:
        raise InitDataError("пусто")

    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = fields.pop("hash", None)
    if not received_hash:
        raise InitDataError("нет поля hash")

    data_check_string = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    expected_hash = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise InitDataError("неверная подпись")

    auth_date_raw = fields.get("auth_date")
    if not auth_date_raw:
        raise InitDataError("нет auth_date")
    try:
        auth_date = int(auth_date_raw)
    except ValueError as exc:
        raise InitDataError("auth_date не число") from exc

    now = now_ts if now_ts is not None else time.time()
    if now - auth_date > max_age_sec:
        raise InitDataError("initData протух")
    if auth_date > now + 60:
        raise InitDataError("auth_date в будущем")

    user_raw = fields.get("user")
    if not user_raw:
        raise InitDataError("нет user")
    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise InitDataError("user не JSON") from exc

    try:
        user_id = int(user_data["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise InitDataError("user.id отсутствует") from exc

    if user_id != owner_id:
        raise InitDataError("не владелец")

    return TelegramUser(
        id=user_id,
        first_name=user_data.get("first_name"),
        last_name=user_data.get("last_name"),
        username=user_data.get("username"),
        language_code=user_data.get("language_code"),
    )


async def require_owner(
    x_telegram_init_data: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> TelegramUser:
    if not x_telegram_init_data:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Telegram-Init-Data header is required")
    try:
        return verify_init_data(
            x_telegram_init_data,
            bot_token=settings.telegram_bot_token,
            owner_id=settings.owner_telegram_id,
            max_age_sec=settings.mini_app_initdata_max_age_sec,
        )
    except InitDataError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
