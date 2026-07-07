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


async def resolve(session, inbox_id: int, task_id: int | None = None) -> InboxItem:
    """Mark an inbox item consumed after a task was created from it in the editor.

    If task_id is given, move the item's attachments (photos) onto that task so they
    are not orphaned.
    """
    item = await session.get(InboxItem, inbox_id)
    if item is None:
        raise ValueError("inbox item not found")
    item.status = "triaged"
    if task_id is not None:
        atts = await session.execute(
            select(Attachment).where(Attachment.inbox_item_id == inbox_id)
        )
        for att in atts.scalars().all():
            att.task_id = task_id
            att.inbox_item_id = None
    await session.flush()
    return item
