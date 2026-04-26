from planner_bot.acl import can_access_project
from planner_bot.formatters import render_project_overview


async def projects_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    projects = context.bot_data["projects_repo"]
    rows = await projects.list_visible_to(user["role"])
    by_cat: dict[str, list[dict]] = {}
    for p in rows:
        by_cat.setdefault(p["category"], []).append(p)
    out = ["📂 Проекты:"]
    for cat in ("personal", "learning", "work"):
        items = by_cat.get(cat, [])
        if not items:
            continue
        out.append(f"\n{cat}:")
        for p in items:
            out.append(f"  • {p['slug']} — {p['name']}")
    await update.message.reply_text("\n".join(out))


async def project_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    args = getattr(context, "args", []) or []
    if not args:
        await update.message.reply_text(
            "Укажи slug: /project <slug>")
        return
    slug = args[0]
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(slug)
    if project is None:
        await update.message.reply_text(f"Проект {slug} не найден."); return
    if not can_access_project(user, project):
        await update.message.reply_text(
            f"Проект {slug} приватный. Доступа нет.")
        return
    tasks_repo = context.bot_data["tasks_repo"]
    tasks = await tasks_repo.list_for_user_active(user["Id"])
    project_tasks = [t for t in tasks if t.get("project_id") == project["Id"]]
    inbox = context.bot_data["inbox_repo"]
    recent_inbox = await inbox.search_text(slug, limit=5)
    text = render_project_overview(project, project_tasks, recent_inbox)
    await update.message.reply_text(text)
