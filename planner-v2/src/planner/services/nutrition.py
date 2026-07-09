"""Питание: цель/шаблон-день/лог-день + ручной add/edit/delete + LLM-парс текста в БЖУ.
День засевается из шаблона приёмов при первом открытии даты.
"""
from __future__ import annotations

import json
from datetime import date as date_cls
from datetime import timedelta

import httpx
from sqlalchemy import func, select

from planner.config import get_settings
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


async def add_meal(session, project_id: int, day: date_cls, data: dict) -> MealLog:
    """Добавить произвольный приём в конец дня (съел не из шаблона)."""
    q = (select(func.coalesce(func.max(MealLog.order_index), -1))
         .where(MealLog.project_id == project_id, MealLog.date == day))
    max_idx = (await session.execute(q)).scalar_one()
    m = MealLog(
        project_id=project_id, date=day, order_index=int(max_idx) + 1,
        time=data.get("time"), name=data["name"], status=data.get("status", "done"),
        kcal=data.get("kcal", 0), protein=data.get("protein", 0),
        fat=data.get("fat", 0), carb=data.get("carb", 0), items=list(data.get("items") or []),
    )
    session.add(m)
    await session.flush()
    return m


async def delete_meal(session, meal_id: int) -> bool:
    m = await session.get(MealLog, meal_id)
    if m is None:
        return False
    await session.delete(m)
    await session.flush()
    return True


async def set_target(session, project_id: int, data: dict) -> NutritionTarget:
    """Upsert цели БЖУ/ккал по проекту."""
    t = await get_target(session, project_id)
    if t is None:
        t = NutritionTarget(project_id=project_id)
        session.add(t)
    for k in ("kcal", "protein", "fat", "carb"):
        if k in data and data[k] is not None:
            setattr(t, k, data[k])
    await session.flush()
    return t


_PARSE_PROMPT = (
    "Ты нутрициолог. Оцени пищевую ценность съеденного по описанию. "
    "Прикидывай по стандартным порциям, если граммы не заданы. Не занижай и не завышай нарочно.\n"
    "Ответь СТРОГО одним JSON-объектом без пояснений и без markdown-обёртки, ключи:\n"
    '{"name": "краткое имя приёма (напр. Курица с рисом)", "kcal": int, '
    '"protein": int, "fat": int, "carb": int, '
    '"items": [{"n": "продукт", "q": "кол-во (напр. 200 г)", "k": ккал_int}]}\n'
    "Все числа — целые, в граммах/ккал. items — разбивка по продуктам.\n\n"
    "Описание: "
)


def _empty_parse(text: str) -> dict:
    return {"name": text.strip()[:80] or "Приём", "kcal": 0, "protein": 0,
            "fat": 0, "carb": 0, "items": [], "estimated": False}


async def parse_food(text: str) -> dict:
    """Свободный текст → оценка БЖУ через Claude. Без ключа → фолбэк (estimated=False)."""
    settings = get_settings()
    if not settings.anthropic_api_key or not text.strip():
        return _empty_parse(text)
    try:
        async with httpx.AsyncClient(timeout=30) as cli:
            r = await cli.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key,
                         "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": settings.coach_model, "max_tokens": 500,
                      "messages": [{"role": "user", "content": _PARSE_PROMPT + text.strip()}]},
            )
            r.raise_for_status()
            raw = "".join(b.get("text", "") for b in r.json().get("content", []))
        parsed = _extract_json(raw)
    except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError):
        return _empty_parse(text)
    if parsed is None:
        return _empty_parse(text)
    return {
        "name": str(parsed.get("name") or text.strip()[:80] or "Приём")[:80],
        "kcal": _to_int(parsed.get("kcal")),
        "protein": _to_int(parsed.get("protein")),
        "fat": _to_int(parsed.get("fat")),
        "carb": _to_int(parsed.get("carb")),
        "items": parsed.get("items") if isinstance(parsed.get("items"), list) else [],
        "estimated": True,
    }


def _to_int(v) -> int:
    try:
        return max(round(float(v)), 0)
    except (TypeError, ValueError):
        return 0


def _extract_json(raw: str) -> dict | None:
    """Достаём первый JSON-объект из ответа (на случай обёртки/текста вокруг)."""
    s = raw.strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s[s.find("{"):] if "{" in s else s
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    obj = json.loads(s[start:end + 1])
    return obj if isinstance(obj, dict) else None
