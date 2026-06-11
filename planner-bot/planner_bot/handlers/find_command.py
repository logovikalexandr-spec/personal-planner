from telegram import InlineKeyboardButton, InlineKeyboardMarkup


def _inbox_keyboard(item_id: int, status: str) -> InlineKeyboardMarkup:
    if status == "processed":
        return InlineKeyboardMarkup([[
            InlineKeyboardButton("🔄 Переопределить",
                                 callback_data=f"reclassify:{item_id}"),
            InlineKeyboardButton("🗑 Архив",
                                 callback_data=f"archive:{item_id}"),
        ]])
    if status == "archived":
        return InlineKeyboardMarkup([[
            InlineKeyboardButton("🔄 Восстановить",
                                 callback_data=f"reclassify:{item_id}"),
        ]])
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("📥 Обработать",
                             callback_data=f"process:{item_id}"),
        InlineKeyboardButton("✏️ Иначе",
                             callback_data=f"clarify:{item_id}"),
        InlineKeyboardButton("🗑 Архив",
                             callback_data=f"archive:{item_id}"),
    ]])


_STATUS_ICON = {"processed": "✅", "archived": "🗑", "new": "🆕"}
_QUAD_ICON = {"Q1": "🔥", "Q2": "📌", "Q3": "⏰", "Q4": "💤"}


async def find_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    args = getattr(context, "args", []) or []
    if not args:
        await update.message.reply_text(
            "Использование: /find <слова для поиска>")
        return
    query = " ".join(args)

    inbox = context.bot_data["inbox_repo"]
    inbox_rows = await inbox.search_text(query, limit=20)
    if inbox_rows:
        projects = context.bot_data.get("projects_repo")
        if projects:
            all_projs = await projects.list_all()
            slug_to_proj = {p["slug"]: p for p in all_projs}
            from planner_bot.acl import can_access_project
            inbox_rows = [r for r in inbox_rows
                          if not r.get("project_slug")
                          or can_access_project(
                              user, slug_to_proj.get(r["project_slug"], {}))]
        inbox_rows = inbox_rows[:5]

    tasks_repo = context.bot_data.get("tasks_repo")
    task_rows = []
    if tasks_repo:
        all_tasks = await tasks_repo.search_text(query, limit=10)
        task_rows = [t for t in all_tasks
                     if t.get("author_id") == user["Id"]][:5]

    if not inbox_rows and not task_rows:
        await update.message.reply_text(f"🔍 По «{query}» ничего нет.")
        return

    total = len(inbox_rows) + len(task_rows)
    await update.message.reply_text(f"🔍 По «{query}» — {total} совпадений:")

    for r in inbox_rows:
        item_id = r["Id"]
        status = r.get("status") or "new"
        icon = _STATUS_ICON.get(status, "📄")
        title = r.get("title") or ""
        summary = r.get("summary") or ""
        lines = [f"{icon} #{item_id} 📥 {title}"]
        if summary:
            lines.append(summary[:200])
        await update.message.reply_text(
            "\n".join(lines),
            reply_markup=_inbox_keyboard(item_id, status),
        )

    for t in task_rows:
        quad = _QUAD_ICON.get(t.get("quadrant", ""), "📋")
        due = t.get("due_date") or "—"
        done = "☑️ " if t.get("status") == "done" else ""
        await update.message.reply_text(
            f"{done}{quad} #{t['Id']} ✅ {t['title']}\n📅 {due}"
        )
