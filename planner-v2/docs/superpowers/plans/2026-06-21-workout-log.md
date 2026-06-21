# Workout-лог (подраздел Цели) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Журнал тренировок как подраздел внутри Цели «Recomp 90д» (project id=23): шаблоны сессий, лог подходов (вес×повт+RPE+заметки+ревью), детерминированная прогрессия в коде, авто-LLM-разбор тренера после каждой трени с пушем в Telegram, история упражнения + PR + график.

**Architecture:** 5 новых SQLAlchemy-сущностей (Exercise, WorkoutTemplate, TemplateExercise, WorkoutSession, SetLog) + Alembic-миграция + сид каталога/шаблонов из программы. FastAPI-роуты `/api/workouts*` по паттерну tracking.py. Детерминированная прогрессия = чистые функции в сервисе. LLM-тренер = новый модуль `services/coach.py` (Anthropic через httpx), триггерится через FastAPI `BackgroundTasks` после завершения сессии, пишет `coach_note` + `project.ai_notes` + двигает `success_probability`, может ставить `coach_target_weight` на TemplateExercise (Q7 автономия, откат = очистка), и шлёт пуш через новый `bot/utils.notify_owner`. Фронт: компонент `WorkoutLog` оверлеем из Goals.tsx (паттерн TaskDetail), сперва утверждается как preview-mock (правило planner «компонент=мокап»), потом проводка.

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy[asyncio] 2 · Alembic · PostgreSQL · aiogram 3 · httpx · Anthropic API · React 18 · Vite · TypeScript · custom SVG-чарт (без чарт-либ).

## Global Constraints

- **Язык:** UI/тексты — русский; код/идентификаторы — английский.
- **Стек только OSS/бесплатный**, кроме Anthropic API (явно разрешён, ZERO-AFK снят 2026-06-21).
- **Health-рейлы НЕПРИКОСНОВЕННЫ** (тренер не может их нарушить даже авто): нет флексии пресса (скручивания/подъём ног в висе), нет велик-кардио в острые фазы, кор только анти-экстензия, без экстрим-Вальсальвы. Источник: `personal-planner/тренер/программа.md` §0.
- **Emoji** — только иконка проекта/списка; хром/нав/семантика = SVG (`frontend/src/components/icons.tsx`).
- **Дизайн-токены** из `frontend/src/theme.css` (onyx #0F0F11, ember #ee8a3c, Geist). Никаких новых акцент-цветов, без круговых спиннеров (скелетоны), без emoji в семантике.
- **Мокап-fidelity-gate:** экран «готов» только когда деплой 1:1 совпал с утверждённым preview (визуал-проверка, НЕ bundle-hash).
- **weekday-индекс 0=Пн** (если где-то понадобится).
- **Прод:** `root@188.245.42.4:/root/planner-v2-src`. Деплой = rsync frontend → `docker compose -f docker-compose.prod.yml build && up -d`. Health: `curl https://planner.188.245.42.4.nip.io/api/health` → 200. БД-контейнер `planner-postgres` (user/db `planner`).
- **Тесты:** бэк `pytest` (in-memory sqlite, conftest уже есть); фронт `npm run build` + preview html. Каждая задача коммитится.

---

## File Structure

**Backend (создать/изменить):**
- Modify `src/planner/db/models.py` — +5 моделей в конце файла.
- Create `alembic/versions/<hex>_workout_log.py` — миграция 5 таблиц.
- Modify `src/planner/api/schemas.py` — +Pydantic схемы workout.
- Create `src/planner/services/workouts.py` — CRUD + чистая прогрессия + PR/1ПМ.
- Create `src/planner/services/coach.py` — LLM-разбор (Anthropic httpx).
- Create `src/planner/bot/utils.py` — `notify_owner`.
- Create `src/planner/api/routes/workouts.py` — роуты `/api/workouts*`, `/api/exercises*`, `/api/projects/{id}/workout-templates`.
- Modify `src/planner/api/app.py` — `app.include_router(workouts.router)`.
- Modify `src/planner/config.py` — `anthropic_api_key`, `coach_model`.
- Create `src/planner/db/seed_workout.py` — сид каталога+шаблонов из программы для project 23.
- Tests: `tests/test_workouts_progression.py`, `tests/test_workouts_api.py`, `tests/test_coach.py`.

**Frontend (создать/изменить):**
- Modify `frontend/src/types.ts` — типы Exercise/WorkoutTemplate/WorkoutSession/SetLog.
- Modify `frontend/src/api.ts` — вызовы workout API.
- Create `frontend/src/components/WorkoutLog.tsx` — корневой компонент подраздела (3 вида).
- Create `frontend/src/components/workout/SessionList.tsx`, `ActiveSession.tsx`, `ExerciseHistory.tsx`, `ProgressChart.tsx`.
- Modify `frontend/src/components/icons.tsx` — `IcoDumbbell` и пр.
- Create `frontend/src/preview-workout-log-mock.tsx` — preview с мок-данными (gate).
- Modify `frontend/src/screens/Goals.tsx` — оверлей WorkoutLog по выбору цели.

---

# WAVE A — Backend data layer

### Task A1: Модели Exercise/WorkoutTemplate/TemplateExercise/WorkoutSession/SetLog

**Files:**
- Modify: `src/planner/db/models.py` (добавить в конец)
- Test: `tests/test_workouts_progression.py` (создание схемы проверится в A2; здесь smoke import)

**Interfaces:**
- Produces: ORM-классы `Exercise, WorkoutTemplate, TemplateExercise, WorkoutSession, SetLog` со связями.

- [ ] **Step 1: Написать модели**

В конец `src/planner/db/models.py` (импорты `Time` добавить в существующий `from sqlalchemy import ...`, если нет):

```python
class Exercise(Base):
    __tablename__ = "exercise"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    muscle_group: Mapped[str] = mapped_column(String(40), default="other")
    equipment: Mapped[str | None] = mapped_column(String(40), default=None)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    default_rep_low: Mapped[int | None] = mapped_column(Integer, default=None)
    default_rep_high: Mapped[int | None] = mapped_column(Integer, default=None)
    notes: Mapped[str | None] = mapped_column(String(300), default=None)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkoutTemplate(Base):
    __tablename__ = "workout_template"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercises: Mapped[list["TemplateExercise"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", lazy="selectin",
        order_by="TemplateExercise.order_index",
    )


class TemplateExercise(Base):
    __tablename__ = "template_exercise"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("workout_template.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    rep_low: Mapped[int] = mapped_column(Integer, default=8)
    rep_high: Mapped[int] = mapped_column(Integer, default=12)
    coach_target_weight: Mapped[float | None] = mapped_column(Float, default=None)  # Q7: тренер ставит, откат=NULL

    template: Mapped["WorkoutTemplate"] = relationship(back_populates="exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("workout_template.id", ondelete="SET NULL"), default=None)
    stage_id: Mapped[int | None] = mapped_column(ForeignKey("stage.id", ondelete="SET NULL"), default=None)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    review_note: Mapped[str | None] = mapped_column(String(2000), default=None)
    coach_note: Mapped[str | None] = mapped_column(String(4000), default=None)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sets: Mapped[list["SetLog"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", lazy="selectin",
        order_by="SetLog.set_index",
    )


class SetLog(Base):
    __tablename__ = "set_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_session.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"), nullable=False)
    set_index: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[float] = mapped_column(Float, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    rpe: Mapped[float | None] = mapped_column(Float, default=None)
    is_warmup: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(String(300), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["WorkoutSession"] = relationship(back_populates="sets")
```

- [ ] **Step 2: Smoke-тест что модели импортируются и схема строится**

Создать `tests/test_workouts_progression.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_workout_tables_created(db_engine):
    # db_engine fixture создаёт все таблицы из Base.metadata
    from planner.db.models import Exercise, WorkoutTemplate, TemplateExercise, WorkoutSession, SetLog
    names = {Exercise.__tablename__, WorkoutTemplate.__tablename__,
             TemplateExercise.__tablename__, WorkoutSession.__tablename__, SetLog.__tablename__}
    assert names == {"exercise", "workout_template", "template_exercise", "workout_session", "set_log"}
```

- [ ] **Step 3: Запустить тест**

Run: `cd /Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2 && pytest tests/test_workouts_progression.py::test_workout_tables_created -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/planner/db/models.py tests/test_workouts_progression.py
git commit -m "feat(workout): ORM models exercise/template/session/setlog"
```

---

### Task A2: Alembic-миграция 5 таблиц

**Files:**
- Create: `alembic/versions/<hex>_workout_log.py`

**Interfaces:**
- Consumes: модели из A1 (для autogenerate).
- Produces: миграция `workout_log`, down_revision = текущий head (`b9c0d1e2f3a4`).

- [ ] **Step 1: Сгенерировать миграцию автогеном**

Run: `cd /Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2 && alembic revision --autogenerate -m "workout_log"`
Expected: новый файл в `alembic/versions/`. Открыть и проверить, что в `upgrade()` создаются 5 таблиц (exercise, workout_template, template_exercise, workout_session, set_log) с FK, в `downgrade()` — drop в обратном порядке.

- [ ] **Step 2: Проверить down_revision**

Убедиться `down_revision = "b9c0d1e2f3a4"` (последний head). Если autogenerate не подцепил — поправить вручную.

- [ ] **Step 3: Применить миграцию локально и откатить (проверка обратимости)**

Run:
```bash
alembic upgrade head && alembic downgrade -1 && alembic upgrade head
```
Expected: без ошибок, таблицы создаются/удаляются/создаются.

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/
git commit -m "feat(workout): alembic migration for workout tables"
```

---

### Task A3: Чистая прогрессия + 1ПМ + PR (без БД)

**Files:**
- Create: `src/planner/services/workouts.py` (только чистые функции на этом шаге)
- Test: `tests/test_workouts_progression.py` (дополнить)

**Interfaces:**
- Produces:
  - `epley_1rm(weight: float, reps: int) -> float`
  - `suggest_progression(working_sets: list[dict], rep_low: int, rep_high: int) -> dict` → `{"action": "up"|"hold"|"down", "delta": float, "reason": str}`. `working_sets` = `[{"weight","reps","rpe"}]` последней сессии (без разминки).
  - `is_pr(candidate_1rm: float, prev_best_1rm: float | None) -> bool`

- [ ] **Step 1: Написать failing-тесты**

Дополнить `tests/test_workouts_progression.py`:

```python
from planner.services.workouts import epley_1rm, suggest_progression, is_pr


def test_epley_1rm():
    assert round(epley_1rm(100, 1), 1) == 100.0
    assert round(epley_1rm(75, 8), 1) == 95.0  # 75*(1+8/30)


def test_progression_up_when_all_hit_top_and_rpe_ok():
    sets = [{"weight": 50, "reps": 12, "rpe": 7}, {"weight": 50, "reps": 12, "rpe": 8}, {"weight": 50, "reps": 12, "rpe": 8}]
    out = suggest_progression(sets, rep_low=8, rep_high=12)
    assert out["action"] == "up"
    assert out["delta"] >= 2.5


def test_progression_hold_when_rpe_too_high():
    sets = [{"weight": 50, "reps": 12, "rpe": 10}, {"weight": 50, "reps": 12, "rpe": 10}]
    assert suggest_progression(sets, 8, 12)["action"] == "hold"


def test_progression_hold_when_below_top():
    sets = [{"weight": 50, "reps": 9, "rpe": 8}, {"weight": 50, "reps": 8, "rpe": 8}]
    assert suggest_progression(sets, 8, 12)["action"] == "hold"


def test_progression_down_when_reps_below_low():
    sets = [{"weight": 50, "reps": 6, "rpe": 10}, {"weight": 50, "reps": 5, "rpe": 10}]
    assert suggest_progression(sets, 8, 12)["action"] == "down"


def test_progression_up_when_rpe_missing():
    sets = [{"weight": 20, "reps": 15, "rpe": None}] * 3
    assert suggest_progression(sets, 12, 15)["action"] == "up"


def test_is_pr():
    assert is_pr(96.0, 95.0) is True
    assert is_pr(95.0, 95.0) is False
    assert is_pr(50.0, None) is True
```

- [ ] **Step 2: Запустить — должно упасть (нет модуля функций)**

Run: `pytest tests/test_workouts_progression.py -v`
Expected: FAIL (ImportError / not defined)

- [ ] **Step 3: Реализовать функции**

В `src/planner/services/workouts.py` (начало файла):

```python
"""Workout-лог: CRUD + детерминированная прогрессия + 1ПМ/PR.
Прогрессия — чистые функции (без БД, без LLM). Суждение/правки — services/coach.py.
"""
from datetime import date as date_cls

from sqlalchemy import select
from planner.db.models import (
    Exercise, WorkoutTemplate, TemplateExercise, WorkoutSession, SetLog,
)


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
    DOWN: какой-то подход ниже rep_low (с тяжёлым rpe).
    HOLD: иначе.
    delta: 2.5 база по умолчанию (изоляции тренер уточнит в coach).
    """
    if not working_sets:
        return {"action": "hold", "delta": 0.0, "reason": "нет данных"}
    reps = [s["reps"] for s in working_sets]
    rpes = [s.get("rpe") for s in working_sets]
    all_top = all(r >= rep_high for r in reps)
    rpe_ok = all(rp is None or rp <= 8 for rp in rpes)
    any_below_low = any(r < rep_low for r in reps)
    if all_top and rpe_ok:
        return {"action": "up", "delta": 2.5, "reason": f"добил {rep_high} во всех подходах при RPE≤8"}
    if any_below_low:
        return {"action": "down", "delta": -2.5, "reason": f"повторы упали ниже {rep_low}"}
    return {"action": "hold", "delta": 0.0, "reason": "держим вес, тянем повторы"}
```

- [ ] **Step 4: Запустить — PASS**

Run: `pytest tests/test_workouts_progression.py -v`
Expected: PASS (все)

- [ ] **Step 5: Commit**

```bash
git add src/planner/services/workouts.py tests/test_workouts_progression.py
git commit -m "feat(workout): deterministic progression + 1rm + pr (pure fns)"
```

---

### Task A4: CRUD-сервис workout (БД)

**Files:**
- Modify: `src/planner/services/workouts.py`
- Test: `tests/test_workouts_api.py` (создать, тестируем через сервис напрямую сначала)

**Interfaces:**
- Produces (async, принимают `session`):
  - `list_exercises(session) -> list[Exercise]`
  - `create_exercise(session, data: dict) -> Exercise`
  - `list_templates(session, project_id: int) -> list[WorkoutTemplate]`
  - `create_session(session, data: dict) -> WorkoutSession`
  - `get_session(session, sid: int) -> WorkoutSession | None`
  - `replace_sets(session, sid: int, sets: list[dict]) -> WorkoutSession` (полная замена подходов сессии)
  - `complete_session(session, sid: int, review_note: str | None, duration_minutes: int | None) -> WorkoutSession`
  - `exercise_history(session, exercise_id: int, limit: int = 30) -> list[dict]` → `[{date, top_1rm, best_set:{weight,reps}, total_volume}]` по сессиям
  - `current_stage_id(session, project_id: int, on: date) -> int | None` (по дате в окне stage.start_date..end_date)

- [ ] **Step 1: Написать failing-тесты сервиса**

Создать `tests/test_workouts_api.py`:

```python
import pytest
from datetime import date
from planner.services import workouts as svc


@pytest.mark.asyncio
async def test_exercise_and_session_flow(db_session):
    ex = await svc.create_exercise(db_session, {"name": "Жим лёжа", "muscle_group": "chest"})
    await db_session.commit()
    assert ex.id

    ws = await svc.create_session(db_session, {"project_id": 1, "date": date(2026, 6, 22)})
    await db_session.commit()
    ws = await svc.replace_sets(db_session, ws.id, [
        {"exercise_id": ex.id, "set_index": 0, "weight": 75, "reps": 8, "rpe": 8},
        {"exercise_id": ex.id, "set_index": 1, "weight": 75, "reps": 6, "rpe": 9},
    ])
    await db_session.commit()
    assert len(ws.sets) == 2

    hist = await svc.exercise_history(db_session, ex.id)
    assert hist[0]["best_set"]["weight"] == 75
    assert hist[0]["top_1rm"] > 75
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pytest tests/test_workouts_api.py::test_exercise_and_session_flow -v`
Expected: FAIL (нет функций)

- [ ] **Step 3: Реализовать CRUD-сервис**

Дополнить `src/planner/services/workouts.py`:

```python
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
    q = select(WorkoutTemplate).where(WorkoutTemplate.project_id == project_id).order_by(WorkoutTemplate.order_index)
    return list((await session.execute(q)).scalars().all())


async def current_stage_id(session, project_id: int, on: date_cls) -> int | None:
    from planner.db.models import Stage
    q = select(Stage.id).where(
        Stage.project_id == project_id,
        Stage.start_date <= on,
        Stage.end_date >= on,
    ).order_by(Stage.order_index).limit(1)
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
    return await session.get(WorkoutSession, sid)


async def replace_sets(session, sid: int, sets: list[dict]) -> WorkoutSession:
    ws = await session.get(WorkoutSession, sid)
    if ws is None:
        raise ValueError("session not found")
    for s in list(ws.sets):
        await session.delete(s)
    await session.flush()
    for i, s in enumerate(sets):
        session.add(SetLog(
            session_id=sid, exercise_id=s["exercise_id"], set_index=s.get("set_index", i),
            weight=s.get("weight", 0), reps=s.get("reps", 0), rpe=s.get("rpe"),
            is_warmup=s.get("is_warmup", False), note=s.get("note"),
        ))
    await session.flush()
    await session.refresh(ws)
    return ws


async def complete_session(session, sid: int, review_note: str | None, duration_minutes: int | None) -> WorkoutSession:
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


async def exercise_history(session, exercise_id: int, limit: int = 30) -> list[dict]:
    q = (select(SetLog, WorkoutSession.date)
         .join(WorkoutSession, SetLog.session_id == WorkoutSession.id)
         .where(SetLog.exercise_id == exercise_id, SetLog.is_warmup.is_(False))
         .order_by(WorkoutSession.date.desc()))
    rows = (await session.execute(q)).all()
    by_date: dict = {}
    for sl, d in rows:
        b = by_date.setdefault(d, {"date": d, "top_1rm": 0.0, "best_set": {"weight": 0, "reps": 0}, "total_volume": 0.0})
        one = epley_1rm(sl.weight, sl.reps)
        if one > b["top_1rm"]:
            b["top_1rm"] = one
            b["best_set"] = {"weight": sl.weight, "reps": sl.reps}
        b["total_volume"] += sl.weight * sl.reps
    return list(by_date.values())[:limit]
```

- [ ] **Step 4: Запустить — PASS**

Run: `pytest tests/test_workouts_api.py::test_exercise_and_session_flow -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/planner/services/workouts.py tests/test_workouts_api.py
git commit -m "feat(workout): db crud service (exercises/sessions/sets/history)"
```

---

# WAVE B — Backend API + seed

### Task B1: Pydantic-схемы workout

**Files:**
- Modify: `src/planner/api/schemas.py` (добавить в конец)

**Interfaces:**
- Produces: `ExerciseOut, ExerciseCreate, TemplateOut, TemplateExerciseOut, SetIn, SetOut, WorkoutSessionCreate, WorkoutSessionOut, WorkoutCompleteIn, ProgressionOut, ExerciseHistoryPoint`.

- [ ] **Step 1: Добавить схемы**

```python
class ExerciseCreate(BaseModel):
    name: str
    muscle_group: str = "other"
    equipment: str | None = None
    is_custom: bool = True
    default_rep_low: int | None = None
    default_rep_high: int | None = None

class ExerciseOut(BaseModel):
    id: int
    name: str
    muscle_group: str
    equipment: str | None = None
    is_custom: bool
    default_rep_low: int | None = None
    default_rep_high: int | None = None
    order_index: int
    model_config = {"from_attributes": True}

class TemplateExerciseOut(BaseModel):
    id: int
    exercise_id: int
    order_index: int
    target_sets: int
    rep_low: int
    rep_high: int
    coach_target_weight: float | None = None
    model_config = {"from_attributes": True}

class TemplateOut(BaseModel):
    id: int
    project_id: int
    name: str
    order_index: int
    exercises: list[TemplateExerciseOut] = []
    model_config = {"from_attributes": True}

class SetIn(BaseModel):
    exercise_id: int
    set_index: int = 0
    weight: float = 0
    reps: int = 0
    rpe: float | None = None
    is_warmup: bool = False
    note: str | None = None

class SetOut(SetIn):
    id: int
    model_config = {"from_attributes": True}

class WorkoutSessionCreate(BaseModel):
    project_id: int
    template_id: int | None = None
    date: date

class WorkoutSessionOut(BaseModel):
    id: int
    project_id: int
    template_id: int | None = None
    stage_id: int | None = None
    date: date
    review_note: str | None = None
    coach_note: str | None = None
    duration_minutes: int | None = None
    completed: bool
    sets: list[SetOut] = []
    model_config = {"from_attributes": True}

class WorkoutCompleteIn(BaseModel):
    review_note: str | None = None
    duration_minutes: int | None = None

class ExerciseHistoryPoint(BaseModel):
    date: date
    top_1rm: float
    best_set: dict
    total_volume: float

class ProgressionOut(BaseModel):
    exercise_id: int
    action: str
    delta: float
    reason: str
    last_weight: float | None = None
    suggested_weight: float | None = None
```

- [ ] **Step 2: Smoke import**

Run: `cd .../planner-v2 && python -c "from planner.api import schemas; schemas.WorkoutSessionOut"`
Expected: без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/planner/api/schemas.py
git commit -m "feat(workout): pydantic schemas"
```

---

### Task B2: Роуты workout + регистрация

**Files:**
- Create: `src/planner/api/routes/workouts.py`
- Modify: `src/planner/api/app.py`
- Test: `tests/test_workouts_api.py` (добавить API-тесты через TestClient)

**Interfaces:**
- Consumes: `services/workouts.py`, схемы B1, `require_owner`/`get_db` (паттерн tracking.py).
- Produces endpoints:
  - `GET /api/exercises`
  - `POST /api/exercises`
  - `GET /api/projects/{project_id}/workout-templates`
  - `POST /api/workouts` (создать сессию; авто stage_id)
  - `GET /api/workouts/{sid}`
  - `PUT /api/workouts/{sid}/sets` (replace)
  - `POST /api/workouts/{sid}/complete` (триггерит coach в B4 — здесь без LLM)
  - `GET /api/exercises/{exercise_id}/history`
  - `GET /api/workouts/{sid}/progression` (детерминированные подсказки по упражнениям шаблона)
  - `GET /api/projects/{project_id}/workouts` (список сессий цели)

- [ ] **Step 1: Написать failing API-тест**

Добавить в `tests/test_workouts_api.py` (фикстура `client` — скопировать из `tests/test_tracking_api.py` шапку с `HDR`/`client`):

```python
from tests.test_auth_initdata import make_init_data
HDR = {"X-Telegram-Init-Data": make_init_data()}

def test_workout_api_roundtrip(client):
    ex = client.post("/api/exercises", json={"name": "Присед", "muscle_group": "quads"}, headers=HDR).json()
    ws = client.post("/api/workouts", json={"project_id": 1, "date": "2026-06-22"}, headers=HDR)
    assert ws.status_code == 201, ws.text
    sid = ws.json()["id"]
    r = client.put(f"/api/workouts/{sid}/sets", json={"sets": [
        {"exercise_id": ex["id"], "set_index": 0, "weight": 75, "reps": 8, "rpe": 8}
    ]}, headers=HDR)
    assert r.status_code == 200, r.text
    assert len(r.json()["sets"]) == 1
    hist = client.get(f"/api/exercises/{ex['id']}/history", headers=HDR).json()
    assert hist[0]["best_set"]["weight"] == 75
```

(Примечание: фикстура `client` создаёт проект id=1? Нет — нужен проект. В sqlite-БД проектов нет. Для теста создать проект через ORM в фикстуре ИЛИ ослабить FK: sqlite по умолчанию FK не форсит — `project_id=1` пройдёт. Оставляем как есть, sqlite не проверяет FK.)

- [ ] **Step 2: Запустить — FAIL**

Run: `pytest tests/test_workouts_api.py::test_workout_api_roundtrip -v`
Expected: FAIL (404, роутов нет)

- [ ] **Step 3: Реализовать роуты**

`src/planner/api/routes/workouts.py`:

```python
from datetime import date as date_cls
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import (
    ExerciseCreate, ExerciseOut, TemplateOut, WorkoutSessionCreate, WorkoutSessionOut,
    SetIn, WorkoutCompleteIn, ExerciseHistoryPoint, ProgressionOut,
)
from planner.services import workouts as svc
from pydantic import BaseModel

router = APIRouter(prefix="/api")
Owner = Annotated[TelegramUser, Depends(require_owner)]
Db = Annotated[AsyncSession, Depends(get_db)]


class SetsReplaceIn(BaseModel):
    sets: list[SetIn]


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


@router.post("/workouts", response_model=WorkoutSessionOut, status_code=201)
async def create_workout(payload: WorkoutSessionCreate, _: Owner, db: Db):
    ws = await svc.create_session(db, payload.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(ws)
    return ws


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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found")
    await db.commit()
    await db.refresh(ws)
    return ws


@router.post("/workouts/{sid}/complete", response_model=WorkoutSessionOut)
async def complete_workout(sid: int, payload: WorkoutCompleteIn, _: Owner, db: Db):
    try:
        ws = await svc.complete_session(db, sid, payload.review_note, payload.duration_minutes)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found")
    await db.commit()
    await db.refresh(ws)
    # B4 добавит сюда триггер coach через BackgroundTasks
    return ws


@router.get("/exercises/{exercise_id}/history", response_model=list[ExerciseHistoryPoint])
async def exercise_history(exercise_id: int, _: Owner, db: Db):
    return await svc.exercise_history(db, exercise_id)


@router.get("/projects/{project_id}/workouts", response_model=list[WorkoutSessionOut])
async def list_workouts(project_id: int, _: Owner, db: Db):
    from sqlalchemy import select
    from planner.db.models import WorkoutSession
    q = select(WorkoutSession).where(WorkoutSession.project_id == project_id).order_by(WorkoutSession.date.desc())
    return list((await db.execute(q)).scalars().all())
```

Зарегистрировать в `src/planner/api/app.py` (рядом с прочими include_router):

```python
from planner.api.routes import workouts
...
app.include_router(workouts.router)
```

- [ ] **Step 4: Запустить — PASS**

Run: `pytest tests/test_workouts_api.py -v`
Expected: PASS (оба теста)

- [ ] **Step 5: Commit**

```bash
git add src/planner/api/routes/workouts.py src/planner/api/app.py tests/test_workouts_api.py
git commit -m "feat(workout): api routes + registration"
```

---

### Task B3: Сид каталога+шаблонов из программы

**Files:**
- Create: `src/planner/db/seed_workout.py`
- Test: `tests/test_workouts_api.py` (добавить тест сида)

**Interfaces:**
- Produces: `async def seed_workout(session, project_id: int) -> None` — идемпотентно создаёт каталог упражнений (из `тренер/программа.md`) и 4 шаблона (Верх-Сила, Низ-Квад, Верх-Гиперт, Низ-Задняя) с TemplateExercise.

- [ ] **Step 1: Failing-тест идемпотентности**

```python
@pytest.mark.asyncio
async def test_seed_idempotent(db_session):
    from planner.db.seed_workout import seed_workout
    from planner.services import workouts as svc
    await seed_workout(db_session, project_id=1)
    await db_session.commit()
    n1 = len(await svc.list_exercises(db_session))
    await seed_workout(db_session, project_id=1)  # повтор не дублирует
    await db_session.commit()
    n2 = len(await svc.list_exercises(db_session))
    assert n1 == n2 and n1 >= 20
    tpls = await svc.list_templates(db_session, 1)
    assert {t.name for t in tpls} == {"Верх-Сила", "Низ-Квадрицепс", "Верх-Гипертрофия", "Низ-Задняя цепь"}
```

- [ ] **Step 2: FAIL**

Run: `pytest tests/test_workouts_api.py::test_seed_idempotent -v`
Expected: FAIL

- [ ] **Step 3: Реализовать сид**

`src/planner/db/seed_workout.py` — данные строго по `personal-planner/тренер/программа.md` §2. Структура (полный список упражнений + 4 шаблона с target_sets/rep_low/rep_high из программы). Идемпотентность: по `Exercise.name` и `WorkoutTemplate.(project_id,name)`.

```python
from sqlalchemy import select
from planner.db.models import Exercise, WorkoutTemplate, TemplateExercise

# (name, muscle_group, rep_low, rep_high)
CATALOG = [
    ("Жим штанги лёжа", "chest", 6, 8),
    ("Тяга штанги в наклоне", "back", 6, 8),
    ("Армейский жим", "delts", 8, 10),
    ("Подтягивания с весом", "back", 6, 10),
    ("Вертикальная тяга блока", "back", 10, 12),
    ("Сгибания на бицепс штанга", "biceps", 10, 12),
    ("Французский жим", "triceps", 10, 12),
    ("Разгибания на трицепс", "triceps", 10, 12),
    ("Приседания со штангой", "quads", 6, 8),
    ("Румынская тяга", "hamstrings", 8, 10),
    ("Жим ногами", "quads", 10, 12),
    ("Сгибания ног лёжа", "hamstrings", 10, 12),
    ("Подъём на носки стоя", "calves", 12, 15),
    ("Pallof-пресс", "core", 12, 12),
    ("Dead bug", "core", 8, 10),
    ("Жим гантелей на наклонной 30°", "chest", 8, 10),
    ("Подтягивания широким хватом", "back", 8, 10),
    ("Тяга верхнего блока узким нейтральным", "back", 10, 12),
    ("Горизонтальная тяга блока сидя", "back", 10, 12),
    ("Махи гантелями в стороны", "delts", 12, 15),
    ("Face Pull", "delts", 12, 15),
    ("Bayesian Curl", "biceps", 12, 12),
    ("Молотки", "biceps", 12, 12),
    ("Жим ногами высокая постановка", "glutes", 8, 10),
    ("Болгарские сплит-приседы", "glutes", 10, 12),
    ("Разгибания ног сидя", "quads", 12, 15),
    ("Сгибания ног сидя", "hamstrings", 12, 15),
    ("Сведение/разведение ног", "glutes", 12, 15),
    ("Подъём на носки сидя", "calves", 15, 20),
]

# template_name -> [(exercise_name, target_sets)]
TEMPLATES = {
    "Верх-Сила": [
        ("Жим штанги лёжа", 3), ("Тяга штанги в наклоне", 3), ("Армейский жим", 3),
        ("Подтягивания с весом", 3), ("Вертикальная тяга блока", 3),
        ("Сгибания на бицепс штанга", 3), ("Разгибания на трицепс", 3),
    ],
    "Низ-Квадрицепс": [
        ("Приседания со штангой", 3), ("Румынская тяга", 3), ("Жим ногами", 3),
        ("Сгибания ног лёжа", 3), ("Подъём на носки стоя", 3),
        ("Pallof-пресс", 3), ("Dead bug", 3),
    ],
    "Верх-Гипертрофия": [
        ("Жим гантелей на наклонной 30°", 3), ("Подтягивания широким хватом", 3),
        ("Тяга верхнего блока узким нейтральным", 3), ("Горизонтальная тяга блока сидя", 3),
        ("Махи гантелями в стороны", 4), ("Face Pull", 4),
        ("Bayesian Curl", 3), ("Молотки", 3), ("Разгибания на трицепс", 3),
    ],
    "Низ-Задняя цепь": [
        ("Жим ногами высокая постановка", 3), ("Болгарские сплит-приседы", 3),
        ("Разгибания ног сидя", 3), ("Сгибания ног сидя", 4),
        ("Сведение/разведение ног", 4), ("Подъём на носки сидя", 4), ("Pallof-пресс", 3),
    ],
}


async def seed_workout(session, project_id: int) -> None:
    existing = {e.name: e for e in (await session.execute(select(Exercise))).scalars()}
    by_name: dict[str, Exercise] = dict(existing)
    for i, (name, mg, lo, hi) in enumerate(CATALOG):
        if name not in by_name:
            ex = Exercise(name=name, muscle_group=mg, default_rep_low=lo, default_rep_high=hi,
                          is_custom=False, order_index=i)
            session.add(ex)
            await session.flush()
            by_name[name] = ex

    have_tpl = {t.name for t in (await session.execute(
        select(WorkoutTemplate).where(WorkoutTemplate.project_id == project_id))).scalars()}
    for ti, (tname, items) in enumerate(TEMPLATES.items()):
        if tname in have_tpl:
            continue
        tpl = WorkoutTemplate(project_id=project_id, name=tname, order_index=ti)
        session.add(tpl)
        await session.flush()
        for oi, (exname, sets) in enumerate(items):
            ex = by_name[exname]
            session.add(TemplateExercise(
                template_id=tpl.id, exercise_id=ex.id, order_index=oi, target_sets=sets,
                rep_low=ex.default_rep_low or 8, rep_high=ex.default_rep_high or 12,
            ))
    await session.flush()
```

- [ ] **Step 4: PASS**

Run: `pytest tests/test_workouts_api.py::test_seed_idempotent -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/planner/db/seed_workout.py tests/test_workouts_api.py
git commit -m "feat(workout): idempotent catalog+templates seed from program"
```

---

# WAVE C — Coach (LLM + Telegram push)

### Task C1: notify_owner (Telegram-пуш)

**Files:**
- Create: `src/planner/bot/utils.py`
- Test: `tests/test_coach.py`

**Interfaces:**
- Produces: `async def notify_owner(text: str) -> None` (открывает Bot, шлёт owner, закрывает session).

- [ ] **Step 1: Failing-тест (мок aiogram Bot)**

Создать `tests/test_coach.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_notify_owner_sends(monkeypatch):
    sent = {}

    class FakeSession:
        async def close(self): sent["closed"] = True

    class FakeBot:
        def __init__(self, token): sent["token"] = token
        session = FakeSession()
        async def send_message(self, chat_id, text): sent["chat_id"] = chat_id; sent["text"] = text

    import planner.bot.utils as u
    monkeypatch.setattr(u, "Bot", FakeBot)
    await u.notify_owner("привет")
    assert sent["text"] == "привет"
    assert sent["chat_id"] == 555  # OWNER_TELEGRAM_ID из conftest
```

- [ ] **Step 2: FAIL**

Run: `pytest tests/test_coach.py::test_notify_owner_sends -v`
Expected: FAIL

- [ ] **Step 3: Реализовать**

`src/planner/bot/utils.py`:

```python
from aiogram import Bot
from planner.config import get_settings


async def notify_owner(text: str) -> None:
    settings = get_settings()
    bot = Bot(token=settings.telegram_bot_token)
    try:
        await bot.send_message(chat_id=settings.owner_telegram_id, text=text)
    finally:
        await bot.session.close()
```

- [ ] **Step 4: PASS** — `pytest tests/test_coach.py::test_notify_owner_sends -v`

- [ ] **Step 5: Commit**

```bash
git add src/planner/bot/utils.py tests/test_coach.py
git commit -m "feat(workout): notify_owner telegram push helper"
```

---

### Task C2: Config — anthropic_api_key + coach_model

**Files:**
- Modify: `src/planner/config.py`

- [ ] **Step 1: Добавить поля**

В класс `Settings`:

```python
    anthropic_api_key: str | None = None
    coach_model: str = "claude-haiku-4-5-20251001"
```

- [ ] **Step 2: Smoke** — `python -c "from planner.config import get_settings; print('ok')"` (с тестовыми env) → ok

- [ ] **Step 3: Commit**

```bash
git add src/planner/config.py
git commit -m "feat(workout): config anthropic_api_key + coach_model"
```

---

### Task C3: Coach-сервис (LLM-разбор + правки + пуш)

**Files:**
- Create: `src/planner/services/coach.py`
- Test: `tests/test_coach.py` (дополнить, мок httpx + notify_owner)

**Interfaces:**
- Consumes: `services/workouts`, `notify_owner`, программа из файла (передаётся текстом-константой PROGRAM_CONTEXT + health-рейлы), Anthropic API.
- Produces:
  - `build_prompt(session_summary: dict) -> str`
  - `async def call_llm(prompt: str) -> str` (httpx POST Anthropic messages; если `anthropic_api_key` None → возвращает детерминированный фолбэк-текст)
  - `async def analyze_session(sid: int) -> None` — самостоятельная (своя db-сессия), читает сессию+историю, считает прогрессию, зовёт LLM, пишет `coach_note` + `project.ai_notes` (append) + ставит `coach_target_weight` по up/down, шлёт `notify_owner`.

- [ ] **Step 1: Failing-тест analyze_session с моками**

Дополнить `tests/test_coach.py`:

```python
@pytest.mark.asyncio
async def test_analyze_session_writes_note_and_pushes(db_session, monkeypatch):
    from planner.services import workouts as svc
    import planner.services.coach as coach

    ex = await svc.create_exercise(db_session, {"name": "Жим", "muscle_group": "chest",
                                                "default_rep_low": 8, "default_rep_high": 12})
    ws = await svc.create_session(db_session, {"project_id": 1, "date": __import__("datetime").date(2026, 6, 22)})
    await svc.replace_sets(db_session, ws.id, [
        {"exercise_id": ex.id, "set_index": 0, "weight": 50, "reps": 12, "rpe": 7},
    ])
    await svc.complete_session(db_session, ws.id, "норм шло", 60)
    await db_session.commit()

    pushed = {}
    async def fake_push(text): pushed["text"] = text
    async def fake_llm(prompt): return "Разбор: жим добил, +2.5."
    # analyze_session открывает свою сессию — подменим фабрику на текущую
    monkeypatch.setattr(coach, "notify_owner", fake_push)
    monkeypatch.setattr(coach, "call_llm", fake_llm)
    monkeypatch.setattr(coach, "_session_scope", lambda: _fake_scope(db_session))

    await coach.analyze_session(ws.id)
    refreshed = await svc.get_session(db_session, ws.id)
    assert refreshed.coach_note and "жим" in refreshed.coach_note.lower()
    assert "text" in pushed


from contextlib import asynccontextmanager
@asynccontextmanager
async def _fake_scope(s):
    yield s
```

- [ ] **Step 2: FAIL** — `pytest tests/test_coach.py::test_analyze_session_writes_note_and_pushes -v`

- [ ] **Step 3: Реализовать coach**

`src/planner/services/coach.py`:

```python
"""Агент-тренер: LLM-разбор сессии. Триггерится после complete.
Health-рейлы вшиты в промпт (неприкосновенны). Фолбэк без ключа = детерминированный текст.
"""
import json
from contextlib import asynccontextmanager
from datetime import date as date_cls

import httpx
from sqlalchemy import select

from planner.bot.utils import notify_owner
from planner.config import get_settings
from planner.db.models import Project, SetLog, TemplateExercise, WorkoutSession
from planner.db.session import get_session
from planner.services import workouts as svc

HEALTH_RAILS = (
    "ЖЁСТКИЕ ОГРАНИЧЕНИЯ (нарушать НЕЛЬЗЯ): гипертонус диафрагмы/таза — "
    "никакой флексии пресса (скручивания/подъём ног в висе), кор только анти-экстензия, "
    "без экстрим-Вальсальвы, велик-кардио избегать в острые фазы. "
    "Ты тренер, не врач: боль/red flags → советуй к врачу, не продавливай."
)
PROGRAM_CONTEXT = (
    "Цель: рекомпозиция 90д (сильнее + мощная фигура; строим спину/дельты/верх груди, сушим талию). "
    "Сплит Верх/Низ ×2, двойная прогрессия. Дефицит ~−10-15%, белок ~155 г, шаги 8-10k."
)


@asynccontextmanager
async def _session_scope():
    async for s in get_session():
        yield s
        return


async def _summary(session, sid: int) -> dict:
    ws = await svc.get_session(session, sid)
    items = []
    for sl in ws.sets:
        items.append({"exercise_id": sl.exercise_id, "weight": sl.weight, "reps": sl.reps,
                      "rpe": sl.rpe, "is_warmup": sl.is_warmup, "note": sl.note})
    return {"date": str(ws.date), "review": ws.review_note, "sets": items}


def build_prompt(session_summary: dict) -> str:
    return (
        f"{PROGRAM_CONTEXT}\n{HEALTH_RAILS}\n\n"
        f"Данные тренировки (JSON):\n{json.dumps(session_summary, ensure_ascii=False)}\n\n"
        "Дай краткий разбор по-русски (3-5 предложений): что хорошо, где прогресс, "
        "1-2 конкретных правки на след. тренировку. Без воды."
    )


async def call_llm(prompt: str) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "Тренировка учтена. (LLM-разбор выключен: нет ключа.)"
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
    # группируем рабочие подходы по упражнению
    by_ex: dict[int, list[dict]] = {}
    for sl in ws.sets:
        if sl.is_warmup:
            continue
        by_ex.setdefault(sl.exercise_id, []).append({"weight": sl.weight, "reps": sl.reps, "rpe": sl.rpe})
    tes = (await session.execute(
        select(TemplateExercise).where(TemplateExercise.template_id == ws.template_id))).scalars().all()
    for te in tes:
        sets = by_ex.get(te.exercise_id)
        if not sets:
            continue
        prog = svc.suggest_progression(sets, te.rep_low, te.rep_high)
        last_w = max(s["weight"] for s in sets)
        if prog["action"] in ("up", "down"):
            te.coach_target_weight = round(last_w + prog["delta"], 2)
    await session.flush()


async def analyze_session(sid: int) -> None:
    async with _session_scope() as session:
        summary = await _summary(session, sid)
        text = await call_llm(build_prompt(summary))
        ws = await svc.get_session(session, sid)
        ws.coach_note = text
        await _apply_progression(session, sid)
        # append в project.ai_notes
        proj = await session.get(Project, ws.project_id)
        notes = list(proj.ai_notes or [])
        notes.append({"date": str(ws.date), "type": "info", "text": text[:500]})
        proj.ai_notes = notes
        await session.commit()
        await notify_owner(f"🏋️ Разбор тренировки {ws.date}:\n{text}")
```

- [ ] **Step 4: PASS** — `pytest tests/test_coach.py -v`
Expected: PASS (оба)

- [ ] **Step 5: Commit**

```bash
git add src/planner/services/coach.py tests/test_coach.py
git commit -m "feat(workout): coach llm analysis + progression apply + push"
```

---

### Task C4: Триггер coach после complete (BackgroundTasks)

**Files:**
- Modify: `src/planner/api/routes/workouts.py`
- Test: `tests/test_workouts_api.py` (проверить, что complete планирует фон-задачу)

**Interfaces:**
- Consumes: `coach.analyze_session`, FastAPI `BackgroundTasks`.

- [ ] **Step 1: Failing-тест что complete ставит background-задачу**

```python
def test_complete_schedules_coach(client, monkeypatch):
    called = {}
    import planner.api.routes.workouts as wr
    async def fake_analyze(sid): called["sid"] = sid
    monkeypatch.setattr(wr.coach, "analyze_session", fake_analyze)
    ws = client.post("/api/workouts", json={"project_id": 1, "date": "2026-06-22"}, headers=HDR).json()
    r = client.post(f"/api/workouts/{ws['id']}/complete", json={"review_note": "ок"}, headers=HDR)
    assert r.status_code == 200
    # TestClient выполняет BackgroundTasks синхронно после ответа
    assert called.get("sid") == ws["id"]
```

- [ ] **Step 2: FAIL** — `pytest tests/test_workouts_api.py::test_complete_schedules_coach -v`

- [ ] **Step 3: Подключить BackgroundTasks**

В `workouts.py`: импорт `from fastapi import BackgroundTasks` и `from planner.services import coach`. Изменить `complete_workout`:

```python
@router.post("/workouts/{sid}/complete", response_model=WorkoutSessionOut)
async def complete_workout(sid: int, payload: WorkoutCompleteIn, bg: BackgroundTasks, _: Owner, db: Db):
    try:
        ws = await svc.complete_session(db, sid, payload.review_note, payload.duration_minutes)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "workout not found")
    await db.commit()
    await db.refresh(ws)
    bg.add_task(coach.analyze_session, sid)
    return ws
```

- [ ] **Step 4: PASS** — `pytest tests/test_workouts_api.py -v` (вся группа)

- [ ] **Step 5: Commit**

```bash
git add src/planner/api/routes/workouts.py tests/test_workouts_api.py
git commit -m "feat(workout): trigger coach analysis on complete (background)"
```

---

# WAVE D — Frontend preview (МОКАП-GATE)

> Цель волны: утвердить ЖИВОЙ компонент в preview с мок-данными ДО проводки на бэк (правило planner). Не двигаться в Wave E без визуального «ок» Александра.

### Task D1: Типы + иконки

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/icons.tsx`

- [ ] **Step 1: Типы** — добавить в `types.ts`:

```ts
export interface Exercise { id: number; name: string; muscle_group: string; equipment?: string | null;
  is_custom: boolean; default_rep_low?: number | null; default_rep_high?: number | null; order_index: number; }
export interface SetLog { id?: number; exercise_id: number; set_index: number; weight: number; reps: number;
  rpe?: number | null; is_warmup: boolean; note?: string | null; }
export interface WorkoutSession { id: number; project_id: number; template_id?: number | null;
  stage_id?: number | null; date: string; review_note?: string | null; coach_note?: string | null;
  duration_minutes?: number | null; completed: boolean; sets: SetLog[]; }
export interface TemplateExercise { id: number; exercise_id: number; order_index: number;
  target_sets: number; rep_low: number; rep_high: number; coach_target_weight?: number | null; }
export interface WorkoutTemplate { id: number; project_id: number; name: string; order_index: number;
  exercises: TemplateExercise[]; }
export interface ExerciseHistoryPoint { date: string; top_1rm: number; best_set: { weight: number; reps: number }; total_volume: number; }
```

- [ ] **Step 2: Иконка** — добавить в `icons.tsx` `IcoDumbbell` по существующему `sv(...)`-паттерну (stroke=currentColor).

- [ ] **Step 3: Build** — `cd frontend && npm run build` → без TS-ошибок.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/icons.tsx
git commit -m "feat(workout): frontend types + dumbbell icon"
```

---

### Task D2: ProgressChart (custom SVG)

**Files:**
- Create: `frontend/src/components/workout/ProgressChart.tsx`

**Interfaces:**
- Produces: `ProgressChart({ data }: { data: { date: string; value: number }[] })` — линейный SVG-график, цвет `var(--accent)`, без либ.

- [ ] **Step 1: Реализовать** (полилиния по theme-токенам, пустое состояние = скелетон-плейсхолдер, не спиннер).
- [ ] **Step 2: Build** — `npm run build` без ошибок.
- [ ] **Step 3: Commit** — `git commit -m "feat(workout): svg progress chart"`

---

### Task D3: Компонент WorkoutLog (3 вида) + подвиджеты

**Files:**
- Create: `frontend/src/components/WorkoutLog.tsx` (роутер видов: list | active | exercise)
- Create: `frontend/src/components/workout/SessionList.tsx` (список сессий + кнопки «Старт <шаблон>» + история)
- Create: `frontend/src/components/workout/ActiveSession.tsx` (упражнения шаблона, степперы вес/повт, опц RPE, флаг разминки, заметка-упражнение; внизу textarea ревью + «Завершить»)
- Create: `frontend/src/components/workout/ExerciseHistory.tsx` (ProgressChart + PR-метки + таблица)

**Interfaces:**
- Consumes: типы D1, ProgressChart D2, theme-классы (`card/input/btn`), `Sheet`, `useBottomAnchor`.
- Produces: `WorkoutLog({ goalId, onBack, api })` где `api` — инъецируемый объект вызовов (для preview подменяется моками; в Wave E = реальный).

- [ ] **Step 1: Сверстать по паттернам** (TaskDetail-оверлей; степперы ±2.5/±1; гибрид — кнопка «+ упражнение» открывает каталог через Sheet; авто-подстановка прошлых весов и `coach_target_weight` как плейсхолдер цели).
- [ ] **Step 2: Build** — `npm run build` без ошибок.
- [ ] **Step 3: Commit** — `git commit -m "feat(workout): WorkoutLog component + subviews"`

---

### Task D4: Preview-mock + утверждение (GATE)

**Files:**
- Create: `frontend/src/preview-workout-log-mock.tsx`

- [ ] **Step 1: Мок-данные + патч fetch** (по образцу `preview-tracking-mock.tsx`): шаблоны (4), каталог, 2-3 прошлые сессии, история одного упражнения. Рендер `<WorkoutLog goalId={23} onBack={()=>{}} api={mockApi}/>` в рамке 390px, theme.css.
- [ ] **Step 2: Build + открыть превью**

Run:
```bash
cd frontend && npm run build
open http://localhost:5173/app/preview-workout-log-mock.html  # или vite preview
```
(Если vite не запущен: `npm run dev` и открыть `http://localhost:5173/src/preview-workout-log-mock.tsx` по конфигу превью-входов.)

- [ ] **Step 3: 🚦 GATE — показать Александру, собрать правки, итерировать ДО «ок».** Не переходить в Wave E без согласования (mockup-fidelity-gate).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/preview-workout-log-mock.tsx frontend/src/components/workout/
git commit -m "feat(workout): preview-mock for design approval"
```

---

# WAVE E — Wiring + интеграция

### Task E1: API-клиент

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Добавить вызовы** (по паттерну `req<T>`):

```ts
export const getExercises = () => req<Exercise[]>(`/api/exercises`);
export const createExercise = (d: Partial<Exercise>) => req<Exercise>(`/api/exercises`, { method: "POST", body: JSON.stringify(d) });
export const getTemplates = (pid: number) => req<WorkoutTemplate[]>(`/api/projects/${pid}/workout-templates`);
export const getWorkouts = (pid: number) => req<WorkoutSession[]>(`/api/projects/${pid}/workouts`);
export const createWorkout = (pid: number, date: string, template_id?: number) =>
  req<WorkoutSession>(`/api/workouts`, { method: "POST", body: JSON.stringify({ project_id: pid, date, template_id }) });
export const putSets = (sid: number, sets: SetLog[]) =>
  req<WorkoutSession>(`/api/workouts/${sid}/sets`, { method: "PUT", body: JSON.stringify({ sets }) });
export const completeWorkout = (sid: number, review_note?: string, duration_minutes?: number) =>
  req<WorkoutSession>(`/api/workouts/${sid}/complete`, { method: "POST", body: JSON.stringify({ review_note, duration_minutes }) });
export const getExerciseHistory = (id: number) => req<ExerciseHistoryPoint[]>(`/api/exercises/${id}/history`);
```

- [ ] **Step 2: Build** — `npm run build` без ошибок.
- [ ] **Step 3: Commit** — `git commit -m "feat(workout): api client calls"`

---

### Task E2: Интеграция в Goals (оверлей)

**Files:**
- Modify: `frontend/src/screens/Goals.tsx`

**Interfaces:**
- Consumes: `WorkoutLog`, реальный `api.ts` (передать как `api` проп = объект из E1-функций).

- [ ] **Step 1: Состояние + точка входа** — добавить `const [workoutGoalId, setWorkoutGoalId] = useState<number|null>(null)`; на карточке цели — кнопка «Тренировки» (IcoDumbbell) → `setWorkoutGoalId(p.id)`; рендер оверлея:

```tsx
{workoutGoalId != null && (
  <div className="detail-overlay">
    <WorkoutLog goalId={workoutGoalId} onBack={() => setWorkoutGoalId(null)} api={realApi} />
  </div>
)}
```

где `realApi` собран из функций E1.

- [ ] **Step 2: Build** — `npm run build` без ошибок.
- [ ] **Step 3: Ручная проверка в dev** (если есть локальный бэк) — открыть Цели → цель → Тренировки → старт → лог → завершить.
- [ ] **Step 4: Commit** — `git commit -m "feat(workout): wire WorkoutLog into Goals overlay"`

---

# WAVE F — Deploy + проверка

### Task F1: Прод-миграция + сид + деплой

**Files:** (нет правок кода — операции)

- [ ] **Step 1: Залить код + миграция на проде**

Run (на сервере планнера — через ssh):
```bash
ssh root@188.245.42.4 "cd /root/planner-v2-src && git pull"   # ИЛИ rsync согласно деплой-пути
# применить миграцию в контейнере api
ssh root@188.245.42.4 "cd /root/planner-v2-src/planner-v2 && docker compose -f docker-compose.prod.yml run --rm planner-api alembic upgrade head"
```
Expected: миграция применилась (5 таблиц в `planner-postgres`).

- [ ] **Step 2: Сид каталога+шаблонов для project 23**

Запустить разово (питон-скрипт в контейнере или psql через сервис). Через python:
```bash
ssh root@188.245.42.4 "cd /root/planner-v2-src/planner-v2 && docker compose -f docker-compose.prod.yml run --rm planner-api python -c \"
import asyncio
from planner.db.session import get_session
from planner.db.seed_workout import seed_workout
async def run():
    async for s in get_session():
        await seed_workout(s, 23); await s.commit(); break
asyncio.run(run())
\""
```
Проверить: `ssh root@188.245.42.4 "docker exec -i planner-postgres psql -U planner -d planner -c 'SELECT count(*) FROM exercise; SELECT name FROM workout_template;'"`
Expected: ~29 упражнений, 4 шаблона.

- [ ] **Step 3: Установить ANTHROPIC_API_KEY на проде** (env контейнера api+bot) и пересобрать.

Run:
```bash
# добавить ANTHROPIC_API_KEY=... в .env прода (НЕ коммитить ключ)
ssh root@188.245.42.4 "cd /root/planner-v2-src/planner-v2 && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d"
```

- [ ] **Step 4: Билд+rsync фронта** (по деплой-пути planner) и health-чек.

Run: `curl https://planner.188.245.42.4.nip.io/api/health` → `200`.

- [ ] **Step 5: Commit (если были прод-конфиг-правки в репо, без секретов)**

```bash
git add -A && git commit -m "chore(workout): prod deploy notes"
```

---

### Task F2: Визуальная проверка (fidelity-gate) + смоук петли

- [ ] **Step 1: Открыть PWA/Mini App** → Цели → «Recomp 90д» → «Тренировки».
- [ ] **Step 2: Сверить с утверждённым preview (D4)** — экран 1:1. Если дрейф — фикс до совпадения (не верить bundle-hash).
- [ ] **Step 3: Прогнать петлю вживую:** старт «Верх-Сила» → залогировать 1-2 упражнения (вес×повт) → ревью → Завершить → дождаться **Telegram-пуша с разбором** → проверить, что в Цели появилась `ai_notes`-заметка и `coach_target_weight` проставился.
- [ ] **Step 4: Зафиксировать результат** в `personal-planner/контекст/сессии/<дата>.md` (HANDOFF) + обновить `тренер/память.md` (фича жива).

---

## Self-Review

**1. Spec coverage** (`тренер/волна-1-workout-лог.md`):
- Q1 гибрид-шаблоны → A1/B3 (template+TemplateExercise) + D3 «+ упражнение». ✅
- Q2 каталог из программы → B3 seed. ✅
- Q3 вес×повт+RPE(опц)+разминка+заметка+ревью → A1 SetLog + WorkoutSession.review_note; схемы B1; UI D3. ✅
- Q4 авто-LLM после трени + код-прогрессия → C3/C4 + A3. ✅
- Q5 TG-пуш + ai_notes история → C1/C3. ✅
- Q6 полная фича (петля+история+PR+график+мезоцикл) → A4 history/1rm, D2 chart, current_stage_id привязка. ✅
- Q7 тренер сам правит + откат → coach_target_weight (C3 `_apply_progression`); откат = очистка (UI-кнопка добавить в D3/E2 — **отметить как доп. шаг**). ✅
- Health-рейлы → C3 HEALTH_RAILS в промпте + сид не содержит флексии пресса (нет скручиваний/виса в CATALOG). ✅

**2. Placeholder scan:** код приведён в каждом шаге кода; операции деплоя — команды. OK.

**3. Type consistency:** `suggest_progression`/`epley_1rm`/`exercise_history` — имена совпадают между A3/A4/C3. `coach_target_weight` — модель A1 = схема B1 = coach C3. `analyze_session(sid)` — C3=C4. OK.

**Добавить при исполнении (мелочь, не блок):** UI-кнопка «откат правки тренера» (очистить `coach_target_weight`) — PATCH-эндпоинт `/api/template-exercises/{id}` (по паттерну B2) + кнопка в ActiveSession (D3). Завести как Task E3 при старте Wave E.
