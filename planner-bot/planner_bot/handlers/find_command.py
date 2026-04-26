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
    rows = await inbox.search_text(query, limit=10)
    if not rows:
        await update.message.reply_text(f"🔍 По «{query}» ничего нет.")
        return
    out = [f"🔍 По «{query}» — {len(rows)} совпадений:"]
    for r in rows:
        path = r.get("file_path_repo") or ""
        suffix = f"  `{path}`" if path else ""
        out.append(f"  #{r['Id']} {r.get('title','')}{suffix}")
    await update.message.reply_text("\n".join(out), parse_mode="Markdown")
