from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

router = Router()


def is_owner(user_id: int, *, owner_id: int) -> bool:
    return user_id == owner_id


def greeting_text(name: str | None) -> str:
    who = name or "tam"
    return f"Privet, {who}. Eto tvoy planner. Kidaj zadachi syuda, razberyom v Mini App."


@router.message(CommandStart())
async def on_start(message: Message) -> None:
    await message.answer(greeting_text(message.from_user.first_name if message.from_user else None))
