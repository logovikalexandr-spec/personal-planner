from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes


def _processed_keyboard(item_id: int):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("🔄 Переопределить",
                             callback_data=f"reclassify:{item_id}"),
        InlineKeyboardButton("🗑 Архив",
                             callback_data=f"archive:{item_id}"),
    ]])


async def _run_process_proposal(*, q, user, item, context) -> None:
    """Call LLM, store proposal in user_data, show proposal with action buttons."""
    item_id = item["Id"]
    projects = context.bot_data["projects_repo"]
    target_slug = (item.get("action_taken") or "").strip() or None
    project = (await projects.get_by_slug(target_slug)) if target_slug else None
    if project is None:
        all_projects = await projects.list_all()
        project = all_projects[0] if all_projects else None
    if project is None:
        await q.edit_message_text("Нет проектов. Создай хотя бы один в NocoDB.")
        return

    process_inbox = context.bot_data["process_inbox"]
    decision = await process_inbox(item=item, target_project=project,
                                   recent_filenames=[])

    context.user_data[f"prop:{item_id}"] = {
        "project_id": project["Id"],
        "project_slug": project["slug"],
        "subfolder": decision["subfolder"],
        "summary_md": decision.get("summary_md", ""),
        "action": decision.get("action", "moved"),
        "tokens_in": decision.get("tokens_in", 0),
        "tokens_out": decision.get("tokens_out", 0),
        "cost_usd": decision.get("cost_usd", 0.0),
    }

    tl_dr = decision.get("summary_md", "").strip()
    tl_dr_preview = tl_dr[:300] if tl_dr else ""
    text = (f"📂 {project['slug']}/{decision['subfolder']}\n"
            f"⚙️ {decision.get('action', 'moved')}\n"
            + (f"\n{tl_dr_preview}\n" if tl_dr_preview else ""))
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Ок", callback_data=f"confirm:{item_id}"),
         InlineKeyboardButton("📂 Другой проект",
                              callback_data=f"clarify:{item_id}")],
        [InlineKeyboardButton("🗑 Архив", callback_data=f"archive:{item_id}")],
    ])
    await q.edit_message_text(text, reply_markup=kb)


async def on_process_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    item_id = int(q.data.split(":", 1)[1])
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return
    await q.edit_message_text("⏳ Анализирую…")
    await _run_process_proposal(q=q, user=user, item=item, context=context)


async def on_confirm_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    item_id = int(q.data.split(":", 1)[1])
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return

    proposal = context.user_data.pop(f"prop:{item_id}", None)
    if proposal is None:
        await q.edit_message_text(
            "Предложение устарело. Нажми 📥 Обработать снова.")
        return

    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return

    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(proposal["project_slug"])
    if project is None:
        await q.edit_message_text(
            f"Проект `{proposal['project_slug']}` не найден.")
        return

    repo_root: Path = context.bot_data["repo_path"]
    src = repo_root / item["file_path_repo"]
    dest_dir = repo_root / project["folder_path"] / proposal["subfolder"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    text = src.read_text()
    if proposal["summary_md"]:
        text = text + "\n" + proposal["summary_md"] + "\n"
    src.unlink()
    dest.write_text(text)

    now_iso = datetime.now(timezone.utc).isoformat()
    await inbox.update(item_id, {
        "status": "processed",
        "project_id": project["Id"],
        "target_path": str(dest.relative_to(repo_root)),
        "action_taken": proposal["action"],
        "processed_at": now_iso,
        "file_path_repo": str(dest.relative_to(repo_root)),
    })
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[src, dest],
        message=f"process #{item_id}: → {project['slug']}/{proposal['subfolder']}",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="process", author_id=user["Id"],
                      inbox_id=item_id, llm_model="claude-sonnet-4-6",
                      tokens_in=proposal["tokens_in"],
                      tokens_out=proposal["tokens_out"],
                      cost_usd=proposal["cost_usd"],
                      llm_output=proposal["action"])

    rel = dest.relative_to(repo_root)
    await q.edit_message_text(
        f"✅ #{item_id} → {project['slug']}/{proposal['subfolder']}\n`{rel}`",
        parse_mode="Markdown",
        reply_markup=_processed_keyboard(item_id),
    )


async def on_reclassify_callback(update: Update,
                                 context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    item_id = int(q.data.split(":", 1)[1])
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return
    await inbox.update(item_id, {"status": "new"})
    item = {**item, "status": "new"}
    await q.edit_message_text("⏳ Переопределяю…")
    await _run_process_proposal(q=q, user=user, item=item, context=context)


async def on_assign_callback(update: Update,
                             context: ContextTypes.DEFAULT_TYPE) -> None:
    """Quick-assign: move to project/inbox without LLM summary (high-confidence path)."""
    q = update.callback_query
    await q.answer()
    _, item_id_str, slug = q.data.split(":", 2)
    item_id = int(item_id_str)
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(slug)
    if project is None:
        await q.edit_message_text(f"Проект `{slug}` не найден.")
        return

    repo_root: Path = context.bot_data["repo_path"]
    src = repo_root / item["file_path_repo"]
    dest_dir = repo_root / project["folder_path"] / "inbox"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    dest.write_text(src.read_text())
    src.unlink()

    now_iso = datetime.now(timezone.utc).isoformat()
    await inbox.update(item_id, {
        "status": "processed",
        "project_id": project["Id"],
        "target_path": str(dest.relative_to(repo_root)),
        "action_taken": f"quick-assign → {slug}",
        "processed_at": now_iso,
        "file_path_repo": str(dest.relative_to(repo_root)),
    })
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[src, dest],
        message=f"assign #{item_id}: → {slug}/inbox",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="move", author_id=user["Id"],
                      inbox_id=item_id, user_decision=slug)

    await q.edit_message_text(
        f"📂 #{item_id} → {slug}/inbox",
        reply_markup=_processed_keyboard(item_id),
    )


async def on_clarify_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    _, item_id_str = q.data.split(":", 1)
    context.user_data["pending_clarify_inbox_id"] = int(item_id_str)
    context.user_data.pop(f"prop:{item_id_str}", None)
    await q.edit_message_text(
        "Расскажи в двух словах что это и куда отнести "
        "(укажи slug проекта или опиши что за тип материала)."
    )


async def on_clarify_text(update: Update,
                          context: ContextTypes.DEFAULT_TYPE) -> None:
    item_id = context.user_data.get("pending_clarify_inbox_id")
    if not item_id:
        return
    msg = update.message
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    extract = context.bot_data["extract_clarification"]
    extracted = await extract(text=msg.text, item=item)
    target_slug = extracted["project_slug"]
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(target_slug)
    if project is None:
        await msg.reply_text(f"Проект `{target_slug}` не найден. Попробуй ещё.",
                             parse_mode="Markdown")
        return
    notes_old = project.get("context_notes") or ""
    rule = extracted["rule_to_remember"].strip()
    notes_new = (notes_old + "\n- " + rule) if rule else notes_old
    if rule:
        await projects.update_context_notes(project_id=project["Id"],
                                            notes=notes_new)
    process_inbox = context.bot_data["process_inbox"]
    decision = await process_inbox(item=item, target_project=project,
                                   recent_filenames=[])
    repo_root: Path = context.bot_data["repo_path"]
    src = repo_root / item["file_path_repo"]
    dest_dir = repo_root / project["folder_path"] / decision["subfolder"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    text = src.read_text()
    if decision.get("summary_md"):
        text = text + "\n" + decision["summary_md"] + "\n"
    src.unlink()
    dest.write_text(text)
    now_iso = datetime.now(timezone.utc).isoformat()
    await inbox.update(item_id, {
        "status": "processed", "project_id": project["Id"],
        "target_path": str(dest.relative_to(repo_root)),
        "action_taken": "clarify+move",
        "processed_at": now_iso,
        "file_path_repo": str(dest.relative_to(repo_root)),
    })
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[src, dest],
        message=f"clarify #{item_id}: → {project['slug']}/{decision['subfolder']}",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="clarify", author_id=user["Id"],
                      inbox_id=item_id, llm_model="claude-haiku-4-5",
                      llm_input=msg.text[:500], user_decision=target_slug)
    context.user_data.pop("pending_clarify_inbox_id", None)
    reply = (f"✅ #{item_id} → {project['slug']}/{decision['subfolder']}.\n"
             f"Запомнил: {rule}" if rule
             else f"✅ #{item_id} → {project['slug']}/{decision['subfolder']}")
    await msg.reply_text(
        reply,
        reply_markup=_processed_keyboard(item_id),
    )


async def on_analyze_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    item_id = int(q.data.split(":", 1)[1])
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return
    attach = item.get("attachment_url") or item.get("raw_content") or ""
    if not attach:
        await q.edit_message_text("Нет прикреплённого файла для анализа.")
        return
    repo_root: Path = context.bot_data["repo_path"]
    image_path = repo_root / attach
    if not image_path.exists():
        await q.edit_message_text(f"Файл не найден: {attach}")
        return
    await q.edit_message_text("🔍 Анализирую изображение…")
    analyze = context.bot_data["analyze_photo"]
    result = await analyze(image_path=image_path,
                           caption=item.get("caption") or "")
    description = result["description"]
    await inbox.update(item_id, {"transcript": description[:4000]})
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="summarize", author_id=user["Id"],
                      inbox_id=item_id, llm_model="claude-haiku-4-5",
                      tokens_in=result["tokens_in"],
                      tokens_out=result["tokens_out"],
                      cost_usd=result["cost_usd"],
                      llm_output=description[:500])
    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton("📥 Обработать",
                             callback_data=f"process:{item_id}"),
        InlineKeyboardButton("🗑 Архив",
                             callback_data=f"archive:{item_id}"),
    ]])
    await q.edit_message_text(
        f"🔍 Vision #{item_id}:\n{description[:3000]}",
        reply_markup=kb,
    )


async def on_archive_callback(update, context):
    q = update.callback_query
    await q.answer()
    _, item_id_str = q.data.split(":", 1)
    item_id = int(item_id_str)
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return
    await inbox.update(item_id, {"status": "archived"})
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="move", author_id=user["Id"],
                      inbox_id=item_id, user_decision="archived")
    await q.edit_message_text(f"🗑 #{item_id} архив")
