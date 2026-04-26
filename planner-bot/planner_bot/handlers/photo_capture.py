from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


async def capture_photo(update: Update,
                        context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if not msg.photo:
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return
    biggest = msg.photo[-1]
    file_obj = await biggest.get_file()
    repo_root: Path = context.bot_data["repo_path"]
    attach_dir = repo_root / "_attachments"
    attach_dir.mkdir(parents=True, exist_ok=True)
    target = attach_dir / f"{biggest.file_unique_id}.jpg"
    await file_obj.download_to_drive(str(target))

    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    caption = (msg.caption or "").strip()
    title = caption[:60] if caption else f"Photo {biggest.file_unique_id[:6]}"
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "photo",
        "raw_content": str(target.relative_to(repo_root)),
        "caption": caption,
        "title": title, "summary": caption or "",
        "confidence": 0.0,
        "created_at": now_iso, "status": "new",
        "attachment_url": str(target.relative_to(repo_root)),
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "photo",
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
        message=f"inbox: photo #{rec['Id']} ({user['name'].lower()})",
    )
    await actions.log(action_type="propose_project", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="-",
                      llm_output="photo (no analysis)")
    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}"),
         InlineKeyboardButton("🔍 Анализ vision",
                              callback_data=f"analyze:{rec['Id']}")],
        [InlineKeyboardButton("📂 Изменить проект",
                              callback_data=f"clarify:{rec['Id']}"),
         InlineKeyboardButton("🗑 Архив",
                              callback_data=f"archive:{rec['Id']}")],
    ]
    await msg.reply_text(
        f"📷 Принято #{rec['Id']}\n«{title}»",
        reply_markup=InlineKeyboardMarkup(kb),
    )
