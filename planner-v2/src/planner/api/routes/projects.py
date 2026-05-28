from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import ProjectCreate, ProjectOut
from planner.db.models import Project

router = APIRouter(prefix="/api/projects")


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = await db.execute(select(Project).where(Project.archived.is_(False)).order_by(Project.name))
    return rows.scalars().all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    proj = Project(name=payload.name, slug=payload.slug, color=payload.color)
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return proj
