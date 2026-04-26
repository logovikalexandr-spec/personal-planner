from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


def _confidence_label(c: float) -> str:
    return f"{int(c * 100)}%"


async def capture_document(update: Update,
                           context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    doc = msg.document
    if doc is None:
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return
    file_obj = await doc.get_file()
    repo_root: Path = context.bot_data["repo_path"]
    attach_dir = repo_root / "_attachments"
    attach_dir.mkdir(parents=True, exist_ok=True)
    safe_name = doc.file_name or f"{doc.file_unique_id}.bin"
    target = attach_dir / f"{doc.file_unique_id}-{safe_name}"
    await file_obj.download_to_drive(str(target))

    caption = (msg.caption or "").strip()
    raw_content = caption or safe_name
    initial_title = raw_content[:80]

    classify = context.bot_data["classify_inbox"]
    cls = await classify({"raw_content": raw_content, "source_type": "file",
                          "initial_title": initial_title})

    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "file",
        "raw_content": str(target.relative_to(repo_root)),
        "caption": caption,
        "title": cls["title"],
        "summary": cls["summary"],
        "confidence": cls["confidence"],
        "action_taken": cls.get("guess_project_slug", ""),
        "created_at": now_iso, "status": "new",
        "attachment_url": str(target.relative_to(repo_root)),
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "file",
        "raw_content": str(target.relative_to(repo_root)),
        "title": cls["title"], "summary": cls["summary"],
        "transcript": "", "created_at": now_iso,
        "status": "new", "project_slug": None,
    }
    md = write_inbox_md(repo_root, item)
    await inbox.update(rec["Id"],
                       {"file_path_repo": str(md.relative_to(repo_root))})
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[md, target],
        message=f"inbox: file #{rec['Id']} ({user['name'].lower()})",
    )
    await actions.log(action_type="propose_project", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="claude-haiku-4-5",
                      tokens_in=cls.get("tokens_in", 0),
                      tokens_out=cls.get("tokens_out", 0),
                      cost_usd=cls.get("cost_usd", 0.0),
                      llm_input=raw_content[:500],
                      llm_output=str(cls)[:500])

    guess = cls.get("guess_project_slug")
    conf = cls.get("confidence", 0.0)
    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}")],
    ]
    if guess and conf >= 0.7:
        kb.insert(0, [InlineKeyboardButton(
            f"📂 Сразу в {guess}", callback_data=f"assign:{rec['Id']}:{guess}",
        )])
    kb.append([
        InlineKeyboardButton("✏️ Иначе", callback_data=f"clarify:{rec['Id']}"),
        InlineKeyboardButton("🗑 Архив", callback_data=f"archive:{rec['Id']}"),
    ])
    text = f"📎 Принято #{rec['Id']} «{cls['title']}»\n{cls['summary']}"
    if guess:
        text += f"\n🤖 Похоже на: {guess} ({_confidence_label(conf)})"
    await msg.reply_text(text, reply_markup=InlineKeyboardMarkup(kb))
