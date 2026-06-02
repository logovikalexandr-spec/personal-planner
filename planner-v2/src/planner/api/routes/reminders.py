from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import ReminderOut, RemindersPut
from planner.services import tasks as svc

router = APIRouter(prefix="/api")


@router.put("/tasks/{task_id}/reminders", response_model=list[ReminderOut])
async def put_reminders(
    task_id: int,
    payload: RemindersPut,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        reminders = await svc.replace_reminders(
            db, task_id, [r.model_dump() for r in payload.reminders]
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
    for r in reminders:
        await db.refresh(r)
    return reminders
