import re

_URL_RE = re.compile(r"https?://\S+")


async def handle_free_text(update, context):
    msg = update.message
    text = (msg.text or "").strip()
    if not text or text.startswith("/"):
        return
    pending = context.user_data.get("pending_clarify_inbox_id")
    if pending:
        from planner_bot.handlers.inbox_commands import on_clarify_text
        await on_clarify_text(update, context); return
    if context.user_data.get("pending_task_title_prompt"):
        from planner_bot.handlers.tasks_commands import prompt_quadrant_for_task
        context.user_data.pop("pending_task_title_prompt", None)
        await prompt_quadrant_for_task(
            update=update, context=context,
            title=text, description="", project_slug=None,
            due_date=None, due_time=None, source_text=text,
        )
        return
    if _URL_RE.search(text):
        await context.bot_data["capture_message"](update, context); return
    detect = context.bot_data["detect_intent"]
    res = await detect(text=text)
    intent = res["intent"]
    args = res.get("args") or {}
    if intent == "inbox":
        from planner_bot.handlers.inbox_list_command import inbox_command
        await inbox_command(update, context); return
    if intent == "today":
        await context.bot_data["today_command"](update, context); return
    if intent == "week":
        from planner_bot.handlers.tasks_commands import week_command
        context.args = [args["project_slug"]] if args.get("project_slug") else []
        await week_command(update, context); return
    if intent == "projects":
        from planner_bot.handlers.projects_commands import projects_command
        await projects_command(update, context); return
    if intent == "project_overview" and args.get("slug"):
        from planner_bot.handlers.projects_commands import project_command
        context.args = [args["slug"]]
        await project_command(update, context); return
    if intent == "find" and args.get("query"):
        from planner_bot.handlers.find_command import find_command
        context.args = args["query"].split()
        await find_command(update, context); return
    if intent == "stats":
        from planner_bot.handlers.stats_command import stats_command
        await stats_command(update, context); return
    if intent == "create_task":
        prompt_q = context.bot_data["prompt_quadrant_for_task"]
        await prompt_q(update=update, context=context,
                       title=args.get("title", text)[:80],
                       description="",
                       project_slug=args.get("project_slug"),
                       due_date=args.get("due_date"),
                       due_time=args.get("due_time"),
                       source_text=text); return
    # fallback — treat as inbox capture
    await context.bot_data["capture_message"](update, context)
