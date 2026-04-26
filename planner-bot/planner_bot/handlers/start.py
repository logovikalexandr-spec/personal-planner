from telegram import Update
from telegram.ext import ContextTypes


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    repo = context.bot_data["users_repo"]
    tg_id = update.effective_user.id
    user = await repo.get_by_telegram_id(tg_id)
    if user is None:
        await update.message.reply_text(
            "Бот личный. Доступа нет."
        )
        return
    name = user["name"]
    await update.message.reply_text(
        f"Привет, {name}. Шли мне ссылки, тексты, голосовые — разложу по проектам.\n"
        "Команды: /inbox /today /week /projects /find /task /stats /help"
    )
