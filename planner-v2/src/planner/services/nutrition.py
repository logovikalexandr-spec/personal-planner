"""Питание (скелет v1): цель/шаблон-день/лог-день. Без LLM.
День засевается из шаблона приёмов при первом открытии даты.
"""
from __future__ import annotations

from datetime import date as date_cls
from datetime import timedelta

from sqlalchemy import select

from planner.db.models import MealLog, MealTemplateItem, NutritionTarget


async def get_target(session, project_id: int) -> NutritionTarget | None:
    q = select(NutritionTarget).where(NutritionTarget.project_id == project_id)
    return (await session.execute(q)).scalar_one_or_none()


async def list_template(session, project_id: int) -> list[MealTemplateItem]:
    q = (select(MealTemplateItem)
         .where(MealTemplateItem.project_id == project_id)
         .order_by(MealTemplateItem.order_index))
    return list((await session.execute(q)).scalars().all())


async def get_day_meals(session, project_id: int, day: date_cls) -> list[MealLog]:
    """Лог приёмов за день. Если пусто — засеять из шаблона (status=planned)."""
    q = (select(MealLog)
         .where(MealLog.project_id == project_id, MealLog.date == day)
         .order_by(MealLog.order_index))
    meals = list((await session.execute(q)).scalars().all())
    if meals:
        return meals
    tpl = await list_template(session, project_id)
    for t in tpl:
        session.add(MealLog(
            project_id=project_id, date=day, order_index=t.order_index, time=t.time,
            name=t.name, status="planned", kcal=t.kcal, protein=t.protein,
            fat=t.fat, carb=t.carb, items=list(t.items or []),
        ))
    if tpl:
        await session.flush()
        meals = list((await session.execute(q)).scalars().all())
    return meals


async def week_summary(session, project_id: int, monday: date_cls) -> list[dict]:
    """Сводка по 7 дням недели (только уже существующие логи; будущие = пусто).
    Суммы по приёмам со статусом done; total/done = счётчики приёмов.
    """
    end = monday + timedelta(days=6)
    q = (select(MealLog)
         .where(MealLog.project_id == project_id, MealLog.date >= monday, MealLog.date <= end)
         .order_by(MealLog.date, MealLog.order_index))
    rows = list((await session.execute(q)).scalars().all())
    by_date: dict[date_cls, dict] = {}
    for m in rows:
        b = by_date.setdefault(m.date, {"date": m.date, "kcal": 0, "protein": 0,
                                        "fat": 0, "carb": 0, "done": 0, "total": 0})
        b["total"] += 1
        if m.status == "done":
            b["done"] += 1
            b["kcal"] += m.kcal
            b["protein"] += m.protein
            b["fat"] += m.fat
            b["carb"] += m.carb
    return [by_date[d] for d in sorted(by_date)]


async def set_meal_status(session, meal_id: int, status: str) -> MealLog | None:
    m = await session.get(MealLog, meal_id)
    if m is None:
        return None
    m.status = status
    await session.flush()
    return m


_MEAL_FIELDS = {"name", "kcal", "protein", "fat", "carb", "items"}


async def update_meal(session, meal_id: int, data: dict) -> MealLog | None:
    """Замена/правка приёма (ел не по плану). Проставляем done."""
    m = await session.get(MealLog, meal_id)
    if m is None:
        return None
    for k, v in data.items():
        if k in _MEAL_FIELDS and v is not None:
            setattr(m, k, v)
    m.status = "done"
    await session.flush()
    return m
