from __future__ import annotations

import re
from datetime import datetime, timezone

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


_URL_RE = re.compile(r"https?://\S+")


def _detect_source_type(text: str) -> str:
    if not text:
        return "text"
    return "url" if _URL_RE.search(text) else "text"


def _confidence_label(c: float) -> str:
    return f"{int(c * 100)}%"


async def capture_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if msg.text is None or msg.text.startswith("/"):
        return
    users_repo = context.bot_data["users_repo"]
    user = await users_repo.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return

    raw = msg.text.strip()
    source_type = _detect_source_type(raw)
    classify = context.bot_data["classify_inbox"]
    initial_title = raw.split("\n", 1)[0][:80]
    cls = await classify({"raw_content": raw, "source_type": source_type,
                          "initial_title": initial_title})
    inbox_repo = context.bot_data["inbox_repo"]
    actions_repo = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    record = await inbox_repo.create({
        "author_id": user["Id"],
        "source_type": source_type,
        "raw_content": raw,
        "title": cls["title"],
        "summary": cls["summary"],
        "confidence": cls["confidence"],
        "action_taken": cls.get("guess_project_slug", ""),
        "created_at": now_iso,
        "status": "new",
    })
    item = {
        "Id": record["Id"],
        "author_name": user["name"].lower(),
        "source_type": source_type,
        "raw_content": raw,
        "title": cls["title"],
        "summary": cls["summary"],
        "created_at": now_iso,
        "status": "new",
        "project_slug": None,
    }
    md_path = write_inbox_md(context.bot_data["repo_path"], item)
    await inbox_repo.update(record["Id"],
                            {"file_path_repo": str(md_path.relative_to(context.bot_data["repo_path"]))})
    context.bot_data["git_safe_commit"](
        repo_path=context.bot_data["repo_path"],
        paths=[md_path],
        message=f"inbox: #{record['Id']} {cls['title'][:60]} ({user['name'].lower()})",
    )
    await actions_repo.log(
        action_type="propose_project", author_id=user["Id"],
        inbox_id=record["Id"],
        llm_input=raw[:500], llm_output=str(cls)[:500],
        llm_model="claude-haiku-4-5",
        tokens_in=cls.get("tokens_in", 0),
        tokens_out=cls.get("tokens_out", 0),
        cost_usd=cls.get("cost_usd", 0.0),
    )
    guess = cls.get("guess_project_slug")
    conf = cls.get("confidence", 0.0)
    keyboard = [
        [InlineKeyboardButton("📥 Обработать", callback_data=f"process:{record['Id']}")],
    ]
    if guess and conf >= 0.7:
        keyboard.insert(0, [InlineKeyboardButton(
            f"📂 Сразу в {guess}", callback_data=f"assign:{record['Id']}:{guess}",
        )])
    keyboard.append([
        InlineKeyboardButton("✏️ Иначе", callback_data=f"clarify:{record['Id']}"),
        InlineKeyboardButton("🗑 Архив", callback_data=f"archive:{record['Id']}"),
    ])
    text = (f"✅ Принято #{record['Id']}\n"
            f"«{cls['title']}»\n"
            f"{cls['summary']}\n")
    if guess:
        text += f"\n🤖 Похоже на: {guess} ({_confidence_label(conf)})"
    await msg.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
