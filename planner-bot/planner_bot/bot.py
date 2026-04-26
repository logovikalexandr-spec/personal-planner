"""Bot entry point: wires Application + handlers + bot_data deps.

MVP scope: Phase A+B+C only. Voice/photo/doc capture and command set
(/today /week /projects /find /task /stats /settings /help) land in
Phases D-F.
"""
from __future__ import annotations

import logging

import anthropic
from loguru import logger
from telegram import Update
from telegram.ext import (
    Application, CallbackQueryHandler, CommandHandler, MessageHandler, filters,
)
from telegram.ext import ContextTypes

from planner_bot.config import Settings
from planner_bot.git_ops import safe_commit
from planner_bot.handlers.inbox_capture import capture_message
from planner_bot.handlers.inbox_commands import (
    on_clarify_callback, on_clarify_text, on_process_callback,
)
from planner_bot.handlers.start import start_command
from planner_bot.llm.anthropic_client import AnthropicLLM
from planner_bot.llm.classify import classify_inbox
from planner_bot.llm.clarify import extract_clarification
from planner_bot.llm.process import process_inbox
from planner_bot.nocodb.client import NocoDBClient
from planner_bot.nocodb.repos import (
    ActionsRepo, InboxRepo, ProjectsRepo, TasksRepo, UsersRepo,
)


async def on_archive_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    await q.edit_message_text("🗑 Archive — ждёт Phase H. Item остался new.")


async def route_text(update: Update,
                     context: ContextTypes.DEFAULT_TYPE) -> None:
    if context.user_data.get("pending_clarify_inbox_id"):
        await on_clarify_text(update, context)
        return
    await capture_message(update, context)


def _wire_bot_data(app: Application, settings: Settings) -> None:
    nc = NocoDBClient(base_url=settings.nocodb_url, token=settings.nocodb_token)
    ant = AnthropicLLM(
        client=anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key),
        sonnet_model="claude-sonnet-4-6",
        haiku_model="claude-haiku-4-5",
    )

    users = UsersRepo(nc)
    projects = ProjectsRepo(nc)
    inbox = InboxRepo(nc)
    tasks = TasksRepo(nc)
    actions = ActionsRepo(nc)

    async def _classify(item):
        proj_rows = await projects.list_all()
        return await classify_inbox(llm=ant, projects=proj_rows, item=item)

    async def _process(*, item, target_project, recent_filenames):
        return await process_inbox(llm=ant, item=item,
                                   target_project=target_project,
                                   recent_filenames=recent_filenames)

    async def _extract_clarification(*, text, item):
        proj_rows = await projects.list_all()
        slugs = [p["slug"] for p in proj_rows]
        return await extract_clarification(llm=ant, text=text, item=item,
                                           slugs=slugs)

    app.bot_data.update({
        "settings": settings,
        "nocodb_client": nc,
        "users_repo": users, "projects_repo": projects,
        "inbox_repo": inbox, "tasks_repo": tasks, "actions_repo": actions,
        "classify_inbox": _classify,
        "process_inbox": _process,
        "extract_clarification": _extract_clarification,
        "git_safe_commit": safe_commit,
        "repo_path": settings.git_repo_path,
    })


def build_application(settings: Settings) -> Application:
    app = Application.builder().token(settings.tg_bot_token).build()
    _wire_bot_data(app, settings)

    app.add_handler(CommandHandler("start", start_command))

    app.add_handler(CallbackQueryHandler(on_process_callback,
                                         pattern=r"^process:"))
    app.add_handler(CallbackQueryHandler(on_clarify_callback,
                                         pattern=r"^clarify:"))
    app.add_handler(CallbackQueryHandler(on_archive_callback,
                                         pattern=r"^archive:"))

    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND,
                                   route_text))
    return app


def main() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info("planner-bot starting")
    app = build_application(settings)
    app.run_polling(allowed_updates=Update.ALL_TYPES, close_loop=False)


if __name__ == "__main__":
    main()
