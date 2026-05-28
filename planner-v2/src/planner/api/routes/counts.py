from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import CountsOut
from planner.services.tasks import smart_list_counts

router = APIRouter(prefix="/api/counts")


@router.get("", response_model=CountsOut)
async def get_counts(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await smart_list_counts(db)
