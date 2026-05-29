from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import TagCreate, TagOut
from planner.db.models import Tag

router = APIRouter(prefix="/api/tags")


@router.get("", response_model=list[TagOut])
async def list_tags(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = await db.execute(select(Tag).order_by(Tag.name))
    return list(rows.scalars().all())


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    payload: TagCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = await db.execute(select(Tag).where(Tag.name == payload.name))
    tag = existing.scalar_one_or_none()
    if tag is None:
        tag = Tag(name=payload.name, color=payload.color)
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
    return tag
