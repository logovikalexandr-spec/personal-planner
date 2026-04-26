from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


async def capture_voice(update: Update,
                        context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if msg.voice is None:
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return

    transcribe = context.bot_data["transcribe_voice"]
    classify = context.bot_data["classify_inbox"]
    file_obj = await msg.voice.get_file()
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        await file_obj.download_to_drive(str(tmp_path))
        tr = await transcribe(tmp_path,
                              duration_sec=getattr(msg.voice, "duration", None))
    finally:
        tmp_path.unlink(missing_ok=True)
    transcript = tr["text"]
    cls = await classify({"raw_content": transcript, "source_type": "voice",
                          "initial_title": transcript[:60]})

    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "voice",
        "raw_content": "",
        "transcript": transcript,
        "title": cls["title"],
        "summary": cls["summary"],
        "confidence": cls["confidence"],
        "created_at": now_iso,
        "status": "new",
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "voice", "raw_content": "",
        "transcript": transcript,
        "title": cls["title"], "summary": cls["summary"],
        "created_at": now_iso, "status": "new", "project_slug": None,
    }
    md_path = write_inbox_md(context.bot_data["repo_path"], item)
    await inbox.update(rec["Id"], {
        "file_path_repo": str(md_path.relative_to(context.bot_data["repo_path"])),
    })
    context.bot_data["git_safe_commit"](
        repo_path=context.bot_data["repo_path"], paths=[md_path],
        message=f"inbox: voice #{rec['Id']} ({user['name'].lower()})",
    )
    await actions.log(action_type="transcribe", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="whisper-1",
                      cost_usd=tr["cost_usd"], llm_output=transcript[:500])
    await actions.log(action_type="propose_project", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="claude-haiku-4-5",
                      tokens_in=cls["tokens_in"], tokens_out=cls["tokens_out"],
                      cost_usd=cls["cost_usd"], llm_output=str(cls)[:500])

    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}")],
        [InlineKeyboardButton("✏️ Иначе",
                              callback_data=f"clarify:{rec['Id']}"),
         InlineKeyboardButton("🗑 Архив",
                              callback_data=f"archive:{rec['Id']}")],
    ]
    text = (f"🎙️ Voice → #{rec['Id']}\n«{cls['title']}»\n"
            f"Транскрипт: {transcript[:300]}\n"
            f"🤖 Похоже на: {cls.get('guess_project_slug') or '—'} "
            f"({int(cls['confidence']*100)}%)")
    await msg.reply_text(text, reply_markup=InlineKeyboardMarkup(kb))
