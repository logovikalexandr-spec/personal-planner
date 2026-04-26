from __future__ import annotations

from pathlib import Path

from planner_bot.repo_layout import inbox_path, task_path


_FRONTMATTER_TEMPLATE = """---
inbox_id: {inbox_id}
author: {author}
source: {source}
{url_line}created: {created}
status: {status}
project: {project}
---
"""


def render_inbox_frontmatter(item: dict) -> str:
    url_line = ""
    if item["source_type"] == "url" and item.get("raw_content"):
        url_line = f"url: {item['raw_content']}\n"
    proj = item.get("project_slug") or "null"
    return _FRONTMATTER_TEMPLATE.format(
        inbox_id=item["Id"],
        author=item["author_name"],
        source=item["source_type"],
        url_line=url_line,
        created=item["created_at"],
        status=item["status"],
        project=proj,
    )


def render_inbox_body(item: dict) -> str:
    title = item.get("title") or "(no title)"
    summary = item.get("summary") or ""
    transcript = item.get("transcript") or ""
    body = f"\n# {title}\n"
    if summary:
        body += f"\n{summary}\n"
    if transcript:
        body += f"\n## Transcript\n\n{transcript}\n"
    if item["source_type"] == "text" and item.get("raw_content"):
        body += f"\n## Original\n\n{item['raw_content']}\n"
    return body


def write_inbox_md(repo: Path, item: dict) -> Path:
    p = inbox_path(repo, item["created_at"], item.get("title") or f"item-{item['Id']}")
    p.parent.mkdir(parents=True, exist_ok=True)
    text = render_inbox_frontmatter(item) + render_inbox_body(item)
    p.write_text(text)
    return p


_TASK_FRONTMATTER = """---
task_id: {Id}
author: {author}
project: {project}
quadrant: {quadrant}
due: {due}
due_time: {due_time}
status: {status}
created: {created}
---
"""


def write_task_md(repo: Path, task: dict) -> Path:
    p = task_path(repo, task["created"], task["title"])
    p.parent.mkdir(parents=True, exist_ok=True)
    fm = _TASK_FRONTMATTER.format(
        Id=task["Id"], author=task["author"],
        project=task.get("project") or "null",
        quadrant=task["quadrant"],
        due=task.get("due") or "null",
        due_time=task.get("due_time") or "null",
        status=task["status"], created=task["created"],
    )
    body = f"\n# {task['title']}\n"
    if task.get("description"):
        body += f"\n{task['description']}\n"
    p.write_text(fm + body)
    return p
