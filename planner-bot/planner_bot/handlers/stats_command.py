from datetime import date


async def stats_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    client = context.bot_data["nocodb_client"]
    today = date.today()
    month_start = today.replace(day=1).isoformat()

    # Fetch all user records then filter in Python — avoids NocoDB datetime gte quirks
    all_inbox = await client.list("Inbox", limit=2000,
                                  where=f"(author_id,eq,{user['Id']})")
    all_tasks = await client.list("Tasks", limit=2000,
                                  where=f"(author_id,eq,{user['Id']})")
    all_actions = await client.list("Actions", limit=5000,
                                    where=f"(author_id,eq,{user['Id']})")

    def _in_month(row):
        ts = (row.get("created_at") or row.get("CreatedAt") or "")
        return ts[:10] >= month_start

    inbox_rows = [r for r in all_inbox if _in_month(r)]
    tasks_rows = [r for r in all_tasks if _in_month(r)]
    actions_rows = [r for r in all_actions if _in_month(r)]

    in_total = len(inbox_rows)
    in_done = sum(1 for r in inbox_rows if r["status"] == "processed")
    t_total = len(tasks_rows)
    t_done = sum(1 for r in tasks_rows if r["status"] == "done")
    by_q = {q: sum(1 for r in tasks_rows
                   if r.get("quadrant") == q
                   and r.get("status") in ("todo", "in_progress"))
            for q in ("Q1", "Q2", "Q3", "Q4")}
    cost = round(sum((r.get("cost_usd") or 0) for r in actions_rows), 4)
    out = [
        f"📊 {today.strftime('%B %Y')} — {user['name']}",
        f"Inbox: принято {in_total} / обработано {in_done}",
        f"Tasks: создано {t_total} / закрыто {t_done}",
        f"В пайплайне Q1:{by_q['Q1']} Q2:{by_q['Q2']} "
        f"Q3:{by_q['Q3']} Q4:{by_q['Q4']}",
        f"LLM cost: ${cost}",
    ]
    await update.message.reply_text("\n".join(out))
