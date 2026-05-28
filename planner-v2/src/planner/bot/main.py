import asyncio

import structlog
from aiogram import Bot, Dispatcher

from planner.bot.handlers import start
from planner.bot.middlewares.allowlist import AllowlistMiddleware
from planner.config import get_settings

log = structlog.get_logger()


async def run() -> None:
    settings = get_settings()
    bot = Bot(token=settings.telegram_bot_token)
    dp = Dispatcher()
    dp.update.middleware(AllowlistMiddleware(settings.owner_telegram_id))
    dp.include_router(start.router)
    log.info("planner-bot started")
    await dp.start_polling(bot)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
