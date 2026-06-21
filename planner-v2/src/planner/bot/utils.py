"""Утилита пуша владельцу из бэка (агент-тренер, напоминания и т.п.)."""
from __future__ import annotations

from aiogram import Bot

from planner.config import get_settings


async def notify_owner(text: str) -> None:
    settings = get_settings()
    bot = Bot(token=settings.telegram_bot_token)
    try:
        await bot.send_message(chat_id=settings.owner_telegram_id, text=text)
    finally:
        await bot.session.close()
