from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import ProjectCreate, ProjectOrderItem, ProjectOut, ProjectPatch
from planner.db.models import Project
from planner.services.projects import (
    create_project as create_project_svc,
    delete_project as delete_project_svc,
    reorder_projects as reorder_projects_svc,
    update_project as update_project_svc,
)
from planner.services.tasks import count_open_by_project

router = APIRouter(prefix="/api/projects")


def _to_out(p: Project, open_count: int = 0) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        slug=p.slug,
        is_inbox=p.is_inbox,
        parent_id=p.parent_id,
        color=p.color,
        icon=p.icon,
        pinned=p.pinned,
        order_index=p.order_index,
        open_count=open_count,
    )


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(Project)
        .where(Project.archived.is_(False))
        .order_by(Project.pinned.desc(), Project.order_index, Project.name)
    )
    rows = await db.execute(stmt)
    projects = rows.scalars().all()
    counts = await count_open_by_project(db)
    return [_to_out(p, counts.get(p.id, 0)) for p in projects]


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
    return _to_out(proj)


@router.put("/order", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_projects(
    items: list[ProjectOrderItem],
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await reorder_projects_svc(db, [i.model_dump() for i in items])
    await db.commit()


@router.patch("/{project_id}", response_model=ProjectOut)
async def patch_project(
    project_id: int,
    payload: ProjectPatch,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    changes = payload.model_dump(exclude_unset=True)
    try:
        proj = await update_project_svc(db, project_id, changes)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
    await db.refresh(proj)
    return _to_out(proj)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        await delete_project_svc(db, project_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
