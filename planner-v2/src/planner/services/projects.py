from __future__ import annotations

import re

from sqlalchemy import select

from planner.db.models import Project

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
    proj = Project(name=name, slug=final_slug, parent_id=parent_id, color=color, icon=icon)
    session.add(proj)
    await session.flush()
    return proj
