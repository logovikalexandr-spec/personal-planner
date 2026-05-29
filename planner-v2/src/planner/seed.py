"""Idempotent seed of the user's project categories. Run: python -m planner.seed

Upserts by slug, so re-running is safe and the list below can be edited later.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from planner.db import session as db_session
from planner.db.models import Project

# (name, slug, [children]) — children = (name, slug)
CATEGORIES: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("Глобальные цели", "global-goals", []),
    ("Здоровье", "health", [
        ("Спорт", "health-sport"),
        ("Физическое", "health-physical"),
        ("Внешнее", "health-appearance"),
    ]),
    ("Финансы", "finance", []),
    ("ZIMA", "zima", []),
    ("Недвижимость", "real-estate", []),
    ("Духовность", "spirituality", []),
    ("Интеллект", "intellect", []),
    ("Личные отношения", "relationships", []),
    ("Курсы", "courses", []),
    ("Личный бренд", "personal-brand", []),
    ("Прочее", "misc", []),
]


async def _get_or_create(session, *, name: str, slug: str, parent_id: int | None) -> Project:
    existing = await session.execute(select(Project).where(Project.slug == slug))
    proj = existing.scalar_one_or_none()
    if proj is None:
        proj = Project(name=name, slug=slug, parent_id=parent_id)
        session.add(proj)
        await session.flush()
        return proj
    # keep name/parent in sync if the seed list changed
    proj.name = name
    proj.parent_id = parent_id
    proj.archived = False
    await session.flush()
    return proj


async def seed() -> None:
    db_session._init()
    maker = db_session._sessionmaker
    assert maker is not None
    created = 0
    async with maker() as session:
        for name, slug, children in CATEGORIES:
            root = await _get_or_create(session, name=name, slug=slug, parent_id=None)
            for child_name, child_slug in children:
                await _get_or_create(session, name=child_name, slug=child_slug, parent_id=root.id)
        await session.commit()
        total = await session.execute(select(Project).where(Project.is_inbox.is_(False)))
        created = len(total.scalars().all())
    print(f"seed done: {created} non-inbox projects present")


if __name__ == "__main__":
    asyncio.run(seed())
