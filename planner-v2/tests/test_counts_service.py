"""TDD tests for count_open_by_project, descendant_project_ids, smart_list_counts."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from planner.db.models import Project, Task
from planner.services.tasks import (
    count_open_by_project,
    descendant_project_ids,
    smart_list_counts,
)


# ---------------------------------------------------------------------------
# count_open_by_project
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_count_open_by_project_basic(db_session):
    p1 = Project(name="Work", slug="work")
    p2 = Project(name="Personal", slug="personal")
    db_session.add_all([p1, p2])
    await db_session.flush()

    # p1: 2 open, 1 done, 1 archived
    db_session.add_all([
        Task(title="t1", project_id=p1.id, status="todo"),
        Task(title="t2", project_id=p1.id, status="in_progress"),
        Task(title="t3", project_id=p1.id, status="done"),
        Task(title="t4", project_id=p1.id, status="archived"),
    ])
    # p2: 1 open
    db_session.add(Task(title="t5", project_id=p2.id, status="todo"))
    # task with no project: should be excluded
    db_session.add(Task(title="t6", project_id=None, status="todo"))
    await db_session.flush()

    counts = await count_open_by_project(db_session)
    assert counts[p1.id] == 2
    assert counts[p2.id] == 1
    assert all(v is not None for v in counts.keys())  # no None key


@pytest.mark.asyncio
async def test_count_open_by_project_empty(db_session):
    counts = await count_open_by_project(db_session)
    assert counts == {}


@pytest.mark.asyncio
async def test_count_open_by_project_no_none_key(db_session):
    db_session.add(Task(title="orphan", project_id=None, status="todo"))
    await db_session.flush()
    counts = await count_open_by_project(db_session)
    assert None not in counts


# ---------------------------------------------------------------------------
# descendant_project_ids
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_descendant_project_ids_single(db_session):
    p = Project(name="Root", slug="root")
    db_session.add(p)
    await db_session.flush()

    result = await descendant_project_ids(db_session, p.id)
    assert result == [p.id]


@pytest.mark.asyncio
async def test_descendant_project_ids_tree(db_session):
    root = Project(name="Root", slug="root2")
    db_session.add(root)
    await db_session.flush()

    c1 = Project(name="Child1", slug="child1", parent_id=root.id)
    c2 = Project(name="Child2", slug="child2", parent_id=root.id)
    db_session.add_all([c1, c2])
    await db_session.flush()

    gc1 = Project(name="Grandchild1", slug="gc1", parent_id=c1.id)
    db_session.add(gc1)
    await db_session.flush()

    result = await descendant_project_ids(db_session, root.id)
    assert set(result) == {root.id, c1.id, c2.id, gc1.id}


@pytest.mark.asyncio
async def test_descendant_project_ids_subtree(db_session):
    """Returns only the subtree rooted at the given id."""
    root = Project(name="Root", slug="root3")
    db_session.add(root)
    await db_session.flush()

    c1 = Project(name="Child1", slug="child1b", parent_id=root.id)
    c2 = Project(name="Child2", slug="child2b", parent_id=root.id)
    db_session.add_all([c1, c2])
    await db_session.flush()

    result = await descendant_project_ids(db_session, c1.id)
    assert set(result) == {c1.id}
    assert root.id not in result
    assert c2.id not in result


# ---------------------------------------------------------------------------
# smart_list_counts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_smart_list_counts(db_session):
    # inbox project
    inbox = Project(name="Inbox", slug="inbox-sl", is_inbox=True)
    other = Project(name="Work", slug="work-sl")
    db_session.add_all([inbox, other])
    await db_session.flush()

    today = date.today()
    tomorrow = today + timedelta(days=1)
    in7 = today + timedelta(days=5)
    out7 = today + timedelta(days=9)

    db_session.add_all([
        # open, no due -> counts only in 'all'
        Task(title="a1", project_id=other.id, status="todo"),
        # open, due today -> all + today + next7
        Task(title="a2", project_id=other.id, status="todo", due_date=today),
        # open, due tomorrow -> all + tomorrow + next7
        Task(title="a3", project_id=other.id, status="in_progress", due_date=tomorrow),
        # open, due in7 -> all + next7
        Task(title="a4", project_id=other.id, status="todo", due_date=in7),
        # open, due out7 -> all only
        Task(title="a5", project_id=other.id, status="todo", due_date=out7),
        # open, overdue (due 3 дня назад) -> all + today (просрочка подтягивается в «Сегодня»)
        Task(title="a9", project_id=other.id, status="todo", due_date=today - timedelta(days=3)),
        # done, due today -> not counted anywhere
        Task(title="a6", project_id=other.id, status="done", due_date=today),
        # archived, due today -> not counted
        Task(title="a7", project_id=other.id, status="archived", due_date=today),
        # inbox open -> all + inbox
        Task(title="a8", project_id=inbox.id, status="todo"),
    ])
    await db_session.flush()

    c = await smart_list_counts(db_session)

    # all open tasks: a1, a2, a3, a4, a5, a8, a9 = 7
    assert c["all"] == 7
    # today: a2 (сегодня) + a9 (просрочка) = 2
    assert c["today"] == 2
    # tomorrow: a3 = 1
    assert c["tomorrow"] == 1
    # next7: a2 (today), a3 (tomorrow), a4 (day 5) = 3 (a9 просрочка не входит в next7)
    assert c["next7"] == 3
    # inbox: a8 = 1
    assert c["inbox"] == 1


@pytest.mark.asyncio
async def test_smart_list_counts_empty(db_session):
    # no inbox project -> inbox=0, others=0
    c = await smart_list_counts(db_session)
    assert c["all"] == 0
    assert c["today"] == 0
    assert c["tomorrow"] == 0
    assert c["next7"] == 0
    assert c["inbox"] == 0
