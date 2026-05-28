# Planner v2 — Phase 0: Фундамент / каркас (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose up` поднимает planner-v2: Postgres + FastAPI (health + owner-auth) + aiogram-бот (отвечает на /start владельцу) + React Mini App shell, отдаваемый FastAPI и доступный по HTTPS через Caddy+sslip.io.

**Architecture:** Чистый rebuild по образцу Ledger. Новый код в `personal-planner/planner-v2/`, v1 (`planner-bot/`) трогаем только как референс. FastAPI отдаёт собранный `frontend/dist` как статику. Бот — отдельный процесс (aiogram). Single-user: всё под одним владельцем (allow-list по telegram_id), Mini App аутентифицируется через Telegram WebApp initData (HMAC-SHA256, как в Ledger `src/ledger/api/auth.py`).

**Tech Stack:** Python 3.12, aiogram 3.x, FastAPI, SQLAlchemy 2 async + asyncpg, Alembic, pydantic-settings, structlog, React+TS+Vite, Docker Compose, Caddy (sslip.io HTTPS). LLM не подключаем в этой фазе.

**Примечание:** без emoji в этом документе (баг суррогатных пар ронял чат). Идентификаторы — английские.

---

## File Structure (создаётся в этой фазе)

```
personal-planner/planner-v2/
  pyproject.toml                  # deps, ruff, pytest
  .env.example                    # шаблон секретов
  .gitignore
  Dockerfile                      # образ app (api + bot)
  docker-compose.yml              # dev: postgres + redis
  docker-compose.prod.yml         # prod: postgres+redis+migrate+api+bot+caddy
  Caddyfile                       # sslip.io reverse proxy -> api:8000
  alembic.ini
  alembic/
    env.py
    versions/                     # миграции
  src/planner/
    __init__.py
    config.py                     # Settings (pydantic-settings)
    db/
      __init__.py
      base.py                     # DeclarativeBase
      session.py                  # async engine + sessionmaker + get_session
    api/
      __init__.py
      app.py                      # FastAPI + static mini app + /api/health
      auth.py                     # verify_init_data + require_owner
      deps.py                     # get_settings
      routes/
        __init__.py
        health.py                 # GET /api/health
        me.py                     # GET /api/me (require_owner)
    bot/
      __init__.py
      main.py                     # aiogram entry (long-polling)
      handlers/
        __init__.py
        start.py                  # /start (owner allow-list)
      middlewares/
        __init__.py
        allowlist.py              # отбрасывает не-владельца
  tests/
    conftest.py
    test_config.py
    test_auth_initdata.py
    test_api_health.py
    test_api_me.py
    test_bot_start.py
  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      api.ts                      # fetch с X-Telegram-Init-Data
  docs/runbooks/phase0-deploy.md
```

---

## Pre-task: рабочая папка

Все пути ниже относительно `personal-planner/planner-v2/`. Создать её и войти.

- [ ] **Step 1: Создать каркас папок**

```bash
cd "personal-planner"
mkdir -p planner-v2/src/planner/{db,api/routes,bot/handlers,bot/middlewares}
mkdir -p planner-v2/tests planner-v2/alembic/versions planner-v2/frontend/src planner-v2/docs/runbooks
cd planner-v2
git rev-parse --show-toplevel  # подтвердить, что мы в репо personal-planner
```

Expected: путь к репо personal-planner.

---

## Task 1: pyproject + tooling

**Files:**
- Create: `pyproject.toml`, `.gitignore`

- [ ] **Step 1: Написать `pyproject.toml`**

```toml
[project]
name = "planner-v2"
version = "0.1.0"
description = "Личный life-OS: Telegram Mini App + бот + AI-копайлот"
requires-python = ">=3.12"
dependencies = [
    "aiogram>=3.4",
    "fastapi>=0.110",
    "uvicorn[standard]>=0.27",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.29",
    "alembic>=1.13",
    "pydantic>=2.6",
    "pydantic-settings>=2.2",
    "httpx>=0.27",
    "structlog>=24.1",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "ruff>=0.4",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/planner"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["src"]

[tool.ruff]
line-length = 100
target-version = "py312"
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "N", "RUF"]
ignore = ["RUF001", "RUF002", "RUF003"]

[tool.ruff.lint.per-file-ignores]
"src/planner/api/**" = ["B008"]
```

- [ ] **Step 2: Написать `.gitignore`**

```
__pycache__/
*.pyc
.venv/
.env
node_modules/
frontend/dist/
.pytest_cache/
.ruff_cache/
```

- [ ] **Step 3: Создать venv и поставить зависимости**

Run:
```bash
python3.12 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
```
Expected: установка без ошибок.

- [ ] **Step 4: Commit**

```bash
git add planner-v2/pyproject.toml planner-v2/.gitignore
git commit -m "chore(planner-v2): project skeleton + pyproject"
```

---

## Task 2: Config (pydantic-settings)

**Files:**
- Create: `src/planner/__init__.py`, `src/planner/config.py`, `.env.example`
- Test: `tests/test_config.py`

- [ ] **Step 1: Написать падающий тест**

`tests/test_config.py`:
```python
from planner.config import Settings


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:abc")
    monkeypatch.setenv("OWNER_TELEGRAM_ID", "555")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    s = Settings()
    assert s.telegram_bot_token == "123:abc"
    assert s.owner_telegram_id == 555
    assert s.mini_app_initdata_max_age_sec == 86400  # дефолт
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `pytest tests/test_config.py -v`
Expected: FAIL (ModuleNotFoundError: planner.config).

- [ ] **Step 3: Реализация**

`src/planner/__init__.py`:
```python
```
(пустой файл)

`src/planner/config.py`:
```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telegram_bot_token: str
    owner_telegram_id: int
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    mini_app_initdata_max_age_sec: int = 86400
    mini_app_dist_dir: str = "frontend/dist"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Написать `.env.example`**

```
TELEGRAM_BOT_TOKEN=
OWNER_TELEGRAM_ID=
DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner
REDIS_URL=redis://localhost:6379/0
MINI_APP_INITDATA_MAX_AGE_SEC=86400
MINI_APP_DIST_DIR=frontend/dist
LOG_LEVEL=INFO
```

- [ ] **Step 5: Запустить тест — должен пройти**

Run: `pytest tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add planner-v2/src/planner/__init__.py planner-v2/src/planner/config.py planner-v2/tests/test_config.py planner-v2/.env.example
git commit -m "feat(planner-v2): config via pydantic-settings"
```

---

## Task 3: Telegram initData auth (security-critical)

Мы повторяем алгоритм Ledger `src/ledger/api/auth.py`: secret_key = HMAC_SHA256("WebAppData", bot_token); data_check_string = sorted "k=v" join "\n"; expected = HMAC_SHA256(secret_key, data_check_string).hex(); сверка постоянным временем; проверка свежести auth_date и user.id == owner.

**Files:**
- Create: `src/planner/api/__init__.py`, `src/planner/api/auth.py`
- Test: `tests/test_auth_initdata.py`

- [ ] **Step 1: Написать падающий тест (с генератором валидной initData)**

`tests/test_auth_initdata.py`:
```python
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from planner.api.auth import InitDataError, verify_init_data

BOT_TOKEN = "123456:TESTTOKEN"
OWNER = 555


def make_init_data(user_id=OWNER, auth_date=None, token=BOT_TOKEN):
    auth_date = auth_date if auth_date is not None else int(time.time())
    user = json.dumps({"id": user_id, "first_name": "Sasha"})
    fields = {"auth_date": str(auth_date), "user": user}
    dcs = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    fields["hash"] = h
    return urlencode(fields)


def test_valid_initdata_returns_owner():
    u = verify_init_data(make_init_data(), bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)
    assert u.id == OWNER
    assert u.first_name == "Sasha"


def test_bad_signature_rejected():
    bad = make_init_data(token="999:WRONG")
    with pytest.raises(InitDataError):
        verify_init_data(bad, bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)


def test_stale_initdata_rejected():
    stale = make_init_data(auth_date=int(time.time()) - 100000)
    with pytest.raises(InitDataError):
        verify_init_data(stale, bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)


def test_non_owner_rejected():
    other = make_init_data(user_id=999)
    with pytest.raises(InitDataError):
        verify_init_data(other, bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)
```

- [ ] **Step 2: Запустить тест — упадёт**

Run: `pytest tests/test_auth_initdata.py -v`
Expected: FAIL (нет модуля planner.api.auth).

- [ ] **Step 3: Реализация**

`src/planner/api/__init__.py`:
```python
```
(пустой)

`src/planner/api/auth.py`:
```python
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Annotated
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException, status

from planner.config import Settings, get_settings


@dataclass(frozen=True)
class TelegramUser:
    id: int
    first_name: str | None
    last_name: str | None
    username: str | None
    language_code: str | None


class InitDataError(ValueError):
    """initData невалидна (структура / подпись / срок / чужой юзер)."""


def verify_init_data(
    init_data: str,
    *,
    bot_token: str,
    owner_id: int,
    max_age_sec: int,
    now_ts: float | None = None,
) -> TelegramUser:
    if not init_data:
        raise InitDataError("пусто")

    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = fields.pop("hash", None)
    if not received_hash:
        raise InitDataError("нет поля hash")

    data_check_string = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    expected_hash = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise InitDataError("неверная подпись")

    auth_date_raw = fields.get("auth_date")
    if not auth_date_raw:
        raise InitDataError("нет auth_date")
    try:
        auth_date = int(auth_date_raw)
    except ValueError as exc:
        raise InitDataError("auth_date не число") from exc

    now = now_ts if now_ts is not None else time.time()
    if now - auth_date > max_age_sec:
        raise InitDataError("initData протух")
    if auth_date > now + 60:
        raise InitDataError("auth_date в будущем")

    user_raw = fields.get("user")
    if not user_raw:
        raise InitDataError("нет user")
    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise InitDataError("user не JSON") from exc

    try:
        user_id = int(user_data["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise InitDataError("user.id отсутствует") from exc

    if user_id != owner_id:
        raise InitDataError("не владелец")

    return TelegramUser(
        id=user_id,
        first_name=user_data.get("first_name"),
        last_name=user_data.get("last_name"),
        username=user_data.get("username"),
        language_code=user_data.get("language_code"),
    )


async def require_owner(
    x_telegram_init_data: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> TelegramUser:
    if not x_telegram_init_data:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Telegram-Init-Data header is required")
    try:
        return verify_init_data(
            x_telegram_init_data,
            bot_token=settings.telegram_bot_token,
            owner_id=settings.owner_telegram_id,
            max_age_sec=settings.mini_app_initdata_max_age_sec,
        )
    except InitDataError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
```

- [ ] **Step 4: Запустить тест — пройдёт**

Run: `pytest tests/test_auth_initdata.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add planner-v2/src/planner/api/__init__.py planner-v2/src/planner/api/auth.py planner-v2/tests/test_auth_initdata.py
git commit -m "feat(planner-v2): Telegram Mini App initData auth (owner-only)"
```

---

## Task 4: DB base + async session

**Files:**
- Create: `src/planner/db/__init__.py`, `src/planner/db/base.py`, `src/planner/db/session.py`

- [ ] **Step 1: Реализация (boilerplate, без отдельного теста — проверяется в Task 5/миграциях)**

`src/planner/db/__init__.py`:
```python
```
(пустой)

`src/planner/db/base.py`:
```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

`src/planner/db/session.py`:
```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planner.config import get_settings

_engine = None
_sessionmaker = None


def _init() -> None:
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    _init()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session
```

- [ ] **Step 2: Проверка импорта**

Run: `python -c "from planner.db.session import get_session; from planner.db.base import Base; print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add planner-v2/src/planner/db/
git commit -m "feat(planner-v2): async SQLAlchemy base + session"
```

---

## Task 5: FastAPI app (health + me + static Mini App)

**Files:**
- Create: `src/planner/api/deps.py`, `src/planner/api/routes/__init__.py`, `src/planner/api/routes/health.py`, `src/planner/api/routes/me.py`, `src/planner/api/app.py`
- Test: `tests/conftest.py`, `tests/test_api_health.py`, `tests/test_api_me.py`

- [ ] **Step 1: Написать падающие тесты**

`tests/conftest.py`:
```python
import os

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TESTTOKEN")
os.environ.setdefault("OWNER_TELEGRAM_ID", "555")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://planner:planner@localhost:5432/planner")
```

`tests/test_api_health.py`:
```python
from fastapi.testclient import TestClient

from planner.api.app import create_app


def test_health_ok():
    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

`tests/test_api_me.py`:
```python
from fastapi.testclient import TestClient

from planner.api.app import create_app
from tests.test_auth_initdata import make_init_data


def test_me_requires_initdata():
    client = TestClient(create_app())
    assert client.get("/api/me").status_code == 401


def test_me_returns_owner():
    client = TestClient(create_app())
    r = client.get("/api/me", headers={"X-Telegram-Init-Data": make_init_data()})
    assert r.status_code == 200
    assert r.json()["id"] == 555
```

- [ ] **Step 2: Запустить — упадут**

Run: `pytest tests/test_api_health.py tests/test_api_me.py -v`
Expected: FAIL (нет planner.api.app).

- [ ] **Step 3: Реализация**

`src/planner/api/deps.py`:
```python
from planner.config import get_settings

__all__ = ["get_settings"]
```

`src/planner/api/routes/__init__.py`:
```python
```
(пустой)

`src/planner/api/routes/health.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

`src/planner/api/routes/me.py`:
```python
from typing import Annotated

from fastapi import APIRouter, Depends

from planner.api.auth import TelegramUser, require_owner

router = APIRouter()


@router.get("/api/me")
async def me(user: Annotated[TelegramUser, Depends(require_owner)]) -> dict:
    return {"id": user.id, "first_name": user.first_name, "username": user.username}
```

`src/planner/api/app.py`:
```python
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from planner.api.routes import health, me


def create_app() -> FastAPI:
    app = FastAPI(title="planner-v2")
    app.include_router(health.router)
    app.include_router(me.router)

    dist = os.environ.get("MINI_APP_DIST_DIR", "frontend/dist")
    if os.path.isdir(dist):
        app.mount("/app", StaticFiles(directory=dist, html=True), name="miniapp")
    return app


app = create_app()
```

- [ ] **Step 4: Запустить — пройдут**

Run: `pytest tests/test_api_health.py tests/test_api_me.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add planner-v2/src/planner/api/ planner-v2/tests/conftest.py planner-v2/tests/test_api_health.py planner-v2/tests/test_api_me.py
git commit -m "feat(planner-v2): FastAPI app with health, owner /me, static mini app mount"
```

---

## Task 6: aiogram бот (start, allow-list)

**Files:**
- Create: `src/planner/bot/__init__.py`, `src/planner/bot/handlers/__init__.py`, `src/planner/bot/handlers/start.py`, `src/planner/bot/middlewares/__init__.py`, `src/planner/bot/middlewares/allowlist.py`, `src/planner/bot/main.py`
- Test: `tests/test_bot_start.py`

- [ ] **Step 1: Написать падающий тест (логика приветствия чистой функцией)**

`tests/test_bot_start.py`:
```python
from planner.bot.handlers.start import greeting_text, is_owner


def test_is_owner():
    assert is_owner(555, owner_id=555) is True
    assert is_owner(999, owner_id=555) is False


def test_greeting_mentions_name():
    txt = greeting_text("Sasha")
    assert "Sasha" in txt
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pytest tests/test_bot_start.py -v`
Expected: FAIL.

- [ ] **Step 3: Реализация**

`src/planner/bot/__init__.py`, `src/planner/bot/handlers/__init__.py`, `src/planner/bot/middlewares/__init__.py`:
```python
```
(пустые)

`src/planner/bot/handlers/start.py`:
```python
from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

router = Router()


def is_owner(user_id: int, *, owner_id: int) -> bool:
    return user_id == owner_id


def greeting_text(name: str | None) -> str:
    who = name or "там"
    return f"Привет, {who}. Это твой планнер. Кидай задачи сюда, разберём в Mini App."


@router.message(CommandStart())
async def on_start(message: Message) -> None:
    await message.answer(greeting_text(message.from_user.first_name if message.from_user else None))
```

`src/planner/bot/middlewares/allowlist.py`:
```python
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Update


class AllowlistMiddleware(BaseMiddleware):
    def __init__(self, owner_id: int) -> None:
        self.owner_id = owner_id

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        if user is not None and user.id != self.owner_id:
            return None  # игнорируем чужих молча
        return await handler(event, data)
```

`src/planner/bot/main.py`:
```python
import asyncio

import structlog
from aiogram import Bot, Dispatcher

from planner.bot.handlers import start
from planner.bot.middlewares.allowlist import AllowlistMiddleware
from planner.config import get_settings

log = structlog.get_logger()


async def run() -> None:
    settings = get_settings()
    bot = Bot(settings.telegram_bot_token)
    dp = Dispatcher()
    dp.update.middleware(AllowlistMiddleware(settings.owner_telegram_id))
    dp.include_router(start.router)
    log.info("planner-bot started")
    await dp.start_polling(bot)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `pytest tests/test_bot_start.py -v`
Expected: 2 passed. Затем весь набор: `pytest -q` -> все зелёные.

- [ ] **Step 5: Commit**

```bash
git add planner-v2/src/planner/bot/ planner-v2/tests/test_bot_start.py
git commit -m "feat(planner-v2): aiogram bot skeleton (start + owner allowlist)"
```

---

## Task 7: Alembic init + baseline миграция

В этой фазе доменных таблиц ещё нет (они в Phase 1). Делаем рабочую alembic-инфраструктуру + пустую baseline-ревизию, чтобы `alembic upgrade head` проходил в docker.

**Files:**
- Create: `alembic.ini`, `alembic/env.py`, baseline-ревизия в `alembic/versions/`

- [ ] **Step 1: Инициализировать alembic**

Run: `alembic init -t async alembic`
Затем заменить сгенерированный `alembic.ini` строку с `sqlalchemy.url` на пустую (url берём из env в `env.py`).

- [ ] **Step 2: Настроить `alembic/env.py`**

Заменить содержимое на async-вариант, читающий `DATABASE_URL` из окружения и `target_metadata = Base.metadata`:
```python
import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from planner.db.base import Base
import planner.db  # noqa: F401  (точка для импорта моделей в Phase 1)

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def _url() -> str:
    return os.environ["DATABASE_URL"]


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _do(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_url())
    async with engine.connect() as conn:
        await conn.run_sync(_do)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 3: Создать пустую baseline-ревизию**

Run: `DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner alembic revision -m "baseline"`
Открыть созданный файл в `alembic/versions/`, оставить `upgrade()`/`downgrade()` с `pass`.

- [ ] **Step 4: Проверить применение (нужен поднятый Postgres — см. Task 8 dev compose)**

Run:
```bash
docker compose up -d postgres
DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner alembic upgrade head
```
Expected: `Running upgrade -> <rev>, baseline`.

- [ ] **Step 5: Commit**

```bash
git add planner-v2/alembic.ini planner-v2/alembic/
git commit -m "chore(planner-v2): alembic async setup + baseline migration"
```

---

## Task 8: Docker (dev + prod) + Caddy

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `Caddyfile`

- [ ] **Step 1: `docker-compose.yml` (dev: postgres + redis)**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: planner-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: planner
      POSTGRES_PASSWORD: planner
      POSTGRES_DB: planner
    ports: ["5432:5432"]
    volumes: ["planner_pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U planner -d planner"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: planner-redis
    restart: unless-stopped
    ports: ["6379:6379"]
    volumes: ["planner_redisdata:/data"]

volumes:
  planner_pgdata:
  planner_redisdata:
```

- [ ] **Step 2: `Dockerfile` (образ app: api + bot, со встроенным frontend/dist)**

```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY --from=frontend /fe/dist ./frontend/dist
ENV MINI_APP_DIST_DIR=/app/frontend/dist
CMD ["uvicorn", "planner.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: `Caddyfile` (sslip.io, рядом с ledger)**

Замени `188-245-42-4` на дефисную форму IP VPS. Хост отличается от ledger (`planner-` префикс), чтобы два сайта жили на одном Caddy без конфликта.
```
planner-188-245-42-4.sslip.io {
    encode gzip
    reverse_proxy planner-api:8000
    log {
        output stdout
        format console
    }
}
```

- [ ] **Step 4: `docker-compose.prod.yml`**

```yaml
services:
  planner-postgres:
    image: postgres:16
    container_name: planner-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: planner
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-planner}
      POSTGRES_DB: planner
    volumes: ["planner_pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U planner -d planner"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [planner_net]

  planner-redis:
    image: redis:7-alpine
    container_name: planner-redis
    restart: unless-stopped
    volumes: ["planner_redisdata:/data"]
    networks: [planner_net]

  planner-migrate:
    build: .
    image: planner-app:latest
    container_name: planner-migrate
    command: ["alembic", "upgrade", "head"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql+asyncpg://planner:${POSTGRES_PASSWORD:-planner}@planner-postgres:5432/planner
    depends_on:
      planner-postgres: { condition: service_healthy }
    networks: [planner_net]
    restart: "no"

  planner-api:
    image: planner-app:latest
    container_name: planner-api
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql+asyncpg://planner:${POSTGRES_PASSWORD:-planner}@planner-postgres:5432/planner
      REDIS_URL: redis://planner-redis:6379/0
      MINI_APP_DIST_DIR: /app/frontend/dist
    depends_on:
      planner-migrate: { condition: service_completed_successfully }
    networks: [planner_net]

  planner-bot:
    image: planner-app:latest
    container_name: planner-bot
    restart: unless-stopped
    command: ["python", "-m", "planner.bot.main"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql+asyncpg://planner:${POSTGRES_PASSWORD:-planner}@planner-postgres:5432/planner
      REDIS_URL: redis://planner-redis:6379/0
    depends_on:
      planner-api: { condition: service_started }
    networks: [planner_net]

  planner-caddy:
    image: caddy:2-alpine
    container_name: planner-caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - planner_caddy_data:/data
      - planner_caddy_config:/config
    depends_on: [planner-api]
    networks: [planner_net]

volumes:
  planner_pgdata:
  planner_redisdata:
  planner_caddy_data:
  planner_caddy_config:

networks:
  planner_net:
    driver: bridge
```

Примечание: на VPS уже занят 80/443 caddy от ledger. Перед деплоем решить — общий Caddy на двоих (один контейнер, два site-блока) или порты. Зафиксировано как deploy-предусловие.

- [ ] **Step 5: Проверка dev-сборки**

Run: `docker compose up -d postgres redis && docker compose ps`
Expected: оба healthy.

- [ ] **Step 6: Commit**

```bash
git add planner-v2/Dockerfile planner-v2/docker-compose.yml planner-v2/docker-compose.prod.yml planner-v2/Caddyfile
git commit -m "chore(planner-v2): docker dev+prod compose, Dockerfile, Caddy sslip.io"
```

---

## Task 9: Frontend Mini App shell (React + Vite)

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/api.ts`

- [ ] **Step 1: `frontend/package.json`**

```json
{
  "name": "planner-miniapp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/telegram-web-app": "^7.10.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: `frontend/vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  build: { target: "es2022", sourcemap: true },
});
```

- [ ] **Step 3: `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["telegram-web-app"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `frontend/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <title>Planner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `frontend/src/api.ts`**

```ts
export function initData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

export async function getMe(): Promise<{ id: number; first_name: string | null }> {
  const r = await fetch("/api/me", { headers: { "X-Telegram-Init-Data": initData() } });
  if (!r.ok) throw new Error(`me failed: ${r.status}`);
  return r.json();
}
```

- [ ] **Step 6: `frontend/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getMe } from "./api";

export default function App() {
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    getMe().then((m) => setName(m.first_name)).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div style={{ padding: 24 }}>Ошибка авторизации: {err}</div>;
  return <div style={{ padding: 24 }}>Planner v2. Привет, {name ?? "..."}.</div>;
}
```

- [ ] **Step 7: `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Сборка**

Run: `cd frontend && npm install && npm run build`
Expected: `dist/` создан, без ошибок tsc.

- [ ] **Step 9: Commit**

```bash
git add planner-v2/frontend/package.json planner-v2/frontend/package-lock.json planner-v2/frontend/tsconfig.json planner-v2/frontend/vite.config.ts planner-v2/frontend/index.html planner-v2/frontend/src/
git commit -m "feat(planner-v2): React+Vite Mini App shell with Telegram auth"
```

---

## Task 10: Runbook деплоя Phase 0

**Files:**
- Create: `docs/runbooks/phase0-deploy.md`

- [ ] **Step 1: Написать runbook**

`docs/runbooks/phase0-deploy.md`:
```markdown
# Phase 0 deploy

## Локально
1. `cp .env.example .env`, заполнить TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_ID.
2. `docker compose up -d postgres redis`
3. `DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner alembic upgrade head`
4. API: `uvicorn planner.api.app:app --reload` ; бот: `python -m planner.bot.main`
5. Mini App dev: `cd frontend && npm run dev` (проксирует /api на :8000).

## BotFather (привязка Mini App к боту)
1. /newbot (или взять токен v2) -> TELEGRAM_BOT_TOKEN.
2. /setmenubutton (или Bot Settings -> Menu Button) -> URL =
   https://planner-<ip-dashes>.sslip.io/app/
3. Узнать свой OWNER_TELEGRAM_ID (например через @userinfobot) -> в .env.

## VPS (prod)
1. На VPS: склонировать/обновить repo, положить .env.
2. Решить вопрос с Caddy: ledger уже слушает 80/443. Варианты:
   - объединить в один Caddyfile два site-блока (ledger + planner) и один контейнер caddy;
   - либо отдельная сеть и проксирование. (предусловие деплоя)
3. `docker compose -f docker-compose.prod.yml up -d --build`
4. Проверить: https://planner-<ip-dashes>.sslip.io/api/health -> {"status":"ok"}
5. Открыть Mini App в Telegram через menu button -> видно "Привет, <имя>".

## DoD Phase 0
- `pytest -q` зелёный.
- docker dev: postgres+redis healthy, alembic upgrade head проходит.
- /api/health отвечает; /api/me с валидной initData возвращает owner, без неё 401.
- Бот отвечает на /start владельцу, игнорит чужих.
- Mini App shell грузится по HTTPS и показывает имя владельца.
```

- [ ] **Step 2: Commit**

```bash
git add planner-v2/docs/runbooks/phase0-deploy.md
git commit -m "docs(planner-v2): phase 0 deploy runbook"
```

---

## Definition of Done (Phase 0)

- [ ] `pytest -q` зелёный (config, auth initData x4, health, me x2, bot start x2).
- [ ] `docker compose up -d postgres redis` -> healthy; `alembic upgrade head` проходит.
- [ ] `/api/health` -> `{"status":"ok"}`; `/api/me` без initData -> 401, с валидной -> owner.
- [ ] Бот отвечает на `/start` владельцу, игнорирует чужих.
- [ ] `cd frontend && npm run build` -> `dist/` без ошибок; FastAPI отдаёт `/app/`.
- [ ] Runbook деплоя написан; Caddy/sslip.io schema зафиксирована.

## NOT in scope (Phase 0)

- Доменные таблицы (project/task/...) и API задач -> Phase 1.
- LLM / парсинг / AI-копайлот -> позже.
- Реальный UI (табы, экраны, Air-Bank дизайн) -> UI-фаза после DESIGN.md.
- Экосистема Claude Code / ingest / /planner скилл -> Phase 5.

## Self-Review

- Spec coverage: эта фаза покрывает раздел 4 (стек/каркас) + 6 (аутентификация Mini App) спеки. Доменная модель (раздел 5) и потоки (6.x) намеренно в следующих планах.
- Placeholder scan: код в каждом шаге полный; baseline-миграция пустая намеренно (нет таблиц в Phase 0).
- Type consistency: `verify_init_data`/`TelegramUser`/`require_owner` совпадают между Task 3, 5 и тестами; `create_app`/`app` согласованы между Task 5 и Dockerfile/compose.
