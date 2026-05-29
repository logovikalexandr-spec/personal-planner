from __future__ import annotations

from collections import defaultdict, deque
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select

from planner.db.models import InboxItem, Project, Tag, Task, TaskTag


async def _inbox_project_id(session) -> int | None:
    row = await session.execute(select(Project.id).where(Project.is_inbox.is_(True)))
    return row.scalar_one_or_none()


async def create_task(session, *, title: str, project_id: int | None = None, **fields) -> Task:
    if project_id is None:
        project_id = await _inbox_project_id(session)
    task = Task(title=title, project_id=project_id, **fields)
    session.add(task)
    await session.flush()
    return task


async def set_task_tags(session, task_id: int, tag_ids: list[int]) -> None:
    """Replace a task's tags with the given ids (ignoring ids that don't exist)."""
    await session.execute(TaskTag.__table__.delete().where(TaskTag.task_id == task_id))
    if tag_ids:
        rows = await session.execute(select(Tag.id).where(Tag.id.in_(tag_ids)))
        valid = [tid for (tid,) in rows]
        for tid in valid:
            session.add(TaskTag(task_id=task_id, tag_id=tid))
    await session.flush()


async def count_open_by_project(session) -> dict[int, int]:
    """Map project_id -> number of open tasks (status todo/in_progress). project_id None excluded."""
    stmt = (
        select(Task.project_id, func.count().label("cnt"))
        .where(Task.status.in_(("todo", "in_progress")))
        .where(Task.project_id.is_not(None))
        .group_by(Task.project_id)
    )
    rows = await session.execute(stmt)
    return {row.project_id: row.cnt for row in rows}


async def descendant_project_ids(session, root_id: int) -> list[int]:
    """root_id plus all descendant project ids (by parent_id), arbitrary depth. Includes root."""
    rows = await session.execute(select(Project.id, Project.parent_id))
    children: dict[int, list[int]] = defaultdict(list)
    all_ids: set[int] = set()
    for pid, par in rows:
        all_ids.add(pid)
        if par is not None:
            children[par].append(pid)

    if root_id not in all_ids:
        return []

    result: list[int] = []
    queue: deque[int] = deque([root_id])
    while queue:
        node = queue.popleft()
        result.append(node)
        for child in children.get(node, []):
            queue.append(child)
    return result


async def list_tasks(
    session,
    *,
    scope: str = "all",
    project_id: int | None = None,
    project_ids: list[int] | None = None,
    on_date: date | None = None,
    parent_task_id: int | None = None,
) -> list[Task]:
    stmt = select(Task).where(Task.status != "archived")
    if parent_task_id is not None:
        stmt = stmt.where(Task.parent_task_id == parent_task_id)
    if on_date is not None:
        stmt = stmt.where(Task.due_date == on_date)
    elif scope == "today":
        stmt = stmt.where(Task.due_date == date.today(), Task.status != "done")
    elif scope == "week":
        end = date.today() + timedelta(days=7)
        stmt = stmt.where(
            Task.due_date >= date.today(), Task.due_date <= end, Task.status != "done"
        )
    elif scope == "inbox":
        inbox_id = await _inbox_project_id(session)
        stmt = stmt.where(Task.project_id == inbox_id)
    # project_ids takes precedence over project_id
    if project_ids is not None:
        stmt = stmt.where(Task.project_id.in_(project_ids))
    elif project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    stmt = stmt.order_by(Task.due_date.is_(None), Task.due_date, Task.due_time, Task.order_index)
    rows = await session.execute(stmt)
    return list(rows.scalars().all())


async def smart_list_counts(session) -> dict[str, int]:
    """Counts of OPEN tasks for smart lists: all, today, tomorrow, next7, inbox."""
    today = date.today()
    tomorrow = today + timedelta(days=1)
    next7_end = today + timedelta(days=7)
    inbox_id = await _inbox_project_id(session)

    open_statuses = ("todo", "in_progress")

    # all
    r_all = await session.execute(
        select(func.count()).where(Task.status.in_(open_statuses))
    )
    count_all = r_all.scalar_one()

    # today
    r_today = await session.execute(
        select(func.count()).where(Task.status.in_(open_statuses), Task.due_date == today)
    )
    count_today = r_today.scalar_one()

    # tomorrow
    r_tomorrow = await session.execute(
        select(func.count()).where(Task.status.in_(open_statuses), Task.due_date == tomorrow)
    )
    count_tomorrow = r_tomorrow.scalar_one()

    # next7: due_date in [today, today+7]
    r_next7 = await session.execute(
        select(func.count()).where(
            Task.status.in_(open_statuses),
            Task.due_date >= today,
            Task.due_date <= next7_end,
        )
    )
    count_next7 = r_next7.scalar_one()

    # inbox
    if inbox_id is not None:
        r_inbox = await session.execute(
            select(func.count()).where(
                Task.status.in_(open_statuses), Task.project_id == inbox_id
            )
        )
        count_inbox = r_inbox.scalar_one()
    else:
        count_inbox = 0

    return {
        "all": count_all,
        "today": count_today,
        "tomorrow": count_tomorrow,
        "next7": count_next7,
        "inbox": count_inbox,
    }


async def set_status(session, task_id: int, status: str) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise ValueError("task not found")
    task.status = status
    task.done_at = datetime.now(UTC) if status == "done" else None
    await session.flush()
    return task


async def triage_inbox(session, inbox_id: int, *, project_id: int, title: str, **fields) -> Task:
    item = await session.get(InboxItem, inbox_id)
    if item is None:
        raise ValueError("inbox item not found")
    task = Task(title=title, project_id=project_id, source=item.source, **fields)
    session.add(task)
    item.status = "triaged"
    await session.flush()
    return task
