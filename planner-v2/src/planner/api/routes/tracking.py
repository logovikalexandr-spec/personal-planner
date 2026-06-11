from datetime import date as date_cls
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import (
    HabitCreate,
    HabitEntryIn,
    HabitOut,
    HabitPatch,
    MetricCreate,
    MetricEntryOut,
    MetricMeasureIn,
    MetricOut,
)
from planner.services import tracking as svc

router = APIRouter(prefix="/api")
Owner = Annotated[TelegramUser, Depends(require_owner)]
Db = Annotated[AsyncSession, Depends(get_db)]


async def _habit_out(db: AsyncSession, h, on: date_cls) -> HabitOut:
    week_start = on - timedelta(days=on.weekday())  # понедельник
    window = await svc.entries_map(db, h.id, week_start, week_start + timedelta(days=6))
    week, heat7 = [], []
    for i in range(7):
        d = week_start + timedelta(days=i)
        v = window.get(d, 0.0)
        week.append(svc.habit_is_done(h.mark_type, v, h.target))
        heat7.append(svc.habit_heat_level(h.mark_type, v, h.target))
    today_v = window.get(on, 0.0)
    streak = await svc.compute_streak(db, h, on)
    return HabitOut(
        id=h.id, name=h.name, color=h.color, mark_type=h.mark_type, target=h.target,
        unit=h.unit, step=h.step, schedule_kind=h.schedule_kind, schedule_n=h.schedule_n,
        schedule_days=h.schedule_days, goal_date=h.goal_date, goal_total=h.goal_total,
        record_streak=h.record_streak, archived=h.archived, order_index=h.order_index,
        today_value=today_v, done_today=svc.habit_is_done(h.mark_type, today_v, h.target),
        streak=streak, week=week, heat7=heat7,
    )


# ── привычки ──────────────────────────────────────────────────────────────── #
@router.get("/habits", response_model=list[HabitOut])
async def list_habits(_: Owner, db: Db, on: date_cls = Query(default_factory=date_cls.today)):
    habits = await svc.list_habits(db)
    return [await _habit_out(db, h, on) for h in habits]


@router.post("/habits", response_model=HabitOut, status_code=201)
async def create_habit(payload: HabitCreate, _: Owner, db: Db):
    h = await svc.create_habit(db, payload.model_dump(exclude_unset=True))
    await db.commit()
    return await _habit_out(db, h, date_cls.today())


@router.patch("/habits/{habit_id}", response_model=HabitOut)
async def patch_habit(habit_id: int, payload: HabitPatch, _: Owner, db: Db):
    h = await svc.update_habit(db, habit_id, payload.model_dump(exclude_unset=True))
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "habit not found")
    await db.commit()
    return await _habit_out(db, h, date_cls.today())


@router.delete("/habits/{habit_id}", status_code=204)
async def delete_habit(habit_id: int, _: Owner, db: Db):
    if not await svc.delete_habit(db, habit_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "habit not found")
    await db.commit()


@router.post("/habits/{habit_id}/toggle", response_model=HabitOut)
async def toggle_habit(habit_id: int, payload: HabitEntryIn, _: Owner, db: Db):
    h = await svc.get_habit(db, habit_id)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "habit not found")
    await svc.toggle_habit(db, habit_id, payload.date)
    await db.commit()
    return await _habit_out(db, h, payload.date)


@router.post("/habits/{habit_id}/add", response_model=HabitOut)
async def add_habit(habit_id: int, payload: HabitEntryIn, _: Owner, db: Db):
    h = await svc.get_habit(db, habit_id)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "habit not found")
    await svc.add_habit_value(db, habit_id, payload.date, payload.delta or 0)
    await db.commit()
    return await _habit_out(db, h, payload.date)


@router.post("/habits/{habit_id}/backfill", response_model=HabitOut)
async def backfill_habit(habit_id: int, payload: HabitEntryIn, _: Owner, db: Db):
    h = await svc.get_habit(db, habit_id)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "habit not found")
    await svc.set_habit_value(db, habit_id, payload.date, payload.value or 0)
    await db.commit()
    return await _habit_out(db, h, payload.date)


# ── метрики ───────────────────────────────────────────────────────────────── #
async def _metric_out(db: AsyncSession, m) -> MetricOut:
    entries = await svc.list_metric_entries(db, m.id, limit=30)  # desc по дате
    latest = entries[0].value if entries else None
    delta = (entries[0].value - entries[1].value) if len(entries) >= 2 else None
    return MetricOut(
        id=m.id, name=m.name, unit=m.unit, good_direction=m.good_direction, color=m.color,
        archived=m.archived, order_index=m.order_index, latest=latest, delta=delta,
        entries=[MetricEntryOut.model_validate(e) for e in entries],
    )


@router.get("/metrics", response_model=list[MetricOut])
async def list_metrics(_: Owner, db: Db):
    return [await _metric_out(db, m) for m in await svc.list_metrics(db)]


@router.post("/metrics", response_model=MetricOut, status_code=201)
async def create_metric(payload: MetricCreate, _: Owner, db: Db):
    m = await svc.create_metric(db, payload.model_dump(exclude_unset=True))
    await db.commit()
    return await _metric_out(db, m)


@router.delete("/metrics/{metric_id}", status_code=204)
async def delete_metric(metric_id: int, _: Owner, db: Db):
    if not await svc.delete_metric(db, metric_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "metric not found")
    await db.commit()


@router.post("/metrics/{metric_id}/measure", response_model=MetricOut)
async def measure_metric(metric_id: int, payload: MetricMeasureIn, _: Owner, db: Db):
    m = await db.get(svc.Metric, metric_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "metric not found")
    await svc.set_metric_value(db, metric_id, payload.date, payload.value)
    await db.commit()
    await db.refresh(m)
    return await _metric_out(db, m)


# ── ретро ─────────────────────────────────────────────────────────────────── #
@router.get("/tracking/retro")
async def retro(_: Owner, db: Db, week_start: date_cls = Query(...)):
    return await svc.week_retro(db, week_start)
