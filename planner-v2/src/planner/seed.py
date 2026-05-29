"""Idempotent seed of the user's project categories. Run: python -m planner.seed

Upserts by slug. On create sets name/emoji/color/order; on an existing row it only
fills emoji/color when they are still NULL and un-archives it — so edits made later
in the UI (rename, recolor, reorder, reparent) are never clobbered by a re-run.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from planner.db import session as db_session
from planner.db.models import Project

# (name, slug, emoji, color, children) — child = (name, slug, emoji)
CATEGORIES: list[tuple[str, str, str, str, list[tuple[str, str, str]]]] = [
    ("Глобальные цели", "global-goals", "🎯", "#E5564B", []),
    ("Здоровье", "health", "💚", "#4FB477", [
        ("Спорт", "health-sport", "🏋️"),
        ("Физическое", "health-physical", "🧘"),
        ("Внешнее", "health-appearance", "💆"),
    ]),
    ("Финансы", "finance", "💰", "#E0B341", []),
    ("ZIMA", "zima", "🧊", "#3C8EEE", []),
    ("Недвижимость", "real-estate", "🏛️", "#9B6BE0", []),
    ("Духовность", "spirituality", "🕉️", "#EE8A3C", []),
    ("Интеллект", "intellect", "🧠", "#E5564B", []),
    ("Личные отношения", "relationships", "🎭", "#9B6BE0", []),
    ("Курсы", "courses", "📚", "#3C8EEE", []),
    ("Личный бренд", "personal-brand", "⭐", "#E0B341", []),
    ("Прочее", "misc", "📦", "#7C8794", []),
]


async def _get_or_create(
    session, *, name: str, slug: str, parent_id: int | None,
    icon: str | None, color: str | None, order_index: int,
) -> Project:
    existing = await session.execute(select(Project).where(Project.slug == slug))
    proj = existing.scalar_one_or_none()
    if proj is None:
        proj = Project(
            name=name, slug=slug, parent_id=parent_id,
            icon=icon, color=color, order_index=order_index,
        )
        session.add(proj)
        await session.flush()
        return proj
    # existing: fill emoji/color only if missing; never clobber user edits
    if proj.icon is None:
        proj.icon = icon
    if proj.color is None:
        proj.color = color
    proj.archived = False
    await session.flush()
    return proj


async def seed() -> None:
    db_session._init()
    maker = db_session._sessionmaker
    assert maker is not None
    async with maker() as session:
        for root_order, (name, slug, emoji, color, children) in enumerate(CATEGORIES):
            root = await _get_or_create(
                session, name=name, slug=slug, parent_id=None,
                icon=emoji, color=color, order_index=root_order,
            )
            for child_order, (cn, cs, ce) in enumerate(children):
                await _get_or_create(
                    session, name=cn, slug=cs, parent_id=root.id,
                    icon=ce, color=None, order_index=child_order,
                )
        await session.commit()
        total = await session.execute(select(Project).where(Project.is_inbox.is_(False)))
        count = len(total.scalars().all())
    print(f"seed done: {count} non-inbox projects present")


if __name__ == "__main__":
    asyncio.run(seed())
