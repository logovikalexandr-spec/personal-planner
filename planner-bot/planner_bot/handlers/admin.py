async def admin_command(update, context):
    settings = context.bot_data["settings"]
    if update.effective_user.id != settings.admin_chat_id:
        await update.message.reply_text("Не админ.")
        return
    args = getattr(context, "args", []) or []
    sub = args[0] if args else "health"
    if sub == "health":
        await update.message.reply_text(
            "🔧 Bot health:\n"
            "DB: NocoDB\n"
            "Bot: running\n"
            "Cron: registered"
        )
