from __future__ import annotations

from sqlalchemy import select

from planner.db.models import Attachment, InboxItem


async def capture(
    session, *, kind: str, raw_content: str, source: str = "manual",
    attachment: dict | None = None,
) -> InboxItem:
    item = InboxItem(kind=kind, source=source, raw_content=raw_content)
    session.add(item)
    await session.flush()
    if attachment is not None:
        att = Attachment(inbox_item_id=item.id, **attachment)
        session.add(att)
        await session.flush()
    return item


async def list_new(session) -> list[InboxItem]:
    rows = await session.execute(
        select(InboxItem).where(InboxItem.status == "new").order_by(InboxItem.created_at.desc())
    )
    return list(rows.scalars().all())
