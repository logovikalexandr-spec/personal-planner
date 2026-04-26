from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


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
    title = caption[:60] if caption else (doc.file_name or "File")
    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "file",
        "raw_content": str(target.relative_to(repo_root)),
        "caption": caption, "title": title,
        "summary": caption or (doc.mime_type or ""),
        "confidence": 0.0,
        "created_at": now_iso, "status": "new",
        "attachment_url": str(target.relative_to(repo_root)),
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "file",
        "raw_content": str(target.relative_to(repo_root)),
        "title": title, "summary": caption or "",
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
                      inbox_id=rec["Id"], llm_model="-",
                      llm_output=f"file {safe_name}")
    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}"),
         InlineKeyboardButton("🔍 Извлечь текст",
                              callback_data=f"analyze:{rec['Id']}")],
        [InlineKeyboardButton("📂 Изменить проект",
                              callback_data=f"clarify:{rec['Id']}"),
         InlineKeyboardButton("🗑 Архив",
                              callback_data=f"archive:{rec['Id']}")],
    ]
    await msg.reply_text(
        f"📎 Принято #{rec['Id']} «{title}»",
        reply_markup=InlineKeyboardMarkup(kb),
    )
