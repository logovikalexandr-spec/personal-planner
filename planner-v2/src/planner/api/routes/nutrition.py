from __future__ import annotations

from datetime import date as date_cls
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import (
    DayOut,
    DaySummaryOut,
    MealOut,
    MealStatusIn,
    MealUpdateIn,
    NutritionTargetOut,
)
from planner.services import nutrition as svc

router = APIRouter(prefix="/api")
Owner = Annotated[TelegramUser, Depends(require_owner)]
Db = Annotated[AsyncSession, Depends(get_db)]

_ZERO_TARGET = NutritionTargetOut(kcal=0, protein=0, fat=0, carb=0)


@router.get("/projects/{project_id}/nutrition/target", response_model=NutritionTargetOut)
async def get_target(project_id: int, _: Owner, db: Db):
    t = await svc.get_target(db, project_id)
    return t if t is not None else _ZERO_TARGET


@router.get("/projects/{project_id}/nutrition/day/{day}", response_model=DayOut)
async def get_day(project_id: int, day: date_cls, _: Owner, db: Db):
    meals = await svc.get_day_meals(db, project_id, day)
    await db.commit()
    t = await svc.get_target(db, project_id)
    return DayOut(
        date=day,
        target=t if t is not None else _ZERO_TARGET,
        meals=[MealOut.model_validate(m) for m in meals],
    )


@router.get("/projects/{project_id}/nutrition/week/{monday}", response_model=list[DaySummaryOut])
async def get_week(project_id: int, monday: date_cls, _: Owner, db: Db):
    return await svc.week_summary(db, project_id, monday)


@router.patch("/meals/{meal_id}/status", response_model=MealOut)
async def set_status(meal_id: int, payload: MealStatusIn, _: Owner, db: Db):
    m = await svc.set_meal_status(db, meal_id, payload.status)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meal not found")
    await db.commit()
    return m


@router.patch("/meals/{meal_id}", response_model=MealOut)
async def update_meal(meal_id: int, payload: MealUpdateIn, _: Owner, db: Db):
    m = await svc.update_meal(db, meal_id, payload.model_dump(exclude_unset=True))
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meal not found")
    await db.commit()
    return m
