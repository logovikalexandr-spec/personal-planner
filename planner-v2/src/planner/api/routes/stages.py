from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import StageCreate, StageOut, StagePatch
from planner.db.models import Stage, StageDependency
from planner.services.stages import (
    create_stage as create_stage_svc,
)
from planner.services.stages import (
    delete_stage as delete_stage_svc,
)
from planner.services.stages import (
    depends_on_ids as deps_of,
)
from planner.services.stages import (
    list_stages as list_stages_svc,
)
from planner.services.stages import (
    update_stage as update_stage_svc,
)

router = APIRouter(prefix="/api/stages")


def _to_out(s: Stage, dep_ids: list[int]) -> StageOut:
    return StageOut(
        id=s.id,
        project_id=s.project_id,
        name=s.name,
        order_index=s.order_index,
        start_date=s.start_date,
        end_date=s.end_date,
        status=s.status,
        progress=s.progress,
        is_milestone=s.is_milestone,
        milestone_date=s.milestone_date,
        depends_on_ids=dep_ids,
    )


@router.get("", response_model=list[StageOut])
async def list_stages(
    project_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stages = await list_stages_svc(db, project_id)
    ids = [s.id for s in stages]
    dep_map: dict[int, list[int]] = {i: [] for i in ids}
    if ids:
        rows = await db.execute(
            select(StageDependency.to_stage_id, StageDependency.from_stage_id)
            .where(StageDependency.to_stage_id.in_(ids))
            .order_by(StageDependency.from_stage_id)
        )
        for to_id, from_id in rows:
            dep_map[to_id].append(from_id)
    return [_to_out(s, dep_map[s.id]) for s in stages]


@router.post("", response_model=StageOut, status_code=status.HTTP_201_CREATED)
async def create_stage(
    payload: StageCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        stage = await create_stage_svc(db, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    await db.refresh(stage)
    return _to_out(stage, await deps_of(db, stage.id))


@router.put("/{stage_id}", response_model=StageOut)
async def update_stage(
    stage_id: int,
    payload: StagePatch,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        stage = await update_stage_svc(db, stage_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(code, str(exc)) from exc
    await db.commit()
    await db.refresh(stage)
    return _to_out(stage, await deps_of(db, stage.id))


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(
    stage_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        await delete_stage_svc(db, stage_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
