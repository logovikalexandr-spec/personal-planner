from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import ProjectCreate, ProjectOut
from planner.db.models import Project
from planner.services.projects import create_project as create_project_svc
from planner.services.tasks import count_open_by_project

router = APIRouter(prefix="/api/projects")


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(Project).where(Project.archived.is_(False)).order_by(Project.name)
    rows = await db.execute(stmt)
    projects = rows.scalars().all()
    counts = await count_open_by_project(db)
    return [
        ProjectOut(
            id=p.id,
            name=p.name,
            slug=p.slug,
            is_inbox=p.is_inbox,
            parent_id=p.parent_id,
            color=p.color,
            open_count=counts.get(p.id, 0),
        )
        for p in projects
    ]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    proj = await create_project_svc(
        db,
        name=payload.name,
        parent_id=payload.parent_id,
        color=payload.color,
        icon=payload.icon,
        slug=payload.slug,
    )
    await db.commit()
    await db.refresh(proj)
    return ProjectOut(
        id=proj.id,
        name=proj.name,
        slug=proj.slug,
        is_inbox=proj.is_inbox,
        parent_id=proj.parent_id,
        color=proj.color,
        open_count=0,
    )
