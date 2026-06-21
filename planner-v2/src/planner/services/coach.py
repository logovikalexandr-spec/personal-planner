"""Агент-тренер: LLM-разбор завершённой тренировки.
Триггерится после complete (BackgroundTasks). Health-рейлы вшиты в промпт.
Без anthropic_api_key → детерминированный фолбэк-текст (LLM не зовётся).
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

import httpx
from sqlalchemy import select

from planner.bot.utils import notify_owner
from planner.config import get_settings
from planner.db.models import Project, TemplateExercise
from planner.db.session import get_session
from planner.services import workouts as svc

HEALTH_RAILS = (
    "ЖЁСТКИЕ ОГРАНИЧЕНИЯ (нарушать НЕЛЬЗЯ): гипертонус диафрагмы/таза — "
    "никакой флексии пресса (скручивания/подъём ног в висе), кор только анти-экстензия, "
    "без экстрим-натуживания, велик-кардио избегать в острые фазы. "
    "Ты тренер, не врач: боль/red flags → советуй к врачу, не продавливай."
)
PROGRAM_CONTEXT = (
    "Цель: рекомпозиция 90д (сильнее + мощная фигура; строим спину/дельты/верх груди, сушим талию). "
    "Сплит Верх/Низ x2, двойная прогрессия. Дефицит ~-10-15%, белок ~155 г, шаги 8-10k. "
    "Пиши по-русски, без жаргона (без RPE/RIR/1ПМ), кратко."
)


@asynccontextmanager
async def _session_scope():
    async for s in get_session():
        yield s
        return


async def _summary(session, sid: int) -> dict:
    ws = await svc.get_session(session, sid)
    items = [{"exercise_id": s.exercise_id, "weight": s.weight, "reps": s.reps,
              "rpe": s.rpe, "is_warmup": s.is_warmup, "note": s.note} for s in ws.sets]
    return {"date": str(ws.date), "review": ws.review_note, "sets": items}


def build_prompt(session_summary: dict) -> str:
    return (
        f"{PROGRAM_CONTEXT}\n{HEALTH_RAILS}\n\n"
        f"Данные тренировки (JSON):\n{json.dumps(session_summary, ensure_ascii=False)}\n\n"
        "Дай краткий разбор (3-5 предложений): что хорошо, где прогресс, "
        "1-2 конкретные правки на след. тренировку. Без воды."
    )


async def call_llm(prompt: str) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "Тренировка учтена. (Разбор тренера выключен — не задан ключ.)"
    async with httpx.AsyncClient(timeout=60) as cli:
        r = await cli.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key,
                     "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": settings.coach_model, "max_tokens": 600,
                  "messages": [{"role": "user", "content": prompt}]},
        )
        r.raise_for_status()
        data = r.json()
        return "".join(b.get("text", "") for b in data.get("content", []))


async def _apply_progression(session, sid: int) -> None:
    """Q7: тренер сам ставит coach_target_weight на упражнения шаблона по правилу прогрессии."""
    ws = await svc.get_session(session, sid)
    if ws.template_id is None:
        return
    by_ex: dict[int, list[dict]] = {}
    for s in ws.sets:
        if s.is_warmup:
            continue
        by_ex.setdefault(s.exercise_id, []).append({"weight": s.weight, "reps": s.reps, "rpe": s.rpe})
    tes = (await session.execute(
        select(TemplateExercise).where(TemplateExercise.template_id == ws.template_id))).scalars().all()
    for te in tes:
        sets = by_ex.get(te.exercise_id)
        if not sets:
            continue
        prog = svc.suggest_progression(sets, te.rep_low, te.rep_high)
        if prog["action"] in ("up", "down"):
            last_w = max(s["weight"] for s in sets)
            te.coach_target_weight = round(last_w + prog["delta"], 2)
    await session.flush()


async def analyze_session(sid: int) -> None:
    async with _session_scope() as session:
        summary = await _summary(session, sid)
        text = await call_llm(build_prompt(summary))
        ws = await svc.get_session(session, sid)
        if ws is None:
            return
        ws.coach_note = text
        await _apply_progression(session, sid)
        proj = await session.get(Project, ws.project_id)
        if proj is not None:
            notes = list(proj.ai_notes or [])
            notes.append({"date": str(ws.date), "type": "info", "text": text[:500]})
            proj.ai_notes = notes
        await session.commit()
        await notify_owner(f"🏋️ Разбор тренировки {ws.date}:\n{text}")
