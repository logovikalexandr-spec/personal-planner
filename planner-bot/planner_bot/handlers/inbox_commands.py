from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram import Update
from telegram.ext import ContextTypes


async def on_process_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
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

    projects = context.bot_data["projects_repo"]
    target_slug = "learning"
    project = await projects.get_by_slug(target_slug)

    process_inbox = context.bot_data["process_inbox"]
    decision = await process_inbox(item=item, target_project=project,
                                   recent_filenames=[])

    repo_root: Path = context.bot_data["repo_path"]
    src = repo_root / item["file_path_repo"]
    dest_dir = (repo_root / project["folder_path"] / decision["subfolder"])
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    text = src.read_text()
    if decision.get("summary_md"):
        text = text + "\n" + decision["summary_md"] + "\n"
    src.unlink()
    dest.write_text(text)

    await inbox.update(item_id, {
        "status": "processed",
        "project_id": project["Id"],
        "target_path": str(dest.relative_to(repo_root)),
        "action_taken": decision["action"],
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "file_path_repo": str(dest.relative_to(repo_root)),
    })

    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[src, dest],
        message=f"process #{item_id}: → {project['slug']}/{decision['subfolder']}",
    )

    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="process", author_id=user["Id"],
                      inbox_id=item_id, llm_model="claude-sonnet-4-6",
                      tokens_in=decision.get("tokens_in", 0),
                      tokens_out=decision.get("tokens_out", 0),
                      cost_usd=decision.get("cost_usd", 0.0),
                      llm_output=decision.get("action", ""))

    rel_path = dest.relative_to(repo_root)
    await q.edit_message_text(
        f"✅ #{item_id} → {project['slug']}/{decision['subfolder']}\n"
        f"`{rel_path}`",
        parse_mode="Markdown",
    )
