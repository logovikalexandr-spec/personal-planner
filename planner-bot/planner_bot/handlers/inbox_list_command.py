from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from planner_bot.formatters import render_inbox_list


async def inbox_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    all_users = await users.list_all()
    shared_authors = [u["Id"] for u in all_users if u["Id"] != user["Id"]]
    inbox = context.bot_data["inbox_repo"]
    items = await inbox.list_unprocessed_for_user(
        author_id=user["Id"], shared_authors=shared_authors)
    text = render_inbox_list(items, viewer_role=user["role"])
    kb_rows = []
    for item in items[:10]:
        kb_rows.append([InlineKeyboardButton(
            f"#{item['Id']}",
            callback_data=f"open:{item['Id']}",
        )])
    markup = InlineKeyboardMarkup(kb_rows) if kb_rows else None
    await update.message.reply_text(text, reply_markup=markup)
