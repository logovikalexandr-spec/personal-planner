from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import InboxOut, TaskOut, TriageIn
from planner.services import inbox as inbox_svc
from planner.services import tasks as tasks_svc

router = APIRouter(prefix="/api/inbox")


@router.get("", response_model=list[InboxOut])
async def list_inbox(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await inbox_svc.list_new(db)


@router.post("/{item_id}/triage", response_model=TaskOut)
async def triage(
    item_id: int,
    payload: TriageIn,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    t = await tasks_svc.triage_inbox(
        db, item_id, project_id=payload.project_id, title=payload.title,
        priority=payload.priority, due_date=payload.due_date,
    )
    await db.commit()
    await db.refresh(t)
    return t
