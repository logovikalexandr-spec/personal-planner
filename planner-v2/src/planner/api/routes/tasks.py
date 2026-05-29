from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import TaskCreate, TaskOut, TaskPatch
from planner.db.models import Task
from planner.services import tasks as svc

router = APIRouter(prefix="/api/tasks")

_TASK_FIELDS = (
    "priority", "project_id", "due_date", "due_time", "end_time",
    "description", "reminder_at", "recurrence", "parent_task_id",
)


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: str = "all",
    project_id: int | None = None,
    include_children: bool = False,
    on_date: date | None = None,
    parent_task_id: int | None = None,
):
    if project_id is not None and include_children:
        from planner.services.tasks import descendant_project_ids
        project_ids = await descendant_project_ids(db, project_id)
        return await svc.list_tasks(db, scope=scope, project_ids=project_ids, on_date=on_date)
    return await svc.list_tasks(
        db, scope=scope, project_id=project_id, on_date=on_date, parent_task_id=parent_task_id,
    )


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    fields = payload.model_dump(exclude_unset=True, exclude={"title", "project_id", "tag_ids"})
    t = await svc.create_task(db, title=payload.title, project_id=payload.project_id, **fields)
    if payload.tag_ids is not None:
        await svc.set_task_tags(db, t.id, payload.tag_ids)
    await db.commit()
    await db.refresh(t, ["tags"])
    return t


@router.patch("/{task_id}", response_model=TaskOut)
async def patch_task(
    task_id: int,
    payload: TaskPatch,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.status is not None:
        try:
            t = await svc.set_status(db, task_id, payload.status)
        except ValueError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    else:
        t = await db.get(Task, task_id)
        if t is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    fields = payload.model_dump(exclude_unset=True)
    for key in _TASK_FIELDS:
        if key in fields:
            setattr(t, key, fields[key])
    if payload.tag_ids is not None:
        await svc.set_task_tags(db, task_id, payload.tag_ids)
    await db.commit()
    await db.refresh(t, ["tags"])
    return t
