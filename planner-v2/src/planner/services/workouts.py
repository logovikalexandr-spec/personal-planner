"""Workout-лог: CRUD + детерминированная прогрессия + 1ПМ/рекорд.
Прогрессия — чистые функции (без БД, без LLM). Суждение/правки — services/coach.py.
"""
from __future__ import annotations

from datetime import date as date_cls

from sqlalchemy import select

from planner.db.models import (
    Exercise,
    SetLog,
    Stage,
    TemplateExercise,
    WorkoutSession,
    WorkoutTemplate,
)

# ── чистые функции ──────────────────────────────────────────────────────────

def epley_1rm(weight: float, reps: int) -> float:
    if reps <= 1:
        return float(weight)
    return weight * (1 + reps / 30)


def is_pr(candidate_1rm: float, prev_best_1rm: float | None) -> bool:
    if prev_best_1rm is None:
        return candidate_1rm > 0
    return candidate_1rm > prev_best_1rm


def suggest_progression(working_sets: list[dict], rep_low: int, rep_high: int) -> dict:
    """Двойная прогрессия + авторегуляция по RPE.
    UP: все рабочие подходы достигли rep_high И (rpe нет ИЛИ rpe<=8).
    DOWN: какой-то подход ниже rep_low.
    HOLD: иначе.
    """
    if not working_sets:
        return {"action": "hold", "delta": 0.0, "reason": "нет данных"}
    reps = [s["reps"] for s in working_sets]
    rpes = [s.get("rpe") for s in working_sets]
    all_top = all(r >= rep_high for r in reps)
    rpe_ok = all(rp is None or rp <= 8 for rp in rpes)
    any_below_low = any(r < rep_low for r in reps)
    if all_top and rpe_ok:
        return {"action": "up", "delta": 2.5, "reason": f"добил {rep_high} во всех подходах"}
    if any_below_low:
        return {"action": "down", "delta": -2.5, "reason": f"повторы упали ниже {rep_low}"}
    return {"action": "hold", "delta": 0.0, "reason": "держим вес, тянем повторы"}


# ── CRUD ────────────────────────────────────────────────────────────────────

_EX_FIELDS = {"name", "muscle_group", "equipment", "is_custom", "default_rep_low",
              "default_rep_high", "notes", "order_index", "archived"}
_SESSION_FIELDS = {"project_id", "template_id", "stage_id", "date", "review_note",
                   "coach_note", "duration_minutes", "completed"}


async def list_exercises(session, include_archived: bool = False) -> list[Exercise]:
    q = select(Exercise).order_by(Exercise.order_index, Exercise.id)
    if not include_archived:
        q = q.where(Exercise.archived.is_(False))
    return list((await session.execute(q)).scalars().all())


async def create_exercise(session, data: dict) -> Exercise:
    ex = Exercise(**{k: v for k, v in data.items() if k in _EX_FIELDS})
    session.add(ex)
    await session.flush()
    return ex


async def list_templates(session, project_id: int) -> list[WorkoutTemplate]:
    q = (select(WorkoutTemplate)
         .where(WorkoutTemplate.project_id == project_id)
         .order_by(WorkoutTemplate.order_index))
    return list((await session.execute(q)).scalars().all())


async def current_stage_id(session, project_id: int, on: date_cls) -> int | None:
    q = (select(Stage.id)
         .where(Stage.project_id == project_id, Stage.start_date <= on, Stage.end_date >= on)
         .order_by(Stage.order_index).limit(1))
    return (await session.execute(q)).scalar_one_or_none()


async def create_session(session, data: dict) -> WorkoutSession:
    fields = {k: v for k, v in data.items() if k in _SESSION_FIELDS}
    if fields.get("stage_id") is None and fields.get("project_id") and fields.get("date"):
        fields["stage_id"] = await current_stage_id(session, fields["project_id"], fields["date"])
    ws = WorkoutSession(**fields)
    session.add(ws)
    await session.flush()
    return ws


async def get_session(session, sid: int) -> WorkoutSession | None:
    # select (а не .get) → relationship sets грузится selectin'ом в async-контексте
    q = select(WorkoutSession).where(WorkoutSession.id == sid)
    return (await session.execute(q)).scalar_one_or_none()


async def replace_sets(session, sid: int, sets: list[dict]) -> WorkoutSession:
    from sqlalchemy import delete as _delete
    exists = (await session.execute(
        select(WorkoutSession.id).where(WorkoutSession.id == sid))).scalar_one_or_none()
    if exists is None:
        raise ValueError("session not found")
    await session.execute(_delete(SetLog).where(SetLog.session_id == sid))
    for i, s in enumerate(sets):
        session.add(SetLog(
            session_id=sid, exercise_id=s["exercise_id"], set_index=s.get("set_index", i),
            weight=s.get("weight", 0), reps=s.get("reps", 0), rpe=s.get("rpe"),
            is_warmup=s.get("is_warmup", False), done=s.get("done", False), note=s.get("note"),
        ))
    await session.flush()
    return await get_session(session, sid)


async def complete_session(session, sid: int, review_note: str | None,
                           duration_minutes: int | None) -> WorkoutSession:
    ws = await session.get(WorkoutSession, sid)
    if ws is None:
        raise ValueError("session not found")
    ws.completed = True
    if review_note is not None:
        ws.review_note = review_note
    if duration_minutes is not None:
        ws.duration_minutes = duration_minutes
    await session.flush()
    return ws


async def cancel_session(session, sid: int) -> bool:
    ws = await session.get(WorkoutSession, sid)
    if ws is None:
        return False
    await session.delete(ws)
    await session.flush()
    return True


async def last_sets(session, exercise_id: int) -> list[dict]:
    """Рабочие подходы из последней завершённой сессии с этим упражнением (для авто-подстановки)."""
    q = (select(SetLog, WorkoutSession.date)
         .join(WorkoutSession, SetLog.session_id == WorkoutSession.id)
         .where(SetLog.exercise_id == exercise_id, SetLog.is_warmup.is_(False))
         .order_by(WorkoutSession.date.desc(), SetLog.set_index))
    rows = (await session.execute(q)).all()
    if not rows:
        return []
    last_date = rows[0][1]
    return [{"weight": sl.weight, "reps": sl.reps, "rpe": sl.rpe}
            for sl, d in rows if d == last_date]


async def exercise_history(session, exercise_id: int, limit: int = 30) -> list[dict]:
    q = (select(SetLog, WorkoutSession.date)
         .join(WorkoutSession, SetLog.session_id == WorkoutSession.id)
         .where(SetLog.exercise_id == exercise_id, SetLog.is_warmup.is_(False))
         .order_by(WorkoutSession.date.desc()))
    rows = (await session.execute(q)).all()
    by_date: dict = {}
    for sl, d in rows:
        b = by_date.setdefault(d, {"date": d, "top_1rm": 0.0,
                                   "best_set": {"weight": 0, "reps": 0}, "total_volume": 0.0})
        one = epley_1rm(sl.weight, sl.reps)
        if one > b["top_1rm"]:
            b["top_1rm"] = one
            b["best_set"] = {"weight": sl.weight, "reps": sl.reps}
        b["total_volume"] += sl.weight * sl.reps
    return list(by_date.values())[:limit]


async def list_sessions(session, project_id: int) -> list[WorkoutSession]:
    q = (select(WorkoutSession)
         .where(WorkoutSession.project_id == project_id)
         .order_by(WorkoutSession.date.desc()))
    return list((await session.execute(q)).scalars().all())


async def set_coach_target(session, template_exercise_id: int, weight: float | None) -> bool:
    te = await session.get(TemplateExercise, template_exercise_id)
    if te is None:
        return False
    te.coach_target_weight = weight
    await session.flush()
    return True
