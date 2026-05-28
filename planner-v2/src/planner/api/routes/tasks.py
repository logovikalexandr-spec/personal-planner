from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import TaskCreate, TaskOut, TaskPatch
from planner.db.models import Task
from planner.services import tasks as svc

router = APIRouter(prefix="/api/tasks")


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: str = "all",
    project_id: int | None = None,
    include_children: bool = False,
):
    if project_id is not None and include_children:
        from planner.services.tasks import descendant_project_ids
        project_ids = await descendant_project_ids(db, project_id)
        return await svc.list_tasks(db, scope=scope, project_ids=project_ids)
    return await svc.list_tasks(db, scope=scope, project_id=project_id)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    t = await svc.create_task(
        db, title=payload.title, project_id=payload.project_id,
        priority=payload.priority, due_date=payload.due_date, due_time=payload.due_time,
    )
    await db.commit()
    await db.refresh(t)
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
    if payload.priority is not None:
        t.priority = payload.priority
    if payload.project_id is not None:
        t.project_id = payload.project_id
    await db.commit()
    await db.refresh(t)
    return t
