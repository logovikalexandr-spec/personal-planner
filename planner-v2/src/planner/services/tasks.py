from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from planner.db.models import InboxItem, Project, Task


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


async def list_tasks(session, *, scope: str = "all", project_id: int | None = None) -> list[Task]:
    stmt = select(Task).where(Task.status != "archived")
    if scope == "today":
        stmt = stmt.where(Task.due_date == date.today(), Task.status != "done")
    elif scope == "week":
        end = date.today() + timedelta(days=7)
        stmt = stmt.where(Task.due_date >= date.today(), Task.due_date <= end, Task.status != "done")
    elif scope == "inbox":
        inbox_id = await _inbox_project_id(session)
        stmt = stmt.where(Task.project_id == inbox_id)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    stmt = stmt.order_by(Task.due_date.is_(None), Task.due_date, Task.due_time, Task.order_index)
    rows = await session.execute(stmt)
    return list(rows.scalars().all())


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
