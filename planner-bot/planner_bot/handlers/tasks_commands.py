from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from planner_bot.acl import can_access_project
from planner_bot.markdown_files import write_task_md


async def create_task_with_args(*, user: dict, title: str, description: str,
                                project_slug: str | None, quadrant: str,
                                due_date: str | None, due_time: str | None,
                                source_text: str,
                                context: ContextTypes.DEFAULT_TYPE) -> dict:
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(project_slug) if project_slug else None
    if project and not can_access_project(user, project):
        raise PermissionError(f"Нет доступа к {project_slug}")
    tasks = context.bot_data["tasks_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "author_id": user["Id"], "title": title, "description": description,
        "project_id": project["Id"] if project else None,
        "quadrant": quadrant, "due_date": due_date, "due_time": due_time,
        "status": "todo", "source_text": source_text,
        "created_at": now_iso,
    }
    rec = await tasks.create(payload)
    md = write_task_md(context.bot_data["repo_path"], {
        "Id": rec["Id"], "author": user["name"].lower(),
        "project": project_slug, "quadrant": quadrant,
        "due": due_date, "due_time": due_time,
        "status": "todo", "created": now_iso,
        "title": title, "description": description,
    })
    repo_root: Path = context.bot_data["repo_path"]
    await tasks.update(rec["Id"],
                       {"file_path_repo": str(md.relative_to(repo_root))})
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[md],
        message=f"task: #{rec['Id']} {title[:60]} ({user['name'].lower()})",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="process", author_id=user["Id"],
                      task_id=rec["Id"], user_decision=quadrant,
                      llm_input=source_text[:500])
    return rec


async def prompt_quadrant_for_task(*, update, context, title, description,
                                   project_slug, due_date, due_time,
                                   source_text) -> None:
    context.user_data["pending_task"] = {
        "title": title, "description": description,
        "project_slug": project_slug,
        "due_date": due_date, "due_time": due_time,
        "source_text": source_text,
    }
    kb = [
        [InlineKeyboardButton("🔥 Q1 Срочно+Важно", callback_data="quad:Q1")],
        [InlineKeyboardButton("📌 Q2 Важно", callback_data="quad:Q2")],
        [InlineKeyboardButton("⏰ Q3 Срочно", callback_data="quad:Q3")],
        [InlineKeyboardButton("💤 Q4 Не важно", callback_data="quad:Q4")],
    ]
    text = (f"Создать задачу:\n📌 {title}\n"
            f"📅 {due_date or '—'} {due_time or ''}\n"
            f"📂 Проект: {project_slug or '—'}\n"
            f"Куда по матрице? Q1 Срочно+Важно / Q2 Важно / Q3 Срочно / Q4 Не важно")
    await update.message.reply_text(text,
                                    reply_markup=InlineKeyboardMarkup(kb))


async def on_quadrant_selected(update, context):
    q = update.callback_query
    await q.answer()
    _, quadrant = q.data.split(":", 1)
    pending = context.user_data.get("pending_task")
    if not pending:
        await q.edit_message_text("Нет задачи в работе.")
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    rec = await create_task_with_args(
        user=user, title=pending["title"], description=pending["description"],
        project_slug=pending["project_slug"], quadrant=quadrant,
        due_date=pending["due_date"], due_time=pending["due_time"],
        source_text=pending["source_text"], context=context,
    )
    context.user_data.pop("pending_task", None)
    await q.edit_message_text(
        f"✅ Создана задача #{rec['Id']} ({quadrant})")


from planner_bot.formatters import render_today, render_week  # noqa: E402


async def today_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет.")
        return
    tasks_repo = context.bot_data["tasks_repo"]
    today = date.today()
    rows = await tasks_repo.list_today(author_id=user["Id"],
                                       today=today.isoformat())
    await update.message.reply_text(render_today(rows, today=today))


async def week_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет.")
        return
    tasks_repo = context.bot_data["tasks_repo"]
    today = date.today()
    end = today + timedelta(days=6)
    rows = await tasks_repo.list_week(author_id=user["Id"],
                                      start=today.isoformat(),
                                      end=end.isoformat())
    project_filter = (context.args[0] if getattr(context, "args", None) else None)
    if project_filter:
        projects = context.bot_data.get("projects_repo")
        if projects is not None:
            p = await projects.get_by_slug(project_filter)
            if p is not None:
                rows = [r for r in rows if r.get("project_id") == p["Id"]]
    await update.message.reply_text(render_week(rows, today=today))


async def task_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    title = " ".join(getattr(context, "args", []) or []).strip()
    if not title:
        context.user_data["pending_task_title_prompt"] = True
        await update.message.reply_text(
            "Что за задача? Напиши одной строкой.")
        return
    await prompt_quadrant_for_task(
        update=update, context=context,
        title=title, description="",
        project_slug=None, due_date=None, due_time=None,
        source_text=f"/task {title}",
    )
