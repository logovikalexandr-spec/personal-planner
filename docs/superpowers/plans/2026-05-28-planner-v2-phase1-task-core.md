# Planner v2 — Phase 1: Ядро задач и Inbox (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Доменное ядро: таблицы project/task/tag/inbox_item/attachment в Postgres, сервисный слой, owner-gated REST API (projects/tasks/inbox), бот-захват (текст/ссылка/фото) в Inbox. Без LLM (AI-парсинг — Phase 4); поля задачи при захвате заполняются минимально, разбор вручную через triage.

**Architecture:** Слой моделей (SQLAlchemy 2 typed) -> сервисы (вся логика, без SQL в роутерах/боте) -> FastAPI роутеры (owner-gated через require_owner из Phase 0) + aiogram-хендлеры захвата. Тесты на in-memory aiosqlite (быстро, без Postgres); типы портируемы (String вместо нативных enum, JSON вместо JSONB).

**Tech Stack:** дополняет Phase 0. Добавляется `aiosqlite` (dev, тестовая БД). Prod — Postgres (миграции Alembic autogenerate).

**Примечание:** без emoji. Идентификаторы — английские. Все пути относительно `personal-planner/planner-v2/`.

---

## File Structure (создаётся/меняется)

```
planner-v2/
  pyproject.toml                        # +aiosqlite (dev)
  src/planner/
    db/
      models.py                         # NEW: все ORM-модели
    services/
      __init__.py                       # NEW
      tasks.py                          # NEW: create/list/status/triage
      inbox.py                          # NEW: capture
    api/
      schemas.py                        # NEW: pydantic IO-схемы
      routes/
        projects.py                     # NEW
        tasks.py                         # NEW
        inbox.py                         # NEW
      app.py                            # MOD: include новых роутеров
      deps.py                           # MOD: get_db session dependency
    bot/
      handlers/
        capture.py                      # NEW: text/url/photo -> inbox
      main.py                           # MOD: include capture router, DB middleware
  alembic/versions/xxxx_phase1.py       # NEW: таблицы + сид Inbox
  tests/
    conftest.py                         # MOD: async test engine + session override
    test_models.py                      # NEW
    test_tasks_service.py               # NEW
    test_inbox_service.py               # NEW
    test_api_tasks.py                   # NEW
    test_api_inbox.py                   # NEW
    test_bot_capture.py                 # NEW
```

---

## Task 1: Тестовая БД (aiosqlite) + session override

**Files:** Modify `pyproject.toml`, `tests/conftest.py`. 

- [ ] **Step 1: Добавить dev-зависимость aiosqlite**

В `pyproject.toml`, в `[project.optional-dependencies] dev = [...]` добавить строку `"aiosqlite>=0.20",`. Затем `cd planner-v2 && source .venv/bin/activate && pip install -e ".[dev]"`.

- [ ] **Step 2: Расширить `tests/conftest.py`**

Дописать к существующему conftest (НЕ удалять строки с os.environ.setdefault) фикстуры тестовой БД:
```python
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planner.db.base import Base


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    import planner.db.models  # noqa: F401  (регистрация моделей в metadata)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncSession:
    maker = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)
    async with maker() as s:
        yield s
```

- [ ] **Step 3: Проверка** — `pytest -q` (10 прежних тестов всё ещё проходят; новые фикстуры не используются — ок).

- [ ] **Step 4: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/pyproject.toml planner-v2/tests/conftest.py
git commit -m "test(planner-v2): in-memory aiosqlite test DB fixtures"
```

---

## Task 2: ORM-модели

**Files:** Create `src/planner/db/models.py`. Test: `tests/test_models.py`.

- [ ] **Step 1: Падающий тест `tests/test_models.py`**
```python
import pytest
from sqlalchemy import select

from planner.db.models import InboxItem, Project, Tag, Task


@pytest.mark.asyncio
async def test_create_project_and_task(db_session):
    proj = Project(name="ZIMA", slug="zima")
    db_session.add(proj)
    await db_session.flush()
    task = Task(title="Сделать креатив", project_id=proj.id, priority="high")
    db_session.add(task)
    await db_session.flush()
    rows = (await db_session.execute(select(Task))).scalars().all()
    assert len(rows) == 1
    assert rows[0].title == "Сделать креатив"
    assert rows[0].status == "todo"


@pytest.mark.asyncio
async def test_inbox_item_defaults(db_session):
    item = InboxItem(kind="text", source="manual", raw_content="купить молоко")
    db_session.add(item)
    await db_session.flush()
    assert item.status == "new"


@pytest.mark.asyncio
async def test_tag(db_session):
    t = Tag(name="work")
    db_session.add(t)
    await db_session.flush()
    assert t.id is not None
```

- [ ] **Step 2: Запустить — FAIL** (`pytest tests/test_models.py -v`).

- [ ] **Step 3: Реализация `src/planner/db/models.py`**
```python
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planner.db.base import Base


class Project(Base):
    __tablename__ = "project"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    color: Mapped[str | None] = mapped_column(String(32), default=None)
    icon: Mapped[str | None] = mapped_column(String(32), default=None)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("project.id"), default=None)
    is_inbox: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    __tablename__ = "task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(String, default=None)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("project.id"), default=None)
    priority: Mapped[str] = mapped_column(String(10), default="none")  # none/low/medium/high
    due_date: Mapped[date | None] = mapped_column(Date, default=None)
    due_time: Mapped[time | None] = mapped_column(Time, default=None)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    recurrence: Mapped[str | None] = mapped_column(String(100), default=None)
    status: Mapped[str] = mapped_column(String(15), default="todo")  # todo/in_progress/done/archived
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual/session
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("task.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tags: Mapped[list[Tag]] = relationship(secondary="task_tag", lazy="selectin")


class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    color: Mapped[str | None] = mapped_column(String(32), default=None)


class TaskTag(Base):
    __tablename__ = "task_tag"

    task_id: Mapped[int] = mapped_column(ForeignKey("task.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), primary_key=True)


class InboxItem(Base):
    __tablename__ = "inbox_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # manual/text/photo/link/session
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual/session
    raw_content: Mapped[str] = mapped_column(String, default="")
    parsed_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    status: Mapped[str] = mapped_column(String(12), default="new")  # new/parsed/triaged/archived
    suggested_project_id: Mapped[int | None] = mapped_column(ForeignKey("project.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Attachment(Base):
    __tablename__ = "attachment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("task.id"), default=None)
    inbox_item_id: Mapped[int | None] = mapped_column(ForeignKey("inbox_item.id"), default=None)
    kind: Mapped[str] = mapped_column(String(10))  # photo/link/file
    url_or_fileid: Mapped[str] = mapped_column(String)
    meta: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Запустить — PASS** (3 теста). Затем `pytest -q` — всё зелёное.

- [ ] **Step 5: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/src/planner/db/models.py planner-v2/tests/test_models.py
git commit -m "feat(planner-v2): ORM models (project/task/tag/inbox_item/attachment)"
```

---

## Task 3: Миграция Alembic + сид Inbox

**Files:** Create migration in `alembic/versions/`.

- [ ] **Step 1: Autogenerate против пустой prod-БД**

env.py уже импортирует `planner.db` — добавить в него регистрацию моделей. Открыть `alembic/env.py`, заменить строку `import planner.db  # noqa: F401 ...` на `import planner.db.models  # noqa: F401  (регистрация моделей)`.

Поднять чистую БД (учесть конфликт порта 5432 с ledger — при необходимости останови ledger-postgres или используй 5433). Затем:
```bash
cd planner-v2 && source .venv/bin/activate && docker compose up -d postgres
DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner alembic revision --autogenerate -m "phase1 task core"
```
Проверить сгенерированный файл: должны создаваться таблицы project, task, tag, task_tag, inbox_item, attachment с FK.

- [ ] **Step 2: Дописать сид Inbox-проекта в `upgrade()`**

В конец `upgrade()` добавить вставку единственного Inbox-проекта:
```python
    from sqlalchemy import table, column, String, Integer, Boolean
    project_t = table(
        "project",
        column("name", String), column("slug", String),
        column("is_inbox", Boolean),
    )
    op.bulk_insert(project_t, [{"name": "Inbox", "slug": "inbox", "is_inbox": True}])
```
(Импорт `op` уже есть в файле как `from alembic import op`.)

- [ ] **Step 3: Применить и проверить**
```bash
DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner alembic upgrade head
DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner python -c "
import asyncio,os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
async def go():
    e=create_async_engine(os.environ['DATABASE_URL'])
    async with e.connect() as c:
        r=await c.execute(text(\"select slug,is_inbox from project\"))
        print(r.all())
    await e.dispose()
asyncio.run(go())
"
```
Expected: `[('inbox', True)]`.

- [ ] **Step 4: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/alembic/env.py planner-v2/alembic/versions/
git commit -m "feat(planner-v2): phase1 migration + seed Inbox project"
```

---

## Task 4: Сервис задач

**Files:** Create `src/planner/services/__init__.py` (empty), `src/planner/services/tasks.py`. Test: `tests/test_tasks_service.py`.

- [ ] **Step 1: Падающий тест `tests/test_tasks_service.py`**
```python
from datetime import date, timedelta

import pytest

from planner.db.models import InboxItem, Project
from planner.services import tasks as svc


@pytest.mark.asyncio
async def test_create_task_defaults_to_inbox(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    t = await svc.create_task(db_session, title="купить молоко")
    assert t.project_id == inbox.id  # без проекта -> Inbox
    assert t.status == "todo"


@pytest.mark.asyncio
async def test_list_today(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    await svc.create_task(db_session, title="сегодня", due_date=date.today())
    await svc.create_task(db_session, title="завтра", due_date=date.today() + timedelta(days=1))
    today = await svc.list_tasks(db_session, scope="today")
    assert [t.title for t in today] == ["сегодня"]


@pytest.mark.asyncio
async def test_set_status_done(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    t = await svc.create_task(db_session, title="x")
    await svc.set_status(db_session, t.id, "done")
    assert t.status == "done"
    assert t.done_at is not None


@pytest.mark.asyncio
async def test_triage_inbox_creates_task(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    proj = Project(name="ZIMA", slug="zima")
    db_session.add_all([inbox, proj])
    await db_session.flush()
    item = InboxItem(kind="text", source="manual", raw_content="сделать креатив")
    db_session.add(item)
    await db_session.flush()
    t = await svc.triage_inbox(db_session, item.id, project_id=proj.id, title="сделать креатив", priority="high")
    assert t.project_id == proj.id
    assert t.priority == "high"
    assert item.status == "triaged"
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализация `src/planner/services/tasks.py`**
```python
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from planner.db.models import InboxItem, Project, Task


async def _inbox_project_id(session) -> int | None:
    row = await session.execute(select(Project.id).where(Project.is_inbox.is_(True)))
    return row.scalar_one_or_none()


async def create_task(session, *, title: str, project_id: int | None = None, **fields) -> Task:
    if project_id is None:
        project_id = await _inbox_project_id(session)
    task = Task(title=title, project_id=project_id, **fields)
    session.add(task)
    await session.flush()
    return task


async def list_tasks(session, *, scope: str = "all", project_id: int | None = None) -> list[Task]:
    stmt = select(Task).where(Task.status != "archived")
    if scope == "today":
        stmt = stmt.where(Task.due_date == date.today(), Task.status != "done")
    elif scope == "week":
        end = date.today() + timedelta(days=7)
        stmt = stmt.where(Task.due_date >= date.today(), Task.due_date <= end, Task.status != "done")
    elif scope == "inbox":
        inbox_id = await _inbox_project_id(session)
        stmt = stmt.where(Task.project_id == inbox_id)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    stmt = stmt.order_by(Task.due_date.is_(None), Task.due_date, Task.due_time, Task.order_index)
    rows = await session.execute(stmt)
    return list(rows.scalars().all())


async def set_status(session, task_id: int, status: str) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise ValueError("task not found")
    task.status = status
    task.done_at = datetime.now(UTC) if status == "done" else None
    await session.flush()
    return task


async def triage_inbox(session, inbox_id: int, *, project_id: int, title: str, **fields) -> Task:
    item = await session.get(InboxItem, inbox_id)
    if item is None:
        raise ValueError("inbox item not found")
    task = Task(title=title, project_id=project_id, source=item.source, **fields)
    session.add(task)
    item.status = "triaged"
    await session.flush()
    return task
```

- [ ] **Step 4: Запустить — PASS** (4 теста). `pytest -q` зелёное.

- [ ] **Step 5: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/src/planner/services/__init__.py planner-v2/src/planner/services/tasks.py planner-v2/tests/test_tasks_service.py
git commit -m "feat(planner-v2): tasks service (create/list/status/triage)"
```

---

## Task 5: Сервис Inbox (capture)

**Files:** Create `src/planner/services/inbox.py`. Test: `tests/test_inbox_service.py`.

- [ ] **Step 1: Падающий тест `tests/test_inbox_service.py`**
```python
import pytest

from planner.services import inbox as svc


@pytest.mark.asyncio
async def test_capture_text(db_session):
    item = await svc.capture(db_session, kind="text", raw_content="купить молоко")
    assert item.id is not None
    assert item.status == "new"
    assert item.kind == "text"


@pytest.mark.asyncio
async def test_capture_link_with_attachment(db_session):
    item = await svc.capture(
        db_session, kind="link", raw_content="https://habr.com/x",
        attachment={"kind": "link", "url_or_fileid": "https://habr.com/x"},
    )
    assert item.kind == "link"
    assert len(await svc.list_new(db_session)) == 1
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализация `src/planner/services/inbox.py`**
```python
from __future__ import annotations

from sqlalchemy import select

from planner.db.models import Attachment, InboxItem


async def capture(
    session, *, kind: str, raw_content: str, source: str = "manual",
    attachment: dict | None = None,
) -> InboxItem:
    item = InboxItem(kind=kind, source=source, raw_content=raw_content)
    session.add(item)
    await session.flush()
    if attachment is not None:
        att = Attachment(inbox_item_id=item.id, **attachment)
        session.add(att)
        await session.flush()
    return item


async def list_new(session) -> list[InboxItem]:
    rows = await session.execute(
        select(InboxItem).where(InboxItem.status == "new").order_by(InboxItem.created_at.desc())
    )
    return list(rows.scalars().all())
```

- [ ] **Step 4: Запустить — PASS** (2 теста). `pytest -q` зелёное.

- [ ] **Step 5: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/src/planner/services/inbox.py planner-v2/tests/test_inbox_service.py
git commit -m "feat(planner-v2): inbox capture service"
```

---

## Task 6: API роутеры (projects/tasks/inbox)

**Files:** Create `src/planner/api/schemas.py`, `src/planner/api/routes/projects.py`, `.../tasks.py`, `.../inbox.py`. Modify `src/planner/api/deps.py`, `src/planner/api/app.py`. Test: `tests/test_api_tasks.py`, `tests/test_api_inbox.py`.

- [ ] **Step 1: Падающие тесты**

`tests/test_api_tasks.py`:
```python
import pytest_asyncio
from fastapi.testclient import TestClient

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


@pytest_asyncio.fixture
async def client(db_engine, db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.commit()
    app = create_app()

    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


def test_create_and_list_task(client):
    r = client.post("/api/tasks", json={"title": "купить молоко"}, headers=HDR)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    lst = client.get("/api/tasks?scope=all", headers=HDR)
    assert lst.status_code == 200
    assert any(t["id"] == tid for t in lst.json())


def test_task_requires_auth(client):
    assert client.get("/api/tasks").status_code == 401
```

`tests/test_api_inbox.py`:
```python
import pytest_asyncio
from fastapi.testclient import TestClient

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


@pytest_asyncio.fixture
async def client(db_engine, db_session):
    db_session.add(Project(name="Inbox", slug="inbox", is_inbox=True))
    await db_session.commit()
    app = create_app()

    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


def test_inbox_list_empty(client):
    r = client.get("/api/inbox", headers=HDR)
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализация**

`src/planner/api/deps.py` (заменить весь файл):
```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from planner.config import get_settings
from planner.db.session import get_session

__all__ = ["get_settings", "get_db"]


async def get_db() -> AsyncIterator[AsyncSession]:
    async for s in get_session():
        yield s
```

`src/planner/api/schemas.py`:
```python
from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    project_id: int | None = None
    priority: str = "none"
    due_date: date | None = None
    due_time: time | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    project_id: int | None
    priority: str
    status: str
    due_date: date | None
    due_time: time | None

    model_config = {"from_attributes": True}


class TaskPatch(BaseModel):
    status: str | None = None
    priority: str | None = None
    project_id: int | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    is_inbox: bool

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    slug: str
    color: str | None = None


class InboxOut(BaseModel):
    id: int
    kind: str
    source: str
    raw_content: str
    status: str

    model_config = {"from_attributes": True}


class TriageIn(BaseModel):
    project_id: int
    title: str
    priority: str = "none"
    due_date: date | None = None
```

`src/planner/api/routes/projects.py`:
```python
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import ProjectCreate, ProjectOut
from planner.db.models import Project

router = APIRouter(prefix="/api/projects")


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = await db.execute(select(Project).where(Project.archived.is_(False)).order_by(Project.name))
    return rows.scalars().all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    proj = Project(name=payload.name, slug=payload.slug, color=payload.color)
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return proj
```

`src/planner/api/routes/tasks.py`:
```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import TaskCreate, TaskOut, TaskPatch
from planner.services import tasks as svc

router = APIRouter(prefix="/api/tasks")


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: str = "all",
    project_id: int | None = None,
):
    return await svc.list_tasks(db, scope=scope, project_id=project_id)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    t = await svc.create_task(
        db, title=payload.title, project_id=payload.project_id,
        priority=payload.priority, due_date=payload.due_date, due_time=payload.due_time,
    )
    await db.commit()
    await db.refresh(t)
    return t


@router.patch("/{task_id}", response_model=TaskOut)
async def patch_task(
    task_id: int,
    payload: TaskPatch,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.status is not None:
        try:
            t = await svc.set_status(db, task_id, payload.status)
        except ValueError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    else:
        from planner.db.models import Task
        t = await db.get(Task, task_id)
        if t is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    if payload.priority is not None:
        t.priority = payload.priority
    if payload.project_id is not None:
        t.project_id = payload.project_id
    await db.commit()
    await db.refresh(t)
    return t
```

`src/planner/api/routes/inbox.py`:
```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import InboxOut, TaskOut, TriageIn
from planner.services import inbox as inbox_svc
from planner.services import tasks as tasks_svc

router = APIRouter(prefix="/api/inbox")


@router.get("", response_model=list[InboxOut])
async def list_inbox(
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await inbox_svc.list_new(db)


@router.post("/{item_id}/triage", response_model=TaskOut)
async def triage(
    item_id: int,
    payload: TriageIn,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    t = await tasks_svc.triage_inbox(
        db, item_id, project_id=payload.project_id, title=payload.title,
        priority=payload.priority, due_date=payload.due_date,
    )
    await db.commit()
    await db.refresh(t)
    return t
```

`src/planner/api/app.py` (заменить весь файл):
```python
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from planner.api.routes import health, inbox, me, projects, tasks


def create_app() -> FastAPI:
    app = FastAPI(title="planner-v2")
    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(projects.router)
    app.include_router(tasks.router)
    app.include_router(inbox.router)

    dist = os.environ.get("MINI_APP_DIST_DIR", "frontend/dist")
    if os.path.isdir(dist):
        app.mount("/app", StaticFiles(directory=dist, html=True), name="miniapp")
    return app


app = create_app()
```

- [ ] **Step 4: Запустить — PASS.** Затем `pytest -q` (всё зелёное; ~19 тестов).

Замечание про сессию в тестах: тестовый `db_session` переопределяет `get_db`, поэтому `await db.commit()` в роутерах коммитит в ту же in-memory транзакцию. Если commit рвёт фикстуру (sqlite), и тест падает с "operation in progress" — заменить в тестовой фикстуре `commit` на `flush` через отдельный объект НЕ нужно; вместо этого фикстура отдаёт сессию, а роутер коммитит — для sqlite in-memory это работает в одном соединении. Если возникнет проблема изоляции, сделать движок `create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})` в conftest. Применить этот фикс при необходимости.

- [ ] **Step 5: Commit**
```bash
cd "/Users/logovik/ИИ-агenты/Projects/Alexandr/personal-planner"
git add planner-v2/src/planner/api/ planner-v2/tests/test_api_tasks.py planner-v2/tests/test_api_inbox.py
git commit -m "feat(planner-v2): projects/tasks/inbox REST API (owner-gated)"
```

---

## Task 7: Бот-захват (text/url/photo -> Inbox)

**Files:** Create `src/planner/bot/handlers/capture.py`. Modify `src/planner/bot/main.py`. Test: `tests/test_bot_capture.py`.

- [ ] **Step 1: Падающий тест (классификация типа сообщения чистой функцией) `tests/test_bot_capture.py`**
```python
from planner.bot.handlers.capture import classify_text


def test_classify_url():
    assert classify_text("https://habr.com/x") == "link"
    assert classify_text("смотри тут http://a.b/c круто") == "link"


def test_classify_plain_text():
    assert classify_text("купить молоко") == "text"
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализация `src/planner/bot/handlers/capture.py`**
```python
from __future__ import annotations

import re

from aiogram import Router
from aiogram.types import Message

from planner.db.session import get_session
from planner.services import inbox as inbox_svc

router = Router()

_URL_RE = re.compile(r"https?://\S+")


def classify_text(text: str) -> str:
    return "link" if _URL_RE.search(text) else "text"


async def _capture_and_ack(message: Message, *, kind: str, raw: str, attachment: dict | None = None) -> None:
    async for session in get_session():
        await inbox_svc.capture(session, kind=kind, raw_content=raw, attachment=attachment)
        await session.commit()
    await message.answer("Принято в Inbox. Разобрать можно в Mini App.")


@router.message(lambda m: m.photo is not None)
async def on_photo(message: Message) -> None:
    file_id = message.photo[-1].file_id
    cap = message.caption or ""
    await _capture_and_ack(
        message, kind="photo", raw=cap,
        attachment={"kind": "photo", "url_or_fileid": file_id},
    )


@router.message(lambda m: m.text is not None and not m.text.startswith("/"))
async def on_text(message: Message) -> None:
    text = message.text or ""
    kind = classify_text(text)
    att = {"kind": "link", "url_or_fileid": _URL_RE.search(text).group(0)} if kind == "link" else None
    await _capture_and_ack(message, kind=kind, raw=text, attachment=att)
```

- [ ] **Step 4: Подключить в `src/planner/bot/main.py`** — добавить импорт и include роутера ПОСЛЕ start.router (порядок важен: команды раньше общего текста):
```python
from planner.bot.handlers import capture, start
```
и в `run()` после `dp.include_router(start.router)` добавить:
```python
    dp.include_router(capture.router)
```

- [ ] **Step 5: Запустить — PASS** (2 теста) + импорт-проверка бота:
```bash
cd planner-v2 && source .venv/bin/activate && pytest tests/test_bot_capture.py -v
TELEGRAM_BOT_TOKEN=x OWNER_TELEGRAM_ID=1 DATABASE_URL=postgresql+asyncpg://u:p@localhost/db python -c "from planner.bot.main import main; print('ok')"
```
Затем `pytest -q` — всё зелёное.

- [ ] **Step 6: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/src/planner/bot/handlers/capture.py planner-v2/src/planner/bot/main.py planner-v2/tests/test_bot_capture.py
git commit -m "feat(planner-v2): bot capture (text/url/photo) into Inbox"
```

---

## Definition of Done (Phase 1)
- [ ] `pytest -q` зелёный (Phase 0 + новые: models, services, API, capture).
- [ ] Миграция создаёт 6 таблиц + сид Inbox; `alembic upgrade head` проходит на Postgres.
- [ ] API: создать/список/патч задач, список проектов/создать, список Inbox + triage — все owner-gated (401 без initData).
- [ ] Бот: текст/ссылка/фото от владельца -> запись в Inbox + ack.
- [ ] Сервисы не дергаются из роутеров SQL-ом напрямую (вся логика в services/).

## NOT in scope (Phase 1)
- AI-парсинг полей при захвате -> Phase 4 (сейчас raw -> Inbox, разбор вручную через triage).
- Goals/habits/notes -> Phase 3. Calendar drag, recurrence-движок, reminders-cron -> позже.
- Mini App экраны -> Phase 2.

## Self-Review
- Покрытие спеки: разделы 5 (data model: project/task/tag/inbox_item/attachment) и 6.1/6.2 (захват + триаж) Phase 1 реализует. source-поле под фильтры "Мои"/"Из сессий" присутствует.
- Плейсхолдеры: нет; код полный. parsed_json/suggested_project_id зарезервированы под Phase 4 (AI), сейчас не заполняются — это осознанно.
- Согласованность типов: `create_task`/`list_tasks`/`set_status`/`triage_inbox` сигнатуры совпадают между сервисом, роутерами и тестами; `get_db` определён в deps и переопределяется в тестах.
