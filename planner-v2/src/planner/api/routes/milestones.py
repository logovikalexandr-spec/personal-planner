from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import MilestoneOut
from planner.services.stages import list_milestones

router = APIRouter(prefix="/api/milestones")


@router.get("", response_model=list[MilestoneOut])
async def get_milestones(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_: Annotated[date, Query(alias="from")],
    to: date,
):
    """Вехи (Stage.is_milestone) в окне дат по всем проектам — флажки календаря."""
    return await list_milestones(db, from_, to)
