from __future__ import annotations

import re

from sqlalchemy import select, update

from planner.db.models import Project, Task

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(name: str) -> str:
    s = "".join(_TRANSLIT.get(ch, ch) for ch in name.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "project"


async def unique_slug(session, base: str, *, exclude_id: int | None = None) -> str:
    rows = await session.execute(select(Project.slug))
    taken = {s for (s,) in rows}
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


async def _next_order_index(session, parent_id: int | None) -> int:
    rows = await session.execute(
        select(Project.order_index).where(
            Project.parent_id.is_(parent_id) if parent_id is None else Project.parent_id == parent_id,
            Project.is_inbox.is_(False),
        )
    )
    vals = [v for (v,) in rows]
    return (max(vals) + 1) if vals else 0


async def create_project(
    session,
    *,
    name: str,
    parent_id: int | None = None,
    color: str | None = None,
    icon: str | None = None,
    slug: str | None = None,
) -> Project:
    base = slug or slugify(name)
    final_slug = await unique_slug(session, base)
    order_index = await _next_order_index(session, parent_id)
    proj = Project(
        name=name, slug=final_slug, parent_id=parent_id,
        color=color, icon=icon, order_index=order_index,
    )
    session.add(proj)
    await session.flush()
    return proj


_PATCH_FIELDS = {"name", "parent_id", "color", "icon", "pinned", "order_index"}


async def update_project(session, project_id: int, changes: dict) -> Project:
    proj = await session.get(Project, project_id)
    if proj is None:
        raise ValueError("project not found")
    for key, value in changes.items():
        if key in _PATCH_FIELDS:
            setattr(proj, key, value)
    await session.flush()
    return proj


async def _inbox_id(session) -> int | None:
    row = await session.execute(select(Project.id).where(Project.is_inbox.is_(True)))
    return row.scalar_one_or_none()


async def delete_project(session, project_id: int) -> None:
    proj = await session.get(Project, project_id)
    if proj is None or proj.is_inbox:
        raise ValueError("project not found or is inbox")
    # reparent direct children to the deleted node's parent
    await session.execute(
        update(Project).where(Project.parent_id == project_id).values(parent_id=proj.parent_id)
    )
    # move tasks of this project to Inbox so they are not lost
    inbox_id = await _inbox_id(session)
    await session.execute(
        update(Task).where(Task.project_id == project_id).values(project_id=inbox_id)
    )
    await session.delete(proj)
    await session.flush()


async def reorder_projects(session, items: list[dict]) -> None:
    """items: [{id, parent_id, order_index}, ...]"""
    for it in items:
        await session.execute(
            update(Project)
            .where(Project.id == it["id"])
            .values(parent_id=it.get("parent_id"), order_index=it["order_index"])
        )
    await session.flush()
