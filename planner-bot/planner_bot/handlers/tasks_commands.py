from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram.ext import ContextTypes

from planner_bot.acl import can_access_project
from planner_bot.markdown_files import write_task_md


async def create_task_with_args(*, user: dict, title: str, description: str,
                                project_slug: str | None, quadrant: str,
                                due_date: str | None, due_time: str | None,
                                source_text: str,
                                context: ContextTypes.DEFAULT_TYPE) -> dict:
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(project_slug) if project_slug else None
    if project and not can_access_project(user, project):
        raise PermissionError(f"Нет доступа к {project_slug}")
    tasks = context.bot_data["tasks_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "author_id": user["Id"], "title": title, "description": description,
        "project_id": project["Id"] if project else None,
        "quadrant": quadrant, "due_date": due_date, "due_time": due_time,
        "status": "todo", "source_text": source_text,
        "created_at": now_iso,
    }
    rec = await tasks.create(payload)
    md = write_task_md(context.bot_data["repo_path"], {
        "Id": rec["Id"], "author": user["name"].lower(),
        "project": project_slug, "quadrant": quadrant,
        "due": due_date, "due_time": due_time,
        "status": "todo", "created": now_iso,
        "title": title, "description": description,
    })
    repo_root: Path = context.bot_data["repo_path"]
    await tasks.update(rec["Id"],
                       {"file_path_repo": str(md.relative_to(repo_root))})
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[md],
        message=f"task: #{rec['Id']} {title[:60]} ({user['name'].lower()})",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="process", author_id=user["Id"],
                      task_id=rec["Id"], user_decision=quadrant,
                      llm_input=source_text[:500])
    return rec
