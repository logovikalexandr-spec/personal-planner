from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from planner.config import get_settings

router = Router()


def is_owner(user_id: int, *, owner_id: int) -> bool:
    return user_id == owner_id


def greeting_text(name: str | None) -> str:
    who = name or "там"
    return f"Привет, {who}. Это твой планнер. Кидай задачи сюда, разберём в Mini App."


@router.message(CommandStart())
async def on_start(message: Message) -> None:
    await message.answer(greeting_text(message.from_user.first_name if message.from_user else None))


@router.message(Command("applink"))
async def on_applink(message: Message) -> None:
    # Только владелец (AllowlistMiddleware уже отсекает чужих). Выдаёт ссылку PWA + device-токен.
    settings = get_settings()
    if not settings.pwa_token:
        await message.answer("PWA-вход не настроен (нет env PWA_TOKEN).")
        return
    await message.answer(
        "Приложение на iPhone (PWA):\n"
        f"1. Открой в Safari: {settings.pwa_app_url}\n"
        "2. Поделиться → «На экран „Домой“».\n"
        "3. Запусти с экрана, вставь токен входа (один раз):\n\n"
        f"<code>{settings.pwa_token}</code>",
        parse_mode="HTML",
    )
