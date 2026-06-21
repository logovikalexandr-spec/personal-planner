from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import (
    CoachTargetIn,
    ExerciseCreate,
    ExerciseHistoryPoint,
    ExerciseOut,
    SetsReplaceIn,
    TemplateOut,
    WorkoutCompleteIn,
    WorkoutSessionCreate,
    WorkoutSessionOut,
)
from planner.services import coach
from planner.services import workouts as svc

router = APIRouter(prefix="/api")
Owner = Annotated[TelegramUser, Depends(require_owner)]
Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/exercises", response_model=list[ExerciseOut])
async def list_exercises(_: Owner, db: Db):
    return await svc.list_exercises(db)


@router.post("/exercises", response_model=ExerciseOut, status_code=201)
async def create_exercise(payload: ExerciseCreate, _: Owner, db: Db):
    ex = await svc.create_exercise(db, payload.model_dump(exclude_unset=True))
    await db.commit()
    return ex


@router.get("/projects/{project_id}/workout-templates", response_model=list[TemplateOut])
async def list_templates(project_id: int, _: Owner, db: Db):
    return await svc.list_templates(db, project_id)


@router.get("/projects/{project_id}/workouts", response_model=list[WorkoutSessionOut])
async def list_workouts(project_id: int, _: Owner, db: Db):
    return await svc.list_sessions(db, project_id)


@router.post("/workouts", response_model=WorkoutSessionOut, status_code=201)
async def create_workout(payload: WorkoutSessionCreate, _: Owner, db: Db):
    ws = await svc.create_session(db, payload.model_dump(exclude_unset=True))
    await db.commit()
    return await svc.get_session(db, ws.id)


@router.get("/workouts/{sid}", response_model=WorkoutSessionOut)
async def get_workout(sid: int, _: Owner, db: Db):
    ws = await svc.get_session(db, sid)
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found")
    return ws


@router.put("/workouts/{sid}/sets", response_model=WorkoutSessionOut)
async def replace_sets(sid: int, payload: SetsReplaceIn, _: Owner, db: Db):
    try:
        ws = await svc.replace_sets(db, sid, [s.model_dump() for s in payload.sets])
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found") from None
    await db.commit()
    return ws


@router.post("/workouts/{sid}/complete", response_model=WorkoutSessionOut)
async def complete_workout(sid: int, payload: WorkoutCompleteIn, bg: BackgroundTasks, _: Owner, db: Db):
    try:
        ws = await svc.complete_session(db, sid, payload.review_note, payload.duration_minutes)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found") from None
    await db.commit()
    out = await svc.get_session(db, sid)
    bg.add_task(coach.analyze_session, sid)
    return out


@router.delete("/workouts/{sid}", status_code=204)
async def cancel_workout(sid: int, _: Owner, db: Db):
    ok = await svc.cancel_session(db, sid)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found")
    await db.commit()


@router.get("/exercises/{exercise_id}/history", response_model=list[ExerciseHistoryPoint])
async def exercise_history(exercise_id: int, _: Owner, db: Db):
    return await svc.exercise_history(db, exercise_id)


@router.get("/exercises/{exercise_id}/last-sets")
async def exercise_last_sets(exercise_id: int, _: Owner, db: Db):
    return await svc.last_sets(db, exercise_id)


@router.patch("/template-exercises/{te_id}", status_code=204)
async def set_coach_target(te_id: int, payload: CoachTargetIn, _: Owner, db: Db):
    ok = await svc.set_coach_target(db, te_id, payload.weight)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template exercise not found")
    await db.commit()
