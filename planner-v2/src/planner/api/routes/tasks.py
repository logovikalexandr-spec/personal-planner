from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import (
    TaskCreate,
    TaskDetailOut,
    TaskOut,
    TaskPatch,
    TaskPatchResult,
)
from planner.db.models import Task
from planner.services import tasks as svc

router = APIRouter(prefix="/api/tasks")

# Plain scalar fields a PATCH may set directly on the Task model.
_TASK_FIELDS = (
    "title", "priority", "project_id", "due_date", "due_time", "end_time",
    "description", "reminder_at", "recurrence", "recurrence_json", "progress",
    "pinned", "parent_task_id", "impact",
)


async def _build_detail(db: AsyncSession, task: Task) -> TaskDetailOut:
    """Serialize a Task into TaskDetailOut, including its subtasks."""
    subtasks = await svc.list_subtasks(db, task.id)
    detail = TaskDetailOut.model_validate(task)
    detail.subtasks = [TaskOut.model_validate(s) for s in subtasks]
    return detail


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: str = "all",
    project_id: int | None = None,
    include_children: bool = False,
    on_date: date | None = None,
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
    parent_task_id: int | None = None,
):
    if project_id is not None and include_children:
        from planner.services.tasks import descendant_project_ids
        project_ids = await descendant_project_ids(db, project_id)
        return await svc.list_tasks(
            db, scope=scope, project_ids=project_ids, on_date=on_date,
            from_date=from_, to_date=to,
        )
    return await svc.list_tasks(
        db, scope=scope, project_id=project_id, on_date=on_date,
        from_date=from_, to_date=to, parent_task_id=parent_task_id,
    )


@router.get("/{task_id}", response_model=TaskDetailOut)
async def get_task(
    task_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    return await _build_detail(db, task)


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


@router.patch("/{task_id}", response_model=TaskPatchResult)
async def patch_task(
    task_id: int,
    payload: TaskPatch,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    t = await db.get(Task, task_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")

    fields = payload.model_dump(exclude_unset=True)

    # Apply plain scalar fields first (recurrence_json may be needed for completion).
    for key in _TASK_FIELDS:
        if key in fields:
            value = fields[key]
            if key == "recurrence_json" and value is not None:
                # store the validated dict (model_dump already gave us a dict)
                setattr(t, key, value)
            else:
                setattr(t, key, value)

    if payload.tag_ids is not None:
        await svc.set_task_tags(db, task_id, payload.tag_ids)

    next_task = None
    if payload.status is not None:
        if payload.status == "done" and t.recurrence_json:
            # complete-with-recurrence: close current + generate next instance
            _, next_task = await svc.complete_task(db, task_id)
        else:
            await svc.set_status(db, task_id, payload.status)

    await db.flush()
    await db.commit()
    await db.refresh(t)

    result = TaskPatchResult(task=await _build_detail(db, t))
    if next_task is not None:
        await db.refresh(next_task)
        result.next_task = await _build_detail(db, next_task)
    return result


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ok = await svc.delete_task(db, task_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    await db.commit()
