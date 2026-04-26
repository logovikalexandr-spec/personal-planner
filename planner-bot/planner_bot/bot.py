"""Bot entry point. Wires Application + handlers + JobQueue.

Tasks beyond /start are added in subsequent plan tasks.
"""
from __future__ import annotations

import logging

from loguru import logger
from telegram.ext import Application, CommandHandler

from planner_bot.config import Settings
from planner_bot.handlers.start import start_command


def build_application(settings: Settings) -> Application:
    app = Application.builder().token(settings.tg_bot_token).build()
    app.add_handler(CommandHandler("start", start_command))
    return app


def main() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info("planner-bot starting")
    app = build_application(settings)
    app.run_polling(close_loop=False)


if __name__ == "__main__":
    main()
