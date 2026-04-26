async def help_command(update, context):
    text = (
        "Команды:\n"
        "/inbox — необработанные items\n"
        "/today — задачи на сегодня\n"
        "/week [project] — задачи на неделю\n"
        "/projects — список проектов\n"
        "/project <slug> — детали проекта\n"
        "/find <слова> — поиск\n"
        "/task <название> — создать задачу\n"
        "/stats — стата за месяц\n"
        "/settings — настройки\n"
        "/help — эта справка\n\n"
        "Можно писать свободным текстом — пойму намерение."
    )
    await update.message.reply_text(text)
