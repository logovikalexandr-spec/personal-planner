from datetime import date, timedelta

import pytest

from planner.db.models import InboxItem, Project
from planner.services import tasks as svc


@pytest.mark.asyncio
async def test_create_task_defaults_to_inbox(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    t = await svc.create_task(db_session, title="купить молоко")
    assert t.project_id == inbox.id
    assert t.status == "todo"


@pytest.mark.asyncio
async def test_list_today(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    await svc.create_task(db_session, title="сегодня", due_date=date.today())
    await svc.create_task(db_session, title="завтра", due_date=date.today() + timedelta(days=1))
    today = await svc.list_tasks(db_session, scope="today")
    assert [t.title for t in today] == ["сегодня"]


@pytest.mark.asyncio
async def test_list_planned_returns_future_dated_open(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    await svc.create_task(db_session, title="сегодня", due_date=date.today())
    await svc.create_task(db_session, title="через 3 дня", due_date=date.today() + timedelta(days=3))
    await svc.create_task(db_session, title="без даты")
    planned = await svc.list_tasks(db_session, scope="planned")
    titles = [t.title for t in planned]
    assert "через 3 дня" in titles
    assert "сегодня" in titles          # сегодня и будущее = запланированные
    assert "без даты" not in titles     # без due_date не запланирована


@pytest.mark.asyncio
async def test_list_overdue_returns_past_dated_open(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    await svc.create_task(db_session, title="вчера", due_date=date.today() - timedelta(days=1))
    await svc.create_task(db_session, title="неделю назад", due_date=date.today() - timedelta(days=7))
    await svc.create_task(db_session, title="сегодня", due_date=date.today())
    await svc.create_task(db_session, title="без даты")
    done_past = await svc.create_task(
        db_session, title="вчера закрытая", due_date=date.today() - timedelta(days=1)
    )
    await svc.set_status(db_session, done_past.id, "done")
    overdue = await svc.list_tasks(db_session, scope="overdue")
    titles = [t.title for t in overdue]
    assert "вчера" in titles
    assert "неделю назад" in titles
    assert "сегодня" not in titles          # сегодня не просрочено
    assert "без даты" not in titles          # без due_date не просрочено
    assert "вчера закрытая" not in titles    # done не просрочено


@pytest.mark.asyncio
async def test_set_status_done(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    t = await svc.create_task(db_session, title="x")
    await svc.set_status(db_session, t.id, "done")
    assert t.status == "done"
    assert t.done_at is not None


@pytest.mark.asyncio
async def test_triage_inbox_creates_task(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    proj = Project(name="ZIMA", slug="zima")
    db_session.add_all([inbox, proj])
    await db_session.flush()
    item = InboxItem(kind="text", source="manual", raw_content="сделать креатив")
    db_session.add(item)
    await db_session.flush()
    t = await svc.triage_inbox(
        db_session, item.id, project_id=proj.id, title="сделать креатив", priority="high"
    )
    assert t.project_id == proj.id
    assert t.priority == "high"
    assert item.status == "triaged"
