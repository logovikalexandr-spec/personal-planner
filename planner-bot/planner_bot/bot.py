"""Bot entry point: wires Application, all handlers, JobQueue."""

from __future__ import annotations

import logging

import anthropic
import openai
from loguru import logger
from telegram import Update
from telegram.ext import (
    Application, CallbackQueryHandler, CommandHandler, MessageHandler, filters,
)

from planner_bot.config import Settings
from planner_bot.git_ops import safe_commit
from planner_bot.handlers.find_command import find_command
from planner_bot.handlers.free_text import handle_free_text
from planner_bot.handlers.help_command import help_command
from planner_bot.handlers.inbox_capture import capture_message
from planner_bot.handlers.inbox_commands import (
    on_archive_callback, on_clarify_callback, on_process_callback,
)
from planner_bot.handlers.inbox_list_command import inbox_command
from planner_bot.handlers.photo_capture import capture_photo
from planner_bot.handlers.document_capture import capture_document
from planner_bot.handlers.projects_commands import (
    project_command, projects_command,
)
from planner_bot.handlers.settings_command import settings_command
from planner_bot.handlers.start import start_command
from planner_bot.handlers.stats_command import stats_command
from planner_bot.handlers.tasks_commands import (
    on_quadrant_selected, prompt_quadrant_for_task,
    task_command, today_command, week_command,
)
from planner_bot.handlers.voice_capture import capture_voice
from planner_bot.llm.anthropic_client import AnthropicLLM
from planner_bot.llm.classify import classify_inbox
from planner_bot.llm.clarify import extract_clarification
from planner_bot.llm.intent import detect_intent
from planner_bot.llm.process import process_inbox
from planner_bot.llm.whisper_client import WhisperClient
from planner_bot.nocodb.client import NocoDBClient
from planner_bot.nocodb.repos import (
    ActionsRepo, InboxRepo, ProjectsRepo, TasksRepo, UsersRepo,
)


def _wire_bot_data(app: Application, settings: Settings) -> None:
    nc = NocoDBClient(base_url=settings.nocodb_url, token=settings.nocodb_token)
    ant = AnthropicLLM(
        client=anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key),
        sonnet_model="claude-sonnet-4-6",
        haiku_model="claude-haiku-4-5",
    )
    whisper = WhisperClient(
        client=openai.AsyncOpenAI(api_key=settings.openai_api_key),
    )

    users = UsersRepo(nc); projects = ProjectsRepo(nc)
    inbox = InboxRepo(nc); tasks = TasksRepo(nc); actions = ActionsRepo(nc)

    async def _classify(item):
        proj_rows = await projects.list_all()
        return await classify_inbox(llm=ant, projects=proj_rows, item=item)

    async def _process(*, item, target_project, recent_filenames):
        return await process_inbox(llm=ant, item=item,
                                    target_project=target_project,
                                    recent_filenames=recent_filenames)

    async def _detect_intent(*, text):
        return await detect_intent(llm=ant, text=text)

    async def _extract_clarification(*, text, item):
        proj_rows = await projects.list_all()
        slugs = [p["slug"] for p in proj_rows]
        return await extract_clarification(llm=ant, text=text, item=item,
                                           slugs=slugs)

    async def _transcribe(audio_path, duration_sec=None):
        return await whisper.transcribe(audio_path,
                                        duration_sec=duration_sec)

    app.bot_data.update({
        "settings": settings,
        "nocodb_client": nc,
        "users_repo": users, "projects_repo": projects,
        "inbox_repo": inbox, "tasks_repo": tasks, "actions_repo": actions,
        "classify_inbox": _classify,
        "process_inbox": _process,
        "detect_intent": _detect_intent,
        "extract_clarification": _extract_clarification,
        "transcribe_voice": _transcribe,
        "capture_message": capture_message,
        "today_command": today_command,
        "prompt_quadrant_for_task": prompt_quadrant_for_task,
        "git_safe_commit": safe_commit,
        "repo_path": settings.git_repo_path,
    })


def build_application(settings: Settings) -> Application:
    app = Application.builder().token(settings.tg_bot_token).build()
    _wire_bot_data(app, settings)

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("inbox", inbox_command))
    app.add_handler(CommandHandler("today", today_command))
    app.add_handler(CommandHandler("week", week_command))
    app.add_handler(CommandHandler("projects", projects_command))
    app.add_handler(CommandHandler("project", project_command))
    app.add_handler(CommandHandler("find", find_command))
    app.add_handler(CommandHandler("task", task_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(CommandHandler("settings", settings_command))
    app.add_handler(CommandHandler("help", help_command))

    app.add_handler(CallbackQueryHandler(on_process_callback,
                                         pattern=r"^process:"))
    app.add_handler(CallbackQueryHandler(on_clarify_callback,
                                         pattern=r"^clarify:"))
    app.add_handler(CallbackQueryHandler(on_archive_callback,
                                         pattern=r"^archive:"))
    app.add_handler(CallbackQueryHandler(on_quadrant_selected,
                                         pattern=r"^quad:"))

    app.add_handler(MessageHandler(filters.VOICE, capture_voice))
    app.add_handler(MessageHandler(filters.PHOTO, capture_photo))
    app.add_handler(MessageHandler(filters.Document.ALL, capture_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND,
                                   handle_free_text))
    return app


def main() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info("planner-bot starting")
    app = build_application(settings)
    app.run_polling(allowed_updates=Update.ALL_TYPES, close_loop=False)


if __name__ == "__main__":
    main()
