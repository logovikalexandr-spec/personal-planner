import pytest
from sqlalchemy import select

from planner.db.models import InboxItem, Project, Tag, Task


@pytest.mark.asyncio
async def test_create_project_and_task(db_session):
    proj = Project(name="ZIMA", slug="zima")
    db_session.add(proj)
    await db_session.flush()
    task = Task(title="Сделать креатив", project_id=proj.id, priority="high")
    db_session.add(task)
    await db_session.flush()
    rows = (await db_session.execute(select(Task))).scalars().all()
    assert len(rows) == 1
    assert rows[0].title == "Сделать креатив"
    assert rows[0].status == "todo"


@pytest.mark.asyncio
async def test_inbox_item_defaults(db_session):
    item = InboxItem(kind="text", source="manual", raw_content="купить молоко")
    db_session.add(item)
    await db_session.flush()
    assert item.status == "new"


@pytest.mark.asyncio
async def test_tag(db_session):
    t = Tag(name="work")
    db_session.add(t)
    await db_session.flush()
    assert t.id is not None
