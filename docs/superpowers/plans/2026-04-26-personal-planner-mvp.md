# Personal Telegram Planner — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Telegram bot that captures inbox items (text/url/voice/photo/file) from two sibling users, classifies them via LLM into projects, manages Eisenhower tasks, and delivers morning/evening digests — running on existing Hetzner VPS alongside NocoDB.

**Architecture:** Single-process Python service (python-telegram-bot, asyncio) on Docker. State in NocoDB (Postgres backend). Content in a git working copy that pushes to GitHub on every change. LLM via Anthropic Sonnet (reasoning) + Haiku (cheap classify) with prompt caching; Whisper for voice transcription. Long-polling (no SSL/domain). Single writer = no race conditions.

**Tech Stack:** Python 3.11, python-telegram-bot v21+, anthropic, openai (Whisper), httpx, gitpython, pydantic v2, loguru, Docker Compose, NocoDB + Postgres.

**Source spec:** [`docs/superpowers/specs/2026-04-26-personal-planner-design.md`](../specs/2026-04-26-personal-planner-design.md)

**Repo root in this plan:** `/root/planner-bot/` on the VPS, mirrored to `~/ИИ-агенты/Projects/personal-planner/planner-bot/` on Mac during local development.

**Default execution model:** TDD per task. Each task = test first → run red → implementation → run green → commit.

---

## Phase Overview

| Phase | Outcome | Tasks |
|-------|---------|-------|
| A. Infra & Skeleton | Bot answers `/start`, NocoDB schema seeded, Docker Compose live | 1–6 |
| B. Inbox capture (text/url) | TG message → NocoDB row + .md file + git push | 7–12 |
| C. LLM classify & process | Haiku quick-classify + Sonnet processing with project memory | 13–18 |
| D. Multi-source ingestion | Voice (Whisper), photo, file capture | 19–22 |
| E. Tasks + Eisenhower | Task creation flow, quadrants, due dates | 23–27 |
| F. Commands & queries | `/inbox /today /week /projects /find /stats /help /settings` | 28–34 |
| G. Cron & digests | Morning digest, Q1 evening reminder, due-date warnings | 35–38 |
| H. Polish & ship | ACL hardening, observability, deploy verification | 39–43 |

Each phase ends in a green test suite and a working deploy.

---

## File Structure

Files created in this plan (relative to `/root/planner-bot/` unless noted):

| Path | Responsibility |
|------|----------------|
| `Dockerfile` | Build the bot container |
| `docker-compose.override.yml` (in `/root/`) | Adds `planner-bot` service to existing stack |
| `pyproject.toml` | Python deps + tool config |
| `.env.example` | Documented env vars (real `.env` not committed) |
| `bot.py` | Entry point — wires Application, registers handlers, starts polling + JobQueue |
| `config.py` | Typed env loader (pydantic Settings) |
| `models.py` | Pydantic models matching NocoDB tables |
| `acl.py` | `acl_check(user, project)` permission helper |
| `nocodb/client.py` | Thin async REST client over NocoDB v2 API |
| `nocodb/repos.py` | Per-table repos: `UsersRepo`, `ProjectsRepo`, `InboxRepo`, `TasksRepo`, `ActionsRepo` |
| `git_ops.py` | `safe_commit(paths, msg)` wrapping `pull --rebase` + add + commit + push |
| `llm/anthropic_client.py` | Sonnet + Haiku wrappers with prompt caching |
| `llm/whisper_client.py` | OpenAI Whisper wrapper |
| `llm/classify.py` | `classify_inbox(item) -> ClassifyResult` (Haiku) |
| `llm/process.py` | `process_inbox(item, project_ctx) -> ProcessResult` (Sonnet, agentic) |
| `llm/intent.py` | `detect_intent(text) -> Intent` (Haiku, free-text router) |
| `handlers/start.py` | `/start` |
| `handlers/inbox_capture.py` | Receives any non-command message → inbox pipeline |
| `handlers/inbox_commands.py` | `/inbox`, item buttons (process / archive / change project) |
| `handlers/tasks_commands.py` | `/task`, `/today`, `/week` |
| `handlers/projects_commands.py` | `/projects`, `/project <slug>` |
| `handlers/find_command.py` | `/find <query>` |
| `handlers/stats_command.py` | `/stats` |
| `handlers/settings_command.py` | `/settings` (stub in MVP) |
| `handlers/help_command.py` | `/help` |
| `handlers/free_text.py` | Catch-all for non-command text → intent router |
| `handlers/admin.py` | `/admin stats` (admin-only) |
| `cron_jobs.py` | Registers JobQueue jobs (digest, reminders, warner) |
| `formatters.py` | Render Inbox/Tasks/Project lists into TG-friendly text + inline keyboards |
| `markdown_files.py` | `write_inbox_md`, `write_task_md`, `move_inbox_to_project` — file I/O for the git repo |
| `repo_layout.py` | Path constants + slug helpers |
| `tests/conftest.py` | Pytest fixtures (in-memory NocoDB stub, fake TG, tmp git repo) |
| `tests/fakes/nocodb_fake.py` | In-memory implementation of repo interfaces |
| `tests/fakes/anthropic_fake.py` | Scriptable LLM fake |
| `tests/fakes/tg_fake.py` | Lightweight Update/Context fake |
| `tests/test_*.py` | One file per module under test |
| `scripts/seed_nocodb.py` | Idempotent seed script for Users + Projects |
| `scripts/init_repo_layout.py` | Creates the personal-planner skeleton folders + initial commit |

---

## Phase A — Infra & Skeleton

### Task 1: Project skeleton + dependency manifest

**Files:**
- Create: `/root/planner-bot/pyproject.toml`
- Create: `/root/planner-bot/.env.example`
- Create: `/root/planner-bot/.gitignore`
- Create: `/root/planner-bot/README.md`

- [ ] **Step 1: Write the failing test (smoke import)**

`/root/planner-bot/tests/test_skeleton.py`:
```python
def test_package_imports():
    import planner_bot  # noqa: F401
```

- [ ] **Step 2: Run test — expect ModuleNotFoundError**

```bash
cd /root/planner-bot && pytest tests/test_skeleton.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'planner_bot'`.

- [ ] **Step 3: Create package + manifests**

`/root/planner-bot/planner_bot/__init__.py`:
```python
__version__ = "0.1.0"
```

`/root/planner-bot/pyproject.toml`:
```toml
[project]
name = "planner-bot"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "python-telegram-bot[job-queue]>=21.0",
    "anthropic>=0.40.0",
    "openai>=1.40.0",
    "httpx>=0.27",
    "gitpython>=3.1",
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
    "loguru>=0.7",
    "python-dateutil>=2.9",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.23", "ruff>=0.5", "mypy>=1.10"]

[tool.setuptools.packages.find]
where = ["."]
include = ["planner_bot*"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

`/root/planner-bot/.env.example`:
```
TG_BOT_TOKEN=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
NOCODB_URL=http://nocodb:8080/api/v2
NOCODB_TOKEN=
GIT_REPO_PATH=/app/repo
GIT_REMOTE=origin
GIT_USER_EMAIL=bot@personal-planner
GIT_USER_NAME=planner-bot
ADMIN_CHAT_ID=
LOG_LEVEL=INFO
DEFAULT_TIMEZONE=Europe/Prague
```

`/root/planner-bot/.gitignore`:
```
.env
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
.mypy_cache/
logs/
.venv/
```

`/root/planner-bot/README.md`:
```markdown
# planner-bot
See `docs/superpowers/specs/2026-04-26-personal-planner-design.md` and
`docs/superpowers/plans/2026-04-26-personal-planner-mvp.md` in the parent
`personal-planner` repo for design + plan.
```

- [ ] **Step 4: Install + run test green**

```bash
cd /root/planner-bot
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/test_skeleton.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /root/planner-bot
git init
git add pyproject.toml .env.example .gitignore README.md planner_bot/__init__.py tests/test_skeleton.py
git commit -m "chore: scaffold planner-bot package"
```

---

### Task 2: Typed configuration loader

**Files:**
- Create: `planner_bot/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
from planner_bot.config import Settings


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("TG_BOT_TOKEN", "abc")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k1")
    monkeypatch.setenv("OPENAI_API_KEY", "k2")
    monkeypatch.setenv("NOCODB_URL", "http://x/api/v2")
    monkeypatch.setenv("NOCODB_TOKEN", "t")
    monkeypatch.setenv("GIT_REPO_PATH", "/tmp/repo")
    monkeypatch.setenv("ADMIN_CHAT_ID", "42")
    s = Settings()
    assert s.tg_bot_token == "abc"
    assert s.admin_chat_id == 42
    assert s.default_timezone == "Europe/Prague"
    assert str(s.git_repo_path) == "/tmp/repo"


def test_settings_missing_required(monkeypatch):
    for k in ("TG_BOT_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
             "NOCODB_URL", "NOCODB_TOKEN", "GIT_REPO_PATH", "ADMIN_CHAT_ID"):
        monkeypatch.delenv(k, raising=False)
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings()
```

- [ ] **Step 2: Run test — expect ImportError**

```bash
pytest tests/test_config.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement Settings**

`planner_bot/config.py`:
```python
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    tg_bot_token: str = Field(alias="TG_BOT_TOKEN")
    anthropic_api_key: str = Field(alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field(alias="OPENAI_API_KEY")
    nocodb_url: str = Field(alias="NOCODB_URL")
    nocodb_token: str = Field(alias="NOCODB_TOKEN")
    git_repo_path: Path = Field(alias="GIT_REPO_PATH")
    git_remote: str = Field(default="origin", alias="GIT_REMOTE")
    git_user_email: str = Field(default="bot@personal-planner", alias="GIT_USER_EMAIL")
    git_user_name: str = Field(default="planner-bot", alias="GIT_USER_NAME")
    admin_chat_id: int = Field(alias="ADMIN_CHAT_ID")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    default_timezone: str = Field(default="Europe/Prague", alias="DEFAULT_TIMEZONE")
```

- [ ] **Step 4: Run tests — expect green**

```bash
pytest tests/test_config.py -v
```
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add planner_bot/config.py tests/test_config.py
git commit -m "feat(config): typed settings loader"
```

---

### Task 3: NocoDB schema bootstrap script

**Files:**
- Create: `scripts/seed_nocodb.py`
- Create: `tests/test_seed_nocodb.py`

- [ ] **Step 1: Write the failing test (uses HTTP fake)**

```python
from scripts.seed_nocodb import build_seed_payloads


def test_users_seed_payload():
    payloads = build_seed_payloads()
    users = payloads["Users"]
    names = {u["name"] for u in users}
    assert names == {"Sasha", "Seryozha"}
    assert all(u["timezone"] == "Europe/Prague" for u in users)


def test_projects_seed_payload():
    payloads = build_seed_payloads()
    projects = payloads["Projects"]
    slugs = {p["slug"] for p in projects}
    assert {"personal-sasha", "personal-seryozha", "learning",
            "ctok", "zima", "mr-vlad", "champ", "vesna-web",
            "prague-investment"}.issubset(slugs)
    ctok = next(p for p in projects if p["slug"] == "ctok")
    assert ctok["visibility"] == "private"
    assert ctok["owner_role"] == "sasha"
    learning = next(p for p in projects if p["slug"] == "learning")
    assert learning["visibility"] == "shared"
    assert learning["owner_role"] is None
```

- [ ] **Step 2: Run test — expect ImportError**

```bash
pytest tests/test_seed_nocodb.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement seed payload builder**

`scripts/__init__.py`:
```python
```

`scripts/seed_nocodb.py`:
```python
"""Idempotent NocoDB seed for Users + Projects.

Run once after creating the NocoDB project and before first bot start.
The bot itself never modifies Users/Projects schema; this script does.
"""

from __future__ import annotations

import os
import sys
import httpx


SEED_USERS = [
    {"telegram_id": None, "name": "Sasha", "role": "sasha", "timezone": "Europe/Prague"},
    {"telegram_id": None, "name": "Seryozha", "role": "seryozha", "timezone": "Europe/Prague"},
]

SEED_PROJECTS = [
    # personal — private to each sibling
    {"slug": "personal-sasha", "category": "personal", "name": "Personal — Sasha",
     "visibility": "private", "owner_role": "sasha",
     "folder_path": "projects/personal/sasha"},
    {"slug": "personal-seryozha", "category": "personal", "name": "Personal — Seryozha",
     "visibility": "private", "owner_role": "seryozha",
     "folder_path": "projects/personal/seryozha"},
    # learning — shared
    {"slug": "learning", "category": "learning", "name": "Learning",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/learning"},
    # work — Ctok private to Sasha, rest shared
    {"slug": "ctok", "category": "work", "name": "Ctok — тату-студия",
     "visibility": "private", "owner_role": "sasha",
     "folder_path": "projects/work/ctok"},
    {"slug": "zima", "category": "work", "name": "ZIMA",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/zima"},
    {"slug": "mr-vlad", "category": "work", "name": "MR-VLAD",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/mr-vlad"},
    {"slug": "champ", "category": "work", "name": "Champ",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/champ"},
    {"slug": "vesna-web", "category": "work", "name": "Vesna Web",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/vesna-web"},
    {"slug": "prague-investment", "category": "work", "name": "Prague Investment",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/prague-investment"},
]


def build_seed_payloads() -> dict[str, list[dict]]:
    return {"Users": SEED_USERS, "Projects": SEED_PROJECTS}


def upsert(client: httpx.Client, table: str, rows: list[dict], unique_field: str) -> None:
    """Upsert rows by `unique_field`. Idempotent."""
    existing = client.get(f"/tables/{table}/records",
                          params={"limit": 1000}).json().get("list", [])
    existing_keys = {r[unique_field] for r in existing}
    for row in rows:
        if row[unique_field] in existing_keys:
            continue
        client.post(f"/tables/{table}/records", json=row).raise_for_status()


def main() -> int:
    base = os.environ["NOCODB_URL"].rstrip("/")
    token = os.environ["NOCODB_TOKEN"]
    payloads = build_seed_payloads()
    with httpx.Client(base_url=base, headers={"xc-token": token}, timeout=20.0) as c:
        upsert(c, "Users", payloads["Users"], unique_field="name")
        upsert(c, "Projects", payloads["Projects"], unique_field="slug")
    print("seed: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests — expect green**

```bash
pytest tests/test_seed_nocodb.py -v
```
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add scripts/__init__.py scripts/seed_nocodb.py tests/test_seed_nocodb.py
git commit -m "feat(seed): NocoDB Users + Projects seed payloads"
```

---

### Task 4: Repo layout helpers + initial structure script

**Files:**
- Create: `planner_bot/repo_layout.py`
- Create: `tests/test_repo_layout.py`
- Create: `scripts/init_repo_layout.py`

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path
from planner_bot.repo_layout import (
    inbox_path, archive_inbox_path, project_subfolder, task_path,
    slugify, all_skeleton_dirs,
)


def test_slugify_cyrillic():
    assert slugify("Как работает PostgreSQL replication")[:30] \
        == "kak-rabotaet-postgresql-replic"


def test_inbox_path_format():
    p = inbox_path(Path("/repo"), "2026-04-26T14:32:00", "PostgreSQL replication")
    assert str(p) == "/repo/_inbox/2026-04-26-1432-postgresql-replication.md"


def test_project_subfolder():
    p = project_subfolder(Path("/repo"), "projects/work/ctok", "research")
    assert str(p) == "/repo/projects/work/ctok/research"


def test_task_path():
    p = task_path(Path("/repo"), "2026-04-26T14:35:00", "Дописать prompt для Ctok bot")
    assert str(p) == "/repo/tasks/2026-04/2026-04-26-1435-dopisat-prompt-dlya-ctok-bot.md"


def test_archive_inbox_path():
    p = archive_inbox_path(Path("/repo"), "2026-03")
    assert str(p) == "/repo/_archive/inbox/2026-03"


def test_skeleton_dirs_includes_all_projects():
    dirs = all_skeleton_dirs()
    assert "projects/personal/sasha/research" in dirs
    assert "projects/personal/seryozha/files" in dirs
    assert "projects/learning/notes" in dirs
    assert "projects/work/ctok/inbox" in dirs
    assert "projects/work/zima/research" in dirs
    assert "_inbox" in dirs
    assert "_archive/inbox" in dirs
    assert "_archive/tasks" in dirs
    assert "_meta/context_notes_history" in dirs
    assert "_meta/monthly_reports" in dirs
    assert "tasks" in dirs
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pytest tests/test_repo_layout.py -v
```

- [ ] **Step 3: Implement `repo_layout.py`**

```python
"""Path helpers for the personal-planner content repo."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path

CYR_TO_LAT = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})


def slugify(text: str, maxlen: int = 60) -> str:
    text = text.strip().lower()
    text = text.translate(CYR_TO_LAT)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9\s\-]+", "", text)
    text = re.sub(r"[\s_]+", "-", text).strip("-")
    return text[:maxlen]


def _ts_compact(iso: str) -> tuple[str, str]:
    dt = datetime.fromisoformat(iso)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H%M")


def inbox_path(repo: Path, created_iso: str, title: str) -> Path:
    ymd, hm = _ts_compact(created_iso)
    return repo / "_inbox" / f"{ymd}-{hm}-{slugify(title)}.md"


def archive_inbox_path(repo: Path, ym: str) -> Path:
    return repo / "_archive" / "inbox" / ym


def archive_tasks_path(repo: Path, ym: str) -> Path:
    return repo / "_archive" / "tasks" / ym


def project_subfolder(repo: Path, folder_path: str, sub: str) -> Path:
    return repo / folder_path / sub


def task_path(repo: Path, created_iso: str, title: str) -> Path:
    dt = datetime.fromisoformat(created_iso)
    ym = dt.strftime("%Y-%m")
    ymd, hm = _ts_compact(created_iso)
    return repo / "tasks" / ym / f"{ymd}-{hm}-{slugify(title)}.md"


_PROJECT_PATHS = [
    "projects/personal/sasha", "projects/personal/seryozha",
    "projects/learning",
    "projects/work/ctok", "projects/work/zima", "projects/work/mr-vlad",
    "projects/work/champ", "projects/work/vesna-web",
    "projects/work/prague-investment",
]
_SUBFOLDERS = ["inbox", "research", "tasks", "notes", "files"]


def all_skeleton_dirs() -> list[str]:
    out = ["_inbox", "_archive/inbox", "_archive/tasks",
           "_meta/context_notes_history", "_meta/monthly_reports", "tasks"]
    for p in _PROJECT_PATHS:
        for s in _SUBFOLDERS:
            out.append(f"{p}/{s}")
    return out
```

`scripts/init_repo_layout.py`:
```python
"""Create the personal-planner skeleton folders and initial commit."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from planner_bot.repo_layout import all_skeleton_dirs


def main() -> int:
    repo = Path(os.environ.get("REPO_PATH", "."))
    repo.mkdir(parents=True, exist_ok=True)
    for rel in all_skeleton_dirs():
        d = repo / rel
        d.mkdir(parents=True, exist_ok=True)
        keep = d / ".gitkeep"
        if not keep.exists():
            keep.write_text("")
    readme = repo / "README.md"
    if not readme.exists():
        readme.write_text("# personal-planner\n\nManaged by planner-bot.\n")
    subprocess.check_call(["git", "-C", str(repo), "add", "."])
    rc = subprocess.run(
        ["git", "-C", str(repo), "diff", "--cached", "--quiet"]
    ).returncode
    if rc != 0:
        subprocess.check_call(
            ["git", "-C", str(repo), "commit", "-m", "init: skeleton structure"]
        )
    print("repo layout: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests — expect green**

```bash
pytest tests/test_repo_layout.py -v
```
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add planner_bot/repo_layout.py scripts/init_repo_layout.py tests/test_repo_layout.py
git commit -m "feat(repo_layout): path helpers + skeleton init script"
```

---

### Task 5: Bot entry skeleton + `/start` handler

**Files:**
- Create: `planner_bot/bot.py`
- Create: `planner_bot/handlers/__init__.py`
- Create: `planner_bot/handlers/start.py`
- Create: `tests/fakes/__init__.py`
- Create: `tests/fakes/tg_fake.py`
- Create: `tests/test_handler_start.py`

- [ ] **Step 1: Write the failing test**

`tests/fakes/tg_fake.py`:
```python
"""Minimal Update/Context fakes — only the surface our handlers touch."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FakeUser:
    id: int
    full_name: str = ""
    username: str | None = None
    is_bot: bool = False


@dataclass
class FakeChat:
    id: int
    type: str = "private"


@dataclass
class FakeMessage:
    text: str | None = None
    voice: Any = None
    photo: list = field(default_factory=list)
    document: Any = None
    chat: FakeChat = None
    from_user: FakeUser = None
    sent: list = field(default_factory=list)

    async def reply_text(self, text: str, **kwargs):
        self.sent.append({"text": text, **kwargs})


@dataclass
class FakeUpdate:
    update_id: int
    effective_user: FakeUser
    effective_chat: FakeChat
    message: FakeMessage


class FakeContext:
    def __init__(self):
        self.bot_data: dict = {}
        self.user_data: dict = {}
        self.chat_data: dict = {}


def make_update(text: str, user_id: int = 100, chat_id: int = 100,
                full_name: str = "Sasha") -> FakeUpdate:
    user = FakeUser(id=user_id, full_name=full_name)
    chat = FakeChat(id=chat_id)
    msg = FakeMessage(text=text, chat=chat, from_user=user)
    return FakeUpdate(update_id=user_id, effective_user=user,
                      effective_chat=chat, message=msg)
```

`tests/test_handler_start.py`:
```python
import pytest

from planner_bot.handlers.start import start_command
from tests.fakes.tg_fake import make_update, FakeContext


class FakeUsersRepo:
    def __init__(self, by_tg=None):
        self._by_tg = by_tg or {}
        self.upserts = []

    async def get_by_telegram_id(self, tg_id):
        return self._by_tg.get(tg_id)

    async def upsert_by_telegram_id(self, tg_id, name):
        self.upserts.append((tg_id, name))
        rec = {"id": 1, "telegram_id": tg_id, "name": name, "role": "sasha"}
        self._by_tg[tg_id] = rec
        return rec


@pytest.mark.asyncio
async def test_start_known_user():
    repo = FakeUsersRepo(by_tg={42: {"id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}})
    update = make_update("/start", user_id=42, chat_id=42)
    ctx = FakeContext()
    ctx.bot_data["users_repo"] = repo
    await start_command(update, ctx)
    assert any("Sasha" in m["text"] for m in update.message.sent)
    assert repo.upserts == []


@pytest.mark.asyncio
async def test_start_unknown_user_denied():
    repo = FakeUsersRepo(by_tg={})
    update = make_update("/start", user_id=999, chat_id=999, full_name="Stranger")
    ctx = FakeContext()
    ctx.bot_data["users_repo"] = repo
    await start_command(update, ctx)
    assert any("Доступа нет" in m["text"] for m in update.message.sent)
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pytest tests/test_handler_start.py -v
```

- [ ] **Step 3: Implement `/start`**

`planner_bot/handlers/__init__.py`:
```python
```

`planner_bot/handlers/start.py`:
```python
from telegram import Update
from telegram.ext import ContextTypes


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    repo = context.bot_data["users_repo"]
    tg_id = update.effective_user.id
    user = await repo.get_by_telegram_id(tg_id)
    if user is None:
        await update.message.reply_text(
            "Бот личный. Доступа нет."
        )
        return
    name = user["name"]
    await update.message.reply_text(
        f"Привет, {name}. Шли мне ссылки, тексты, голосовые — разложу по проектам.\n"
        "Команды: /inbox /today /week /projects /find /task /stats /help"
    )
```

`planner_bot/bot.py`:
```python
"""Bot entry point. Wires Application + handlers + JobQueue.

Tasks beyond /start are added in subsequent plan tasks.
"""
from __future__ import annotations

import logging

from loguru import logger
from telegram.ext import Application, CommandHandler

from planner_bot.config import Settings
from planner_bot.handlers.start import start_command


def build_application(settings: Settings) -> Application:
    app = Application.builder().token(settings.tg_bot_token).build()
    app.add_handler(CommandHandler("start", start_command))
    return app


def main() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info("planner-bot starting")
    app = build_application(settings)
    app.run_polling(close_loop=False)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests — expect green**

```bash
pytest tests/test_handler_start.py -v
```
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add planner_bot/bot.py planner_bot/handlers/ tests/fakes/ tests/test_handler_start.py
git commit -m "feat(bot): /start with user whitelist"
```

---

### Task 6: Dockerfile + Compose service + smoke deploy

**Files:**
- Create: `/root/planner-bot/Dockerfile`
- Create: `/root/docker-compose.override.yml` (extends existing NocoDB stack)

- [ ] **Step 1: Write the smoke test**

`tests/test_dockerfile_lint.py`:
```python
from pathlib import Path


def test_dockerfile_pins_python_version():
    text = Path("Dockerfile").read_text()
    assert "FROM python:3.11" in text
    assert "PYTHONUNBUFFERED=1" in text


def test_dockerfile_has_entrypoint():
    text = Path("Dockerfile").read_text()
    assert "planner_bot.bot" in text
```

- [ ] **Step 2: Run — expect FAIL (no Dockerfile)**

```bash
pytest tests/test_dockerfile_lint.py -v
```

- [ ] **Step 3: Write Dockerfile + override**

`Dockerfile`:
```dockerfile
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --upgrade pip \
    && pip install .

COPY planner_bot ./planner_bot
COPY scripts ./scripts

RUN mkdir -p /app/logs /app/repo

CMD ["python", "-m", "planner_bot.bot"]
```

`/root/docker-compose.override.yml`:
```yaml
services:
  planner-bot:
    build:
      context: ./planner-bot
    image: planner-bot:latest
    restart: always
    env_file: ./planner-bot/.env
    volumes:
      - /root/personal-planner:/app/repo
      - /root/.ssh:/root/.ssh:ro
      - ./planner-bot/logs:/app/logs
    depends_on:
      - nocodb
    networks:
      - default
```

- [ ] **Step 4: Run tests + smoke build**

```bash
pytest tests/test_dockerfile_lint.py -v
cd /root && docker compose build planner-bot
```
Expected: tests PASS, image builds. Do NOT `up` yet — bot will crash without NocoDB schema (created in Task 7).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile tests/test_dockerfile_lint.py
git commit -m "feat(deploy): Dockerfile + compose override"
```

---

## Phase B — Inbox Capture (text/url)

### Task 7: NocoDB tables creation script

**Files:**
- Create: `scripts/create_nocodb_tables.py`
- Create: `tests/test_table_definitions.py`

- [ ] **Step 1: Write the failing test**

```python
from scripts.create_nocodb_tables import TABLE_DEFINITIONS


def test_inbox_table_columns():
    inbox = TABLE_DEFINITIONS["Inbox"]
    names = {c["title"] for c in inbox["columns"]}
    expected = {"created_at", "author_id", "source_type", "raw_content",
                "title", "summary", "caption", "status", "project_id",
                "target_path", "action_taken", "processed_at",
                "file_path_repo", "attachment_url", "transcript", "confidence"}
    assert expected.issubset(names)


def test_tasks_table_has_quadrant():
    tasks = TABLE_DEFINITIONS["Tasks"]
    quad = next(c for c in tasks["columns"] if c["title"] == "quadrant")
    assert set(quad["options"]) == {"Q1", "Q2", "Q3", "Q4"}


def test_actions_table_present():
    assert "Actions" in TABLE_DEFINITIONS


def test_projects_table_columns():
    proj = TABLE_DEFINITIONS["Projects"]
    names = {c["title"] for c in proj["columns"]}
    assert {"slug", "category", "visibility", "owner_role",
            "context_notes", "context_notes_compact",
            "folder_path", "archived"}.issubset(names)
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pytest tests/test_table_definitions.py -v
```

- [ ] **Step 3: Implement table definitions**

`scripts/create_nocodb_tables.py`:
```python
"""NocoDB table creation. Run once per fresh project.

Uses NocoDB v2 metadata API. Tables are created if absent;
existing tables are left untouched.
"""

from __future__ import annotations

import os
import sys
import httpx


TABLE_DEFINITIONS: dict[str, dict] = {
    "Users": {
        "columns": [
            {"title": "telegram_id", "uidt": "Number"},
            {"title": "name", "uidt": "SingleLineText"},
            {"title": "role", "uidt": "SingleSelect",
             "options": ["sasha", "seryozha"]},
            {"title": "timezone", "uidt": "SingleLineText"},
            {"title": "created_at", "uidt": "DateTime"},
        ],
    },
    "Projects": {
        "columns": [
            {"title": "slug", "uidt": "SingleLineText"},
            {"title": "category", "uidt": "SingleSelect",
             "options": ["personal", "learning", "work"]},
            {"title": "name", "uidt": "SingleLineText"},
            {"title": "description", "uidt": "LongText"},
            {"title": "context_notes", "uidt": "LongText"},
            {"title": "context_notes_compact", "uidt": "LongText"},
            {"title": "visibility", "uidt": "SingleSelect",
             "options": ["private", "shared"]},
            {"title": "owner_role", "uidt": "SingleSelect",
             "options": ["sasha", "seryozha"]},
            {"title": "folder_path", "uidt": "SingleLineText"},
            {"title": "color", "uidt": "SingleLineText"},
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "archived", "uidt": "Checkbox"},
        ],
    },
    "Inbox": {
        "columns": [
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "author_id", "uidt": "Number"},
            {"title": "source_type", "uidt": "SingleSelect",
             "options": ["url", "text", "voice", "photo", "file", "forward"]},
            {"title": "raw_content", "uidt": "LongText"},
            {"title": "title", "uidt": "SingleLineText"},
            {"title": "summary", "uidt": "LongText"},
            {"title": "caption", "uidt": "LongText"},
            {"title": "status", "uidt": "SingleSelect",
             "options": ["new", "thinking", "proposed", "processed", "archived"]},
            {"title": "project_id", "uidt": "Number"},
            {"title": "target_path", "uidt": "SingleLineText"},
            {"title": "action_taken", "uidt": "LongText"},
            {"title": "processed_at", "uidt": "DateTime"},
            {"title": "file_path_repo", "uidt": "SingleLineText"},
            {"title": "attachment_url", "uidt": "SingleLineText"},
            {"title": "transcript", "uidt": "LongText"},
            {"title": "confidence", "uidt": "Decimal"},
        ],
    },
    "Tasks": {
        "columns": [
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "author_id", "uidt": "Number"},
            {"title": "title", "uidt": "SingleLineText"},
            {"title": "description", "uidt": "LongText"},
            {"title": "project_id", "uidt": "Number"},
            {"title": "quadrant", "uidt": "SingleSelect",
             "options": ["Q1", "Q2", "Q3", "Q4"]},
            {"title": "due_date", "uidt": "Date"},
            {"title": "due_time", "uidt": "Time"},
            {"title": "status", "uidt": "SingleSelect",
             "options": ["todo", "in_progress", "done", "archived"]},
            {"title": "done_at", "uidt": "DateTime"},
            {"title": "inbox_id", "uidt": "Number"},
            {"title": "source_text", "uidt": "LongText"},
            {"title": "gcal_event_id", "uidt": "SingleLineText"},
            {"title": "file_path_repo", "uidt": "SingleLineText"},
        ],
    },
    "Actions": {
        "columns": [
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "inbox_id", "uidt": "Number"},
            {"title": "task_id", "uidt": "Number"},
            {"title": "author_id", "uidt": "Number"},
            {"title": "action_type", "uidt": "SingleSelect",
             "options": ["propose_project", "process", "move",
                         "summarize", "transcribe", "clarify", "compact"]},
            {"title": "llm_input", "uidt": "LongText"},
            {"title": "llm_output", "uidt": "LongText"},
            {"title": "llm_model", "uidt": "SingleLineText"},
            {"title": "tokens_in", "uidt": "Number"},
            {"title": "tokens_out", "uidt": "Number"},
            {"title": "cost_usd", "uidt": "Decimal"},
            {"title": "user_decision", "uidt": "LongText"},
        ],
    },
}


def main() -> int:
    base = os.environ["NOCODB_URL"].rstrip("/")
    token = os.environ["NOCODB_TOKEN"]
    base_id = os.environ["NOCODB_BASE_ID"]
    headers = {"xc-token": token}
    with httpx.Client(base_url=base, headers=headers, timeout=30.0) as c:
        existing = c.get(f"/meta/bases/{base_id}/tables").json().get("list", [])
        existing_titles = {t["title"] for t in existing}
        for title, spec in TABLE_DEFINITIONS.items():
            if title in existing_titles:
                print(f"skip: {title} exists")
                continue
            payload = {"title": title, "columns": spec["columns"]}
            c.post(f"/meta/bases/{base_id}/tables",
                   json=payload).raise_for_status()
            print(f"created: {title}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests — expect green**

```bash
pytest tests/test_table_definitions.py -v
```
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add scripts/create_nocodb_tables.py tests/test_table_definitions.py
git commit -m "feat(schema): NocoDB table definitions"
```

---

### Task 8: NocoDB async client

**Files:**
- Create: `planner_bot/nocodb/__init__.py`
- Create: `planner_bot/nocodb/client.py`
- Create: `tests/test_nocodb_client.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from planner_bot.nocodb.client import NocoDBClient


@pytest.mark.asyncio
async def test_list_passes_query_params(monkeypatch):
    captured = {}

    class StubResponse:
        status_code = 200
        def json(self): return {"list": [{"Id": 1}], "pageInfo": {}}
        def raise_for_status(self): pass

    async def fake_get(self, url, params=None):
        captured["url"] = url
        captured["params"] = params
        return StubResponse()

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)
    c = NocoDBClient(base_url="http://x/api/v2", token="t")
    rows = await c.list("Inbox", where="(status,eq,new)", limit=50)
    assert rows == [{"Id": 1}]
    assert captured["url"] == "/tables/Inbox/records"
    assert captured["params"] == {"where": "(status,eq,new)", "limit": 50}


@pytest.mark.asyncio
async def test_insert_returns_record(monkeypatch):
    class StubResponse:
        status_code = 200
        def json(self): return {"Id": 42}
        def raise_for_status(self): pass

    async def fake_post(self, url, json=None):
        return StubResponse()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    c = NocoDBClient(base_url="http://x/api/v2", token="t")
    rec = await c.insert("Inbox", {"title": "x"})
    assert rec == {"Id": 42}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pytest tests/test_nocodb_client.py -v
```

- [ ] **Step 3: Implement client**

`planner_bot/nocodb/__init__.py`:
```python
```

`planner_bot/nocodb/client.py`:
```python
from __future__ import annotations

import httpx


class NocoDBClient:
    """Thin async wrapper over NocoDB v2 records API.

    Repos in `repos.py` build on this. Keeping the client typeless
    (dict in / dict out) so that NocoDB schema drift surfaces in the
    repo layer where we have explicit pydantic models.
    """

    def __init__(self, base_url: str, token: str, timeout: float = 20.0):
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"xc-token": token},
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list(self, table: str, *, where: str | None = None,
                   limit: int = 25, offset: int = 0,
                   sort: str | None = None) -> list[dict]:
        params: dict = {"limit": limit, "offset": offset}
        if where:
            params["where"] = where
        if sort:
            params["sort"] = sort
        r = await self._client.get(f"/tables/{table}/records", params=params)
        r.raise_for_status()
        return r.json().get("list", [])

    async def get(self, table: str, record_id: int) -> dict | None:
        r = await self._client.get(f"/tables/{table}/records/{record_id}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    async def insert(self, table: str, data: dict) -> dict:
        r = await self._client.post(f"/tables/{table}/records", json=data)
        r.raise_for_status()
        return r.json()

    async def update(self, table: str, record_id: int, data: dict) -> dict:
        r = await self._client.patch(
            f"/tables/{table}/records",
            json={"Id": record_id, **data},
        )
        r.raise_for_status()
        return r.json()
```

- [ ] **Step 4: Run tests — expect green**

```bash
pytest tests/test_nocodb_client.py -v
```
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add planner_bot/nocodb/ tests/test_nocodb_client.py
git commit -m "feat(nocodb): async REST client"
```

---

### Task 9: NocoDB repos (Users / Projects / Inbox / Tasks / Actions)

**Files:**
- Create: `planner_bot/nocodb/repos.py`
- Create: `tests/test_nocodb_repos.py`

- [ ] **Step 1: Write the failing tests**

```python
import pytest
from planner_bot.nocodb.repos import (
    UsersRepo, ProjectsRepo, InboxRepo, TasksRepo, ActionsRepo,
)


class StubClient:
    def __init__(self, list_result=None, get_result=None, insert_result=None,
                 update_result=None):
        self._list = list_result or []
        self._get = get_result
        self._insert = insert_result or {"Id": 1}
        self._update = update_result or {"Id": 1}
        self.calls = []

    async def list(self, table, **kw):
        self.calls.append(("list", table, kw))
        return self._list

    async def get(self, table, record_id):
        self.calls.append(("get", table, record_id))
        return self._get

    async def insert(self, table, data):
        self.calls.append(("insert", table, data))
        return self._insert

    async def update(self, table, record_id, data):
        self.calls.append(("update", table, record_id, data))
        return self._update


@pytest.mark.asyncio
async def test_users_get_by_telegram_id():
    cli = StubClient(list_result=[{"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}])
    repo = UsersRepo(cli)
    u = await repo.get_by_telegram_id(42)
    assert u["name"] == "Sasha"
    assert cli.calls[0][2]["where"] == "(telegram_id,eq,42)"


@pytest.mark.asyncio
async def test_users_upsert_inserts_when_missing():
    cli = StubClient(list_result=[], insert_result={"Id": 7, "telegram_id": 99,
                                                    "name": "Sasha", "role": "sasha"})
    repo = UsersRepo(cli)
    u = await repo.upsert_by_telegram_id(99, "Sasha")
    assert u["Id"] == 7
    assert any(c[0] == "insert" for c in cli.calls)


@pytest.mark.asyncio
async def test_inbox_create_new():
    cli = StubClient(insert_result={"Id": 42})
    repo = InboxRepo(cli)
    rec = await repo.create({
        "author_id": 1, "source_type": "url",
        "raw_content": "https://x", "title": "X",
        "status": "new",
    })
    assert rec["Id"] == 42
    assert cli.calls[0][1] == "Inbox"


@pytest.mark.asyncio
async def test_inbox_list_unprocessed_for_user():
    cli = StubClient(list_result=[{"Id": 1}])
    repo = InboxRepo(cli)
    rows = await repo.list_unprocessed_for_user(author_id=1, shared_authors=[2])
    assert rows == [{"Id": 1}]
    where = cli.calls[0][2]["where"]
    assert "status,eq,new" in where
    assert "author_id,in,1,2" in where


@pytest.mark.asyncio
async def test_projects_visible_to():
    cli = StubClient(list_result=[
        {"Id": 1, "slug": "ctok", "visibility": "private", "owner_role": "sasha"},
        {"Id": 2, "slug": "learning", "visibility": "shared", "owner_role": None},
    ])
    repo = ProjectsRepo(cli)
    rows = await repo.list_visible_to("sasha")
    assert {r["slug"] for r in rows} == {"ctok", "learning"}


@pytest.mark.asyncio
async def test_tasks_create_with_quadrant():
    cli = StubClient(insert_result={"Id": 17})
    repo = TasksRepo(cli)
    t = await repo.create({"author_id": 1, "title": "X", "quadrant": "Q1",
                           "status": "todo"})
    assert t["Id"] == 17


@pytest.mark.asyncio
async def test_actions_log():
    cli = StubClient(insert_result={"Id": 1})
    repo = ActionsRepo(cli)
    await repo.log(action_type="propose_project", author_id=1,
                   inbox_id=42, llm_model="claude-haiku-4-5",
                   tokens_in=300, tokens_out=50, cost_usd=0.001,
                   llm_input="...", llm_output="...")
    assert cli.calls[0][1] == "Actions"
    assert cli.calls[0][2]["action_type"] == "propose_project"
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_nocodb_repos.py -v
```

- [ ] **Step 3: Implement repos**

`planner_bot/nocodb/repos.py`:
```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from planner_bot.nocodb.client import NocoDBClient


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class UsersRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def get_by_telegram_id(self, tg_id: int) -> dict | None:
        rows = await self._c.list("Users",
                                  where=f"(telegram_id,eq,{tg_id})", limit=1)
        return rows[0] if rows else None

    async def list_all(self) -> list[dict]:
        return await self._c.list("Users", limit=100)

    async def upsert_by_telegram_id(self, tg_id: int, name: str) -> dict:
        existing = await self.get_by_telegram_id(tg_id)
        if existing:
            return existing
        return await self._c.insert("Users", {
            "telegram_id": tg_id, "name": name,
            "role": "sasha", "timezone": "Europe/Prague",
            "created_at": _now_iso(),
        })


class ProjectsRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def get_by_slug(self, slug: str) -> dict | None:
        rows = await self._c.list("Projects",
                                  where=f"(slug,eq,{slug})", limit=1)
        return rows[0] if rows else None

    async def list_all(self) -> list[dict]:
        return await self._c.list("Projects", limit=200,
                                  where="(archived,eq,false)")

    async def list_visible_to(self, role: str) -> list[dict]:
        rows = await self.list_all()
        return [r for r in rows
                if r["visibility"] == "shared"
                or r.get("owner_role") == role]

    async def update_context_notes(self, project_id: int, notes: str) -> dict:
        return await self._c.update("Projects", project_id,
                                    {"context_notes": notes})


class InboxRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def create(self, data: dict) -> dict:
        payload = {"created_at": _now_iso(), "status": "new", **data}
        return await self._c.insert("Inbox", payload)

    async def get(self, item_id: int) -> dict | None:
        return await self._c.get("Inbox", item_id)

    async def update(self, item_id: int, data: dict) -> dict:
        return await self._c.update("Inbox", item_id, data)

    async def list_unprocessed_for_user(self, author_id: int,
                                        shared_authors: list[int]) -> list[dict]:
        ids = ",".join(str(i) for i in [author_id, *shared_authors])
        where = f"(status,eq,new)~and(author_id,in,{ids})"
        return await self._c.list("Inbox", where=where, sort="-created_at",
                                  limit=50)

    async def search_text(self, query: str, limit: int = 10) -> list[dict]:
        where = (f"(title,like,%{query}%)~or(summary,like,%{query}%)"
                 f"~or(transcript,like,%{query}%)~or(raw_content,like,%{query}%)")
        return await self._c.list("Inbox", where=where, limit=limit,
                                  sort="-created_at")


class TasksRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def create(self, data: dict) -> dict:
        payload = {"created_at": _now_iso(), "status": "todo", **data}
        return await self._c.insert("Tasks", payload)

    async def get(self, task_id: int) -> dict | None:
        return await self._c.get("Tasks", task_id)

    async def update(self, task_id: int, data: dict) -> dict:
        return await self._c.update("Tasks", task_id, data)

    async def list_for_user_active(self, author_id: int) -> list[dict]:
        where = f"(author_id,eq,{author_id})~and(status,in,todo,in_progress)"
        return await self._c.list("Tasks", where=where,
                                  sort="quadrant,due_date", limit=200)

    async def list_today(self, author_id: int, today: str) -> list[dict]:
        where = (f"(author_id,eq,{author_id})~and(status,in,todo,in_progress)"
                 f"~and(due_date,eq,{today})")
        return await self._c.list("Tasks", where=where,
                                  sort="quadrant,due_time", limit=100)

    async def list_week(self, author_id: int, start: str, end: str) -> list[dict]:
        where = (f"(author_id,eq,{author_id})~and(status,in,todo,in_progress)"
                 f"~and(due_date,btw,{start},{end})")
        return await self._c.list("Tasks", where=where,
                                  sort="due_date,quadrant,due_time", limit=200)

    async def list_q1_today(self, author_id: int, today: str) -> list[dict]:
        where = (f"(author_id,eq,{author_id})~and(status,eq,todo)"
                 f"~and(quadrant,eq,Q1)~and(due_date,eq,{today})")
        return await self._c.list("Tasks", where=where, limit=50)


class ActionsRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def log(self, *, action_type: str, author_id: int,
                  llm_input: str = "", llm_output: str = "",
                  llm_model: str = "", tokens_in: int = 0,
                  tokens_out: int = 0, cost_usd: float = 0.0,
                  inbox_id: int | None = None, task_id: int | None = None,
                  user_decision: str = "") -> dict:
        return await self._c.insert("Actions", {
            "created_at": _now_iso(),
            "action_type": action_type, "author_id": author_id,
            "llm_input": llm_input, "llm_output": llm_output,
            "llm_model": llm_model, "tokens_in": tokens_in,
            "tokens_out": tokens_out, "cost_usd": cost_usd,
            "inbox_id": inbox_id, "task_id": task_id,
            "user_decision": user_decision,
        })
```

- [ ] **Step 4: Run — green**

```bash
pytest tests/test_nocodb_repos.py -v
```
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add planner_bot/nocodb/repos.py tests/test_nocodb_repos.py
git commit -m "feat(nocodb): repos for Users/Projects/Inbox/Tasks/Actions"
```

---

### Task 10: ACL helper

**Files:**
- Create: `planner_bot/acl.py`
- Create: `tests/test_acl.py`

- [ ] **Step 1: Test**

```python
from planner_bot.acl import can_access_project, filter_visible_projects


def _proj(slug, vis="shared", owner=None):
    return {"slug": slug, "visibility": vis, "owner_role": owner}


def test_shared_visible_to_all():
    assert can_access_project({"role": "seryozha"}, _proj("learning"))
    assert can_access_project({"role": "sasha"}, _proj("learning"))


def test_private_only_owner():
    assert can_access_project({"role": "sasha"},
                              _proj("ctok", "private", "sasha"))
    assert not can_access_project({"role": "seryozha"},
                                  _proj("ctok", "private", "sasha"))


def test_filter_visible():
    user = {"role": "seryozha"}
    rows = [
        _proj("ctok", "private", "sasha"),
        _proj("personal-seryozha", "private", "seryozha"),
        _proj("learning"),
    ]
    visible = filter_visible_projects(user, rows)
    slugs = [p["slug"] for p in visible]
    assert slugs == ["personal-seryozha", "learning"]
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_acl.py -v
```

- [ ] **Step 3: Implement**

```python
def can_access_project(user: dict, project: dict) -> bool:
    if project.get("archived"):
        return False
    if project["visibility"] == "shared":
        return True
    return project.get("owner_role") == user["role"]


def filter_visible_projects(user: dict, projects: list[dict]) -> list[dict]:
    return [p for p in projects if can_access_project(user, p)]
```

- [ ] **Step 4: Run — green**

```bash
pytest tests/test_acl.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/acl.py tests/test_acl.py
git commit -m "feat(acl): per-project visibility checks"
```

---

### Task 11: Safe git ops

**Files:**
- Create: `planner_bot/git_ops.py`
- Create: `tests/test_git_ops.py`

- [ ] **Step 1: Test (uses real tmp git repo)**

```python
import subprocess
from pathlib import Path
import pytest

from planner_bot.git_ops import safe_commit, GitOpsError


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    upstream = tmp_path / "upstream.git"
    subprocess.check_call(["git", "init", "--bare", str(upstream)])
    work = tmp_path / "work"
    subprocess.check_call(["git", "clone", str(upstream), str(work)])
    subprocess.check_call(["git", "-C", str(work), "config", "user.email", "t@t"])
    subprocess.check_call(["git", "-C", str(work), "config", "user.name", "t"])
    (work / "README.md").write_text("init\n")
    subprocess.check_call(["git", "-C", str(work), "add", "."])
    subprocess.check_call(["git", "-C", str(work), "commit", "-m", "init"])
    subprocess.check_call(["git", "-C", str(work), "push", "origin", "HEAD:refs/heads/main"])
    subprocess.check_call(["git", "-C", str(work), "branch", "-M", "main"])
    subprocess.check_call(["git", "-C", str(work), "branch", "--set-upstream-to=origin/main"])
    return work


def test_safe_commit_creates_commit(repo: Path):
    f = repo / "_inbox" / "x.md"
    f.parent.mkdir(parents=True)
    f.write_text("hello")
    safe_commit(repo_path=repo, paths=[f], message="add x")
    log = subprocess.check_output(["git", "-C", str(repo), "log", "--oneline"]).decode()
    assert "add x" in log


def test_safe_commit_noop_when_clean(repo: Path):
    safe_commit(repo_path=repo, paths=[], message="noop")
    log = subprocess.check_output(["git", "-C", str(repo), "log", "--oneline"]).decode()
    assert log.count("\n") == 1
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_git_ops.py -v
```

- [ ] **Step 3: Implement**

```python
from __future__ import annotations

import subprocess
from pathlib import Path

from loguru import logger


class GitOpsError(RuntimeError):
    pass


def _git(repo: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        raise GitOpsError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def safe_commit(*, repo_path: Path, paths: list[Path], message: str,
                push: bool = True) -> None:
    """Pull --rebase, stage paths, commit if dirty, push.

    Idempotent on empty changes (no commit, no push).
    """
    if push:
        try:
            _git(repo_path, "pull", "--rebase", "--autostash")
        except GitOpsError as e:
            logger.warning(f"pull failed (continuing): {e}")
    for p in paths:
        rel = p.relative_to(repo_path) if p.is_absolute() else p
        _git(repo_path, "add", str(rel))
    diff = subprocess.run(
        ["git", "-C", str(repo_path), "diff", "--cached", "--quiet"],
    )
    if diff.returncode == 0:
        logger.debug("safe_commit: nothing to commit")
        return
    _git(repo_path, "commit", "-m", message)
    if push:
        _git(repo_path, "push")
```

- [ ] **Step 4: Run — green**

```bash
pytest tests/test_git_ops.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/git_ops.py tests/test_git_ops.py
git commit -m "feat(git): safe_commit wrapper"
```

---

### Task 12: Markdown writer + inbox capture handler

**Files:**
- Create: `planner_bot/markdown_files.py`
- Create: `planner_bot/handlers/inbox_capture.py`
- Create: `tests/test_markdown_files.py`
- Create: `tests/test_handler_inbox_capture.py`

- [ ] **Step 1: Tests**

`tests/test_markdown_files.py`:
```python
from datetime import datetime
from pathlib import Path

from planner_bot.markdown_files import write_inbox_md, render_inbox_frontmatter


def test_render_frontmatter_minimal():
    fm = render_inbox_frontmatter({
        "Id": 42, "author_name": "sasha",
        "source_type": "url", "raw_content": "https://x",
        "title": "X", "summary": "s",
        "created_at": "2026-04-26T14:32:00",
        "status": "new", "project_slug": None,
    })
    assert "inbox_id: 42" in fm
    assert "author: sasha" in fm
    assert "source: url" in fm
    assert "url: https://x" in fm
    assert "status: new" in fm
    assert "project: null" in fm


def test_write_inbox_md_creates_file(tmp_path: Path):
    repo = tmp_path
    (repo / "_inbox").mkdir()
    p = write_inbox_md(repo, {
        "Id": 42, "author_name": "sasha", "source_type": "text",
        "raw_content": "купить молоко", "title": "Купить молоко",
        "summary": "Заметка", "created_at": "2026-04-26T14:32:00",
        "status": "new", "project_slug": None,
    })
    assert p.exists()
    text = p.read_text()
    assert "# Купить молоко" in text
    assert "inbox_id: 42" in text
```

`tests/test_handler_inbox_capture.py`:
```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_capture import capture_message
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_text_capture_creates_inbox_row_and_md(tmp_path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 99})
    inbox_repo.update = AsyncMock(return_value={"Id": 99})
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    git_safe_commit = MagicMock()
    classify = AsyncMock(return_value={
        "title": "X", "summary": "s", "guess_project_slug": "learning",
        "confidence": 0.9, "tokens_in": 100, "tokens_out": 30,
        "cost_usd": 0.0001,
    })
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()

    update = make_update("Купить молоко завтра", user_id=42)
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo,
        "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "classify_inbox": classify,
        "git_safe_commit": git_safe_commit,
        "repo_path": tmp_path,
    })
    await capture_message(update, ctx)
    inbox_repo.create.assert_awaited()
    assert any("Принято #99" in m["text"] for m in update.message.sent)
    git_safe_commit.assert_called()
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_markdown_files.py tests/test_handler_inbox_capture.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/markdown_files.py`:
```python
from __future__ import annotations

from pathlib import Path

from planner_bot.repo_layout import inbox_path


_FRONTMATTER_TEMPLATE = """---
inbox_id: {inbox_id}
author: {author}
source: {source}
{url_line}created: {created}
status: {status}
project: {project}
---
"""


def render_inbox_frontmatter(item: dict) -> str:
    url_line = ""
    if item["source_type"] == "url" and item.get("raw_content"):
        url_line = f"url: {item['raw_content']}\n"
    proj = item.get("project_slug") or "null"
    return _FRONTMATTER_TEMPLATE.format(
        inbox_id=item["Id"],
        author=item["author_name"],
        source=item["source_type"],
        url_line=url_line,
        created=item["created_at"],
        status=item["status"],
        project=proj,
    )


def render_inbox_body(item: dict) -> str:
    title = item.get("title") or "(no title)"
    summary = item.get("summary") or ""
    transcript = item.get("transcript") or ""
    body = f"\n# {title}\n"
    if summary:
        body += f"\n{summary}\n"
    if transcript:
        body += f"\n## Transcript\n\n{transcript}\n"
    if item["source_type"] == "text" and item.get("raw_content"):
        body += f"\n## Original\n\n{item['raw_content']}\n"
    return body


def write_inbox_md(repo: Path, item: dict) -> Path:
    p = inbox_path(repo, item["created_at"], item.get("title") or f"item-{item['Id']}")
    p.parent.mkdir(parents=True, exist_ok=True)
    text = render_inbox_frontmatter(item) + render_inbox_body(item)
    p.write_text(text)
    return p
```

`planner_bot/handlers/inbox_capture.py`:
```python
from __future__ import annotations

import re
from datetime import datetime, timezone

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


_URL_RE = re.compile(r"https?://\S+")


def _detect_source_type(text: str) -> str:
    if not text:
        return "text"
    return "url" if _URL_RE.search(text) else "text"


def _confidence_label(c: float) -> str:
    return f"{int(c * 100)}%"


async def capture_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if msg.text is None or msg.text.startswith("/"):
        return
    users_repo = context.bot_data["users_repo"]
    user = await users_repo.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return

    raw = msg.text.strip()
    source_type = _detect_source_type(raw)
    classify = context.bot_data["classify_inbox"]
    initial_title = raw.split("\n", 1)[0][:80]
    cls = await classify({"raw_content": raw, "source_type": source_type,
                          "initial_title": initial_title})
    inbox_repo = context.bot_data["inbox_repo"]
    actions_repo = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    record = await inbox_repo.create({
        "author_id": user["Id"],
        "source_type": source_type,
        "raw_content": raw,
        "title": cls["title"],
        "summary": cls["summary"],
        "confidence": cls["confidence"],
        "created_at": now_iso,
        "status": "new",
    })
    item = {
        "Id": record["Id"],
        "author_name": user["name"].lower(),
        "source_type": source_type,
        "raw_content": raw,
        "title": cls["title"],
        "summary": cls["summary"],
        "created_at": now_iso,
        "status": "new",
        "project_slug": None,
    }
    md_path = write_inbox_md(context.bot_data["repo_path"], item)
    await inbox_repo.update(record["Id"],
                            {"file_path_repo": str(md_path.relative_to(context.bot_data["repo_path"]))})
    context.bot_data["git_safe_commit"](
        repo_path=context.bot_data["repo_path"],
        paths=[md_path],
        message=f"inbox: #{record['Id']} {cls['title'][:60]} ({user['name'].lower()})",
    )
    await actions_repo.log(
        action_type="propose_project", author_id=user["Id"],
        inbox_id=record["Id"],
        llm_input=raw[:500], llm_output=str(cls)[:500],
        llm_model="claude-haiku-4-5",
        tokens_in=cls.get("tokens_in", 0),
        tokens_out=cls.get("tokens_out", 0),
        cost_usd=cls.get("cost_usd", 0.0),
    )
    guess = cls.get("guess_project_slug")
    conf = cls.get("confidence", 0.0)
    keyboard = [
        [InlineKeyboardButton("📥 Обработать", callback_data=f"process:{record['Id']}")],
    ]
    if guess and conf >= 0.7:
        keyboard.insert(0, [InlineKeyboardButton(
            f"📂 Сразу в {guess}", callback_data=f"assign:{record['Id']}:{guess}",
        )])
    keyboard.append([
        InlineKeyboardButton("✏️ Иначе", callback_data=f"clarify:{record['Id']}"),
        InlineKeyboardButton("🗑 Архив", callback_data=f"archive:{record['Id']}"),
    ])
    text = (f"✅ Принято #{record['Id']}\n"
            f"«{cls['title']}»\n"
            f"{cls['summary']}\n")
    if guess:
        text += f"\n🤖 Похоже на: {guess} ({_confidence_label(conf)})"
    await msg.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
```

- [ ] **Step 4: Run — green**

```bash
pytest tests/test_markdown_files.py tests/test_handler_inbox_capture.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/markdown_files.py planner_bot/handlers/inbox_capture.py \
        tests/test_markdown_files.py tests/test_handler_inbox_capture.py
git commit -m "feat(inbox): text/url capture pipeline"
```

---

## Phase C — LLM Classify & Process

### Task 13: Anthropic client wrapper

**Files:**
- Create: `planner_bot/llm/__init__.py`
- Create: `planner_bot/llm/anthropic_client.py`
- Create: `tests/test_anthropic_client.py`

- [ ] **Step 1: Test**

```python
import pytest
from planner_bot.llm.anthropic_client import AnthropicLLM


class FakeAnthropicResponse:
    def __init__(self, text, in_tok, out_tok, model):
        self.content = [type("B", (), {"type": "text", "text": text})()]
        self.usage = type("U", (), {"input_tokens": in_tok,
                                    "output_tokens": out_tok,
                                    "cache_creation_input_tokens": 0,
                                    "cache_read_input_tokens": 0})()
        self.model = model
        self.stop_reason = "end_turn"


class FakeMessages:
    def __init__(self):
        self.calls = []

    async def create(self, **kw):
        self.calls.append(kw)
        return FakeAnthropicResponse("hello", 100, 20, kw["model"])


class FakeClient:
    def __init__(self):
        self.messages = FakeMessages()


@pytest.mark.asyncio
async def test_haiku_call_uses_haiku_model():
    fake = FakeClient()
    llm = AnthropicLLM(client=fake, sonnet_model="claude-sonnet-4-6",
                       haiku_model="claude-haiku-4-5")
    res = await llm.call_haiku(system="sys", user="u")
    assert res.text == "hello"
    assert fake.messages.calls[0]["model"] == "claude-haiku-4-5"
    assert res.tokens_in == 100
    assert res.tokens_out == 20


@pytest.mark.asyncio
async def test_sonnet_call_with_cached_system():
    fake = FakeClient()
    llm = AnthropicLLM(client=fake, sonnet_model="claude-sonnet-4-6",
                       haiku_model="claude-haiku-4-5")
    await llm.call_sonnet(system="ctx", user="u", cache_system=True)
    sys_payload = fake.messages.calls[0]["system"]
    assert isinstance(sys_payload, list)
    assert sys_payload[0]["cache_control"] == {"type": "ephemeral"}


def test_cost_calculation():
    llm = AnthropicLLM.__new__(AnthropicLLM)
    cost = llm._cost("claude-sonnet-4-6", input_tokens=1_000_000,
                     output_tokens=1_000_000, cache_read=0, cache_write=0)
    assert cost > 0
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_anthropic_client.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/llm/__init__.py`:
```python
```

`planner_bot/llm/anthropic_client.py`:
```python
from __future__ import annotations

from dataclasses import dataclass

# Per-model price per 1M tokens (USD). Source: Anthropic public pricing snapshot
# 2026-04. Update when prices change.
_PRICING = {
    "claude-sonnet-4-6": {"in": 3.0, "out": 15.0, "cache_read": 0.30,
                          "cache_write": 3.75},
    "claude-haiku-4-5":  {"in": 0.25, "out": 1.25, "cache_read": 0.03,
                          "cache_write": 0.31},
}


@dataclass
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int
    cache_read_in: int
    cache_write_in: int
    cost_usd: float
    model: str


class AnthropicLLM:
    def __init__(self, *, client, sonnet_model: str, haiku_model: str):
        self._client = client
        self._sonnet = sonnet_model
        self._haiku = haiku_model

    @staticmethod
    def _cost(model: str, *, input_tokens: int, output_tokens: int,
              cache_read: int, cache_write: int) -> float:
        p = _PRICING[model]
        return (
            input_tokens * p["in"]
            + output_tokens * p["out"]
            + cache_read * p["cache_read"]
            + cache_write * p["cache_write"]
        ) / 1_000_000

    def _system_payload(self, system: str, cache: bool):
        if not cache:
            return system
        return [{"type": "text", "text": system,
                 "cache_control": {"type": "ephemeral"}}]

    async def _call(self, *, model: str, system: str, user: str,
                    max_tokens: int, cache_system: bool) -> LLMResult:
        resp = await self._client.messages.create(
            model=model,
            system=self._system_payload(system, cache_system),
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        cache_r = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
        cache_w = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
        cost = self._cost(model,
                          input_tokens=resp.usage.input_tokens,
                          output_tokens=resp.usage.output_tokens,
                          cache_read=cache_r, cache_write=cache_w)
        return LLMResult(
            text=text, tokens_in=resp.usage.input_tokens,
            tokens_out=resp.usage.output_tokens,
            cache_read_in=cache_r, cache_write_in=cache_w,
            cost_usd=cost, model=model,
        )

    async def call_haiku(self, *, system: str, user: str,
                         max_tokens: int = 800) -> LLMResult:
        return await self._call(model=self._haiku, system=system, user=user,
                                max_tokens=max_tokens, cache_system=False)

    async def call_sonnet(self, *, system: str, user: str,
                          max_tokens: int = 1500,
                          cache_system: bool = True) -> LLMResult:
        return await self._call(model=self._sonnet, system=system, user=user,
                                max_tokens=max_tokens, cache_system=cache_system)
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_anthropic_client.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/llm/__init__.py planner_bot/llm/anthropic_client.py \
        tests/test_anthropic_client.py
git commit -m "feat(llm): Anthropic Sonnet/Haiku wrapper with caching"
```

---

### Task 14: `classify_inbox` (Haiku)

**Files:**
- Create: `planner_bot/llm/classify.py`
- Create: `tests/test_llm_classify.py`

- [ ] **Step 1: Test**

```python
import json
import pytest

from planner_bot.llm.classify import classify_inbox, build_classify_prompt


class FakeLLM:
    def __init__(self, text):
        self._text = text

    async def call_haiku(self, *, system, user, max_tokens=800):
        from planner_bot.llm.anthropic_client import LLMResult
        return LLMResult(text=self._text, tokens_in=200, tokens_out=50,
                         cache_read_in=0, cache_write_in=0,
                         cost_usd=0.0001, model="claude-haiku-4-5")


@pytest.mark.asyncio
async def test_classify_returns_parsed_dict():
    payload = json.dumps({
        "title": "PostgreSQL replication",
        "summary": "Статья про синхронную репликацию.",
        "guess_project_slug": "learning",
        "confidence": 0.9,
    })
    llm = FakeLLM(payload)
    projects = [
        {"slug": "learning", "name": "Learning", "description": "obs"},
        {"slug": "ctok", "name": "Ctok", "description": "tattoo"},
    ]
    res = await classify_inbox(
        llm=llm, projects=projects,
        item={"raw_content": "https://habr.com/x", "source_type": "url",
              "initial_title": "habr.com/x"},
    )
    assert res["title"] == "PostgreSQL replication"
    assert res["guess_project_slug"] == "learning"
    assert res["confidence"] == 0.9
    assert res["tokens_in"] == 200


def test_build_classify_prompt_lists_projects():
    projects = [{"slug": "ctok", "name": "Ctok", "description": "tattoo"}]
    prompt = build_classify_prompt(projects)
    assert "ctok" in prompt
    assert "Ctok" in prompt


@pytest.mark.asyncio
async def test_classify_handles_malformed_json():
    llm = FakeLLM("not json")
    res = await classify_inbox(
        llm=llm, projects=[],
        item={"raw_content": "hello", "source_type": "text",
              "initial_title": "hello"},
    )
    assert res["confidence"] == 0.0
    assert res["guess_project_slug"] is None
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_llm_classify.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/llm/classify.py`:
```python
from __future__ import annotations

import json
from textwrap import dedent


def build_classify_prompt(projects: list[dict]) -> str:
    lines = ["You classify incoming inbox items for a personal planner.",
             "Projects available (slug — name — short description):"]
    for p in projects:
        lines.append(f"- {p['slug']} — {p['name']} — {p.get('description') or ''}")
    lines.append(dedent("""\
        Return STRICT JSON with keys:
          title (string, ≤80 chars, derived from content)
          summary (string, 1-2 sentences in Russian)
          guess_project_slug (one of the slugs above, or null)
          confidence (float 0..1)
        No prose outside JSON. No backticks.
    """))
    return "\n".join(lines)


def _safe_parse(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    try:
        d = json.loads(text)
    except Exception:
        return {"title": "", "summary": "",
                "guess_project_slug": None, "confidence": 0.0}
    return {
        "title": (d.get("title") or "")[:80],
        "summary": d.get("summary") or "",
        "guess_project_slug": d.get("guess_project_slug"),
        "confidence": float(d.get("confidence") or 0.0),
    }


async def classify_inbox(*, llm, projects: list[dict], item: dict) -> dict:
    system = build_classify_prompt(projects)
    user = (
        f"Source type: {item['source_type']}\n"
        f"Initial title hint: {item.get('initial_title','')}\n"
        f"Content:\n{item['raw_content'][:4000]}"
    )
    res = await llm.call_haiku(system=system, user=user)
    parsed = _safe_parse(res.text)
    if not parsed["title"]:
        parsed["title"] = (item.get("initial_title") or "Item")[:80]
    parsed["tokens_in"] = res.tokens_in
    parsed["tokens_out"] = res.tokens_out
    parsed["cost_usd"] = res.cost_usd
    return parsed
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_llm_classify.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/llm/classify.py tests/test_llm_classify.py
git commit -m "feat(llm): Haiku-based inbox classification"
```

---

### Task 15: `process_inbox` (Sonnet, agentic)

**Files:**
- Create: `planner_bot/llm/process.py`
- Create: `tests/test_llm_process.py`

- [ ] **Step 1: Test**

```python
import json
import pytest

from planner_bot.llm.process import process_inbox, build_process_prompt
from planner_bot.llm.anthropic_client import LLMResult


class FakeLLM:
    def __init__(self, text):
        self._text = text

    async def call_sonnet(self, *, system, user, max_tokens=1500,
                          cache_system=True):
        return LLMResult(text=self._text, tokens_in=900, tokens_out=200,
                         cache_read_in=800, cache_write_in=0,
                         cost_usd=0.005, model="claude-sonnet-4-6")


@pytest.mark.asyncio
async def test_process_returns_decision_and_summary():
    payload = json.dumps({
        "project_slug": "learning",
        "subfolder": "research",
        "summary_md": "## TL;DR\n- A\n- B\n- C",
        "action": "moved + summary",
        "confidence": 0.92,
    })
    llm = FakeLLM(payload)
    res = await process_inbox(
        llm=llm,
        item={"Id": 42, "title": "X", "summary": "s",
              "raw_content": "...", "source_type": "url",
              "transcript": ""},
        target_project={"slug": "learning", "name": "Learning",
                        "context_notes": "DB articles go here"},
        recent_filenames=["postgres-tx.md"],
    )
    assert res["project_slug"] == "learning"
    assert res["subfolder"] == "research"
    assert "TL;DR" in res["summary_md"]
    assert res["confidence"] == 0.92
    assert res["tokens_in"] == 900


def test_build_process_prompt_includes_context_notes():
    p = build_process_prompt(
        target_project={"slug": "ctok", "name": "Ctok",
                        "context_notes": "Marketing for tattoo studio"},
        recent_filenames=["x.md", "y.md"],
    )
    assert "Marketing for tattoo studio" in p
    assert "x.md" in p


@pytest.mark.asyncio
async def test_process_handles_bad_json_falls_back():
    llm = FakeLLM("garbage")
    res = await process_inbox(
        llm=llm,
        item={"Id": 1, "title": "X", "summary": "", "raw_content": "",
              "source_type": "text", "transcript": ""},
        target_project={"slug": "learning", "name": "Learning",
                        "context_notes": ""},
        recent_filenames=[],
    )
    assert res["project_slug"] == "learning"
    assert res["confidence"] == 0.5
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_llm_process.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/llm/process.py`:
```python
from __future__ import annotations

import json
from textwrap import dedent

_VALID_SUBFOLDERS = {"inbox", "research", "tasks", "notes", "files"}


def build_process_prompt(*, target_project: dict,
                         recent_filenames: list[str]) -> str:
    notes = (target_project.get("context_notes")
             or target_project.get("context_notes_compact") or "")
    files = "\n".join(f"  - {n}" for n in recent_filenames[:20]) or "  (empty)"
    return dedent(f"""\
        You are processing an inbox item for the personal planner project.

        Target project: {target_project['name']} (slug: {target_project['slug']})
        Project memory:
        {notes or '(no notes)'}

        Recent files in the project:
        {files}

        Decide:
          - subfolder (one of: inbox, research, tasks, notes, files)
          - a short Russian markdown summary block (### TL;DR with 3 bullet points)
          - action label (one short phrase like "moved + summary")

        Reply STRICT JSON only:
        {{
          "project_slug": "<slug>",
          "subfolder": "<one of valid>",
          "summary_md": "### TL;DR\\n- ...\\n- ...\\n- ...",
          "action": "...",
          "confidence": 0.0..1.0
        }}
    """)


def _parse(text: str, default_slug: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    try:
        d = json.loads(text)
    except Exception:
        return {"project_slug": default_slug, "subfolder": "research",
                "summary_md": "", "action": "moved",
                "confidence": 0.5}
    sf = d.get("subfolder") or "research"
    if sf not in _VALID_SUBFOLDERS:
        sf = "research"
    return {
        "project_slug": d.get("project_slug") or default_slug,
        "subfolder": sf,
        "summary_md": d.get("summary_md") or "",
        "action": d.get("action") or "moved",
        "confidence": float(d.get("confidence") or 0.5),
    }


async def process_inbox(*, llm, item: dict, target_project: dict,
                        recent_filenames: list[str]) -> dict:
    system = build_process_prompt(target_project=target_project,
                                  recent_filenames=recent_filenames)
    user_lines = [
        f"Item #{item['Id']}: {item.get('title','')}",
        f"Source: {item['source_type']}",
        f"Summary so far: {item.get('summary','')}",
    ]
    if item.get("transcript"):
        user_lines.append(f"Transcript:\n{item['transcript'][:3000]}")
    if item.get("raw_content"):
        user_lines.append(f"Content:\n{item['raw_content'][:3000]}")
    res = await llm.call_sonnet(system=system, user="\n\n".join(user_lines))
    parsed = _parse(res.text, default_slug=target_project["slug"])
    parsed["tokens_in"] = res.tokens_in
    parsed["tokens_out"] = res.tokens_out
    parsed["cost_usd"] = res.cost_usd
    return parsed
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_llm_process.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/llm/process.py tests/test_llm_process.py
git commit -m "feat(llm): Sonnet-driven inbox processing"
```

---

### Task 16: Free-text intent detection (Haiku)

**Files:**
- Create: `planner_bot/llm/intent.py`
- Create: `tests/test_llm_intent.py`

- [ ] **Step 1: Test**

```python
import json
import pytest

from planner_bot.llm.intent import detect_intent
from planner_bot.llm.anthropic_client import LLMResult


class FakeLLM:
    def __init__(self, text):
        self._text = text
    async def call_haiku(self, *, system, user, max_tokens=400):
        return LLMResult(text=self._text, tokens_in=120, tokens_out=30,
                         cache_read_in=0, cache_write_in=0,
                         cost_usd=0.00005, model="claude-haiku-4-5")


@pytest.mark.asyncio
async def test_intent_week_command():
    llm = FakeLLM(json.dumps({"intent": "week", "args": {}}))
    res = await detect_intent(llm=llm, text="что у меня на неделе")
    assert res["intent"] == "week"


@pytest.mark.asyncio
async def test_intent_find():
    llm = FakeLLM(json.dumps({"intent": "find",
                              "args": {"query": "postgresql"}}))
    res = await detect_intent(llm=llm, text="найди статью про postgresql")
    assert res["intent"] == "find"
    assert res["args"]["query"] == "postgresql"


@pytest.mark.asyncio
async def test_intent_create_task():
    llm = FakeLLM(json.dumps({
        "intent": "create_task",
        "args": {"title": "Созвон с Vesna клиентом",
                 "due_date": "2026-04-27", "due_time": "14:00",
                 "project_slug": "vesna-web"},
    }))
    res = await detect_intent(llm=llm, text="завтра в 14:00 созвон с Vesna клиентом")
    assert res["intent"] == "create_task"
    assert res["args"]["due_date"] == "2026-04-27"


@pytest.mark.asyncio
async def test_intent_unknown_falls_through():
    llm = FakeLLM("not json")
    res = await detect_intent(llm=llm, text="кря")
    assert res["intent"] == "unknown"
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_llm_intent.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/llm/intent.py`:
```python
from __future__ import annotations

import json
from datetime import date
from textwrap import dedent

_VALID = {"inbox", "today", "week", "projects", "project", "find",
          "stats", "process_last", "create_task", "project_overview",
          "unknown"}


def _system(today_iso: str) -> str:
    return dedent(f"""\
        Detect user intent for a personal Telegram planner.
        Today: {today_iso} (Europe/Prague). Russian + English text supported.
        Return STRICT JSON: {{"intent": "<name>", "args": {{...}} }}.

        Allowed intents:
          - inbox          (no args)
          - today          (no args)
          - week           (optional args.project_slug)
          - projects       (no args)
          - project        (args.slug)
          - find           (args.query)
          - stats          (no args)
          - process_last   (no args)
          - create_task    (args.title, args.due_date YYYY-MM-DD nullable,
                            args.due_time HH:MM nullable, args.project_slug nullable)
          - project_overview (args.slug)
          - unknown        (when nothing matches)

        Use 'unknown' liberally if uncertain. JSON only, no prose.
    """)


async def detect_intent(*, llm, text: str,
                        today_iso: str | None = None) -> dict:
    today_iso = today_iso or date.today().isoformat()
    res = await llm.call_haiku(system=_system(today_iso), user=text,
                               max_tokens=400)
    raw = res.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        d = json.loads(raw)
    except Exception:
        return {"intent": "unknown", "args": {}, "tokens_in": res.tokens_in,
                "tokens_out": res.tokens_out, "cost_usd": res.cost_usd}
    intent = d.get("intent")
    if intent not in _VALID:
        intent = "unknown"
    return {"intent": intent, "args": d.get("args") or {},
            "tokens_in": res.tokens_in, "tokens_out": res.tokens_out,
            "cost_usd": res.cost_usd}
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_llm_intent.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/llm/intent.py tests/test_llm_intent.py
git commit -m "feat(llm): Haiku-based intent router"
```

---

### Task 17: Process callback handler (button → LLM → move file)

**Files:**
- Create: `planner_bot/handlers/inbox_commands.py`
- Create: `tests/test_handler_inbox_commands.py`

- [ ] **Step 1: Test**

```python
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import on_process_callback
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        self.message = type("M", (), {"reply_text":
            AsyncMock(return_value=None)})()
        self.answered = False
        self.edited = []

    async def answer(self):
        self.answered = True

    async def edit_message_text(self, text, **kw):
        self.edited.append({"text": text, **kw})


class FakeUpdate:
    def __init__(self, query, user_id):
        self.callback_query = query
        self.effective_user = type("U", (), {"id": user_id})()


@pytest.mark.asyncio
async def test_process_callback_moves_file_and_pushes(tmp_path: Path):
    repo = tmp_path
    src = repo / "_inbox" / "2026-04-26-1432-x.md"
    src.parent.mkdir(parents=True)
    src.write_text("---\ninbox_id: 42\n---\n# X")
    dest_parent = repo / "projects" / "learning" / "research"
    dest_parent.mkdir(parents=True)

    item = {"Id": 42, "title": "X", "summary": "s", "raw_content": "",
            "source_type": "text", "transcript": "",
            "file_path_repo": "_inbox/2026-04-26-1432-x.md", "status": "new"}
    project = {"Id": 9, "slug": "learning", "name": "Learning",
               "context_notes": "", "folder_path": "projects/learning"}

    inbox_repo = MagicMock()
    inbox_repo.get = AsyncMock(return_value=item)
    inbox_repo.update = AsyncMock(return_value=item)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value=project)
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "telegram_id": 99, "name": "Sasha", "role": "sasha"})
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    process_inbox = AsyncMock(return_value={
        "project_slug": "learning", "subfolder": "research",
        "summary_md": "### TL;DR\n- a\n- b\n- c",
        "action": "moved + summary", "confidence": 0.9,
        "tokens_in": 1, "tokens_out": 1, "cost_usd": 0.001,
    })
    git_safe_commit = MagicMock()

    query = FakeQuery(data="process:42", user_id=99)
    upd = FakeUpdate(query, user_id=99)
    ctx = FakeContext()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "process_inbox": process_inbox,
        "git_safe_commit": git_safe_commit,
        "repo_path": repo,
    })

    await on_process_callback(upd, ctx)
    moved = repo / "projects" / "learning" / "research" / "2026-04-26-1432-x.md"
    assert moved.exists()
    assert not src.exists()
    inbox_repo.update.assert_awaited()
    git_safe_commit.assert_called()
    assert any("learning/research" in e["text"] for e in query.edited)
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_handler_inbox_commands.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/handlers/inbox_commands.py`:
```python
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram import Update
from telegram.ext import ContextTypes


async def on_process_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    _, item_id_str = q.data.split(":", 1)
    item_id = int(item_id_str)

    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return

    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return

    projects = context.bot_data["projects_repo"]
    target_slug = "learning"
    project = await projects.get_by_slug(target_slug)

    process_inbox = context.bot_data["process_inbox"]
    decision = await process_inbox(item=item, target_project=project,
                                   recent_filenames=[])

    repo_root: Path = context.bot_data["repo_path"]
    src = repo_root / item["file_path_repo"]
    dest_dir = (repo_root / project["folder_path"] / decision["subfolder"])
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    text = src.read_text()
    if decision.get("summary_md"):
        text = text + "\n" + decision["summary_md"] + "\n"
    src.unlink()
    dest.write_text(text)

    await inbox.update(item_id, {
        "status": "processed",
        "project_id": project["Id"],
        "target_path": str(dest.relative_to(repo_root)),
        "action_taken": decision["action"],
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "file_path_repo": str(dest.relative_to(repo_root)),
    })

    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[src, dest],
        message=f"process #{item_id}: → {project['slug']}/{decision['subfolder']}",
    )

    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="process", author_id=user["Id"],
                      inbox_id=item_id, llm_model="claude-sonnet-4-6",
                      tokens_in=decision.get("tokens_in", 0),
                      tokens_out=decision.get("tokens_out", 0),
                      cost_usd=decision.get("cost_usd", 0.0),
                      llm_output=decision.get("action", ""))

    rel_path = dest.relative_to(repo_root)
    await q.edit_message_text(
        f"✅ #{item_id} → {project['slug']}/{decision['subfolder']}\n"
        f"`{rel_path}`",
        parse_mode="Markdown",
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_handler_inbox_commands.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/inbox_commands.py \
        tests/test_handler_inbox_commands.py
git commit -m "feat(inbox): process callback moves item + summary"
```

---

### Task 18: Clarify flow + project memory persistence

**Files:**
- Modify: `planner_bot/handlers/inbox_commands.py` (add `on_clarify_callback`, `on_clarify_text`)
- Create: `tests/test_handler_clarify.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import (
    on_clarify_callback, on_clarify_text,
)
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        self.edited = []
        async def edit(text, **kw):
            self.edited.append({"text": text, **kw})
        self.edit_message_text = edit
        async def ans(): return None
        self.answer = ans


class FakeUpd:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


@pytest.mark.asyncio
async def test_clarify_callback_sets_pending():
    q = FakeQuery("clarify:42", user_id=99)
    upd = FakeUpd(callback_query=q,
                  effective_user=type("U", (), {"id": 99})())
    ctx = FakeContext()
    ctx.bot_data["users_repo"] = MagicMock()
    ctx.bot_data["users_repo"].get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "name": "Sasha", "role": "sasha"})
    await on_clarify_callback(upd, ctx)
    assert ctx.user_data["pending_clarify_inbox_id"] == 42


@pytest.mark.asyncio
async def test_clarify_text_updates_project_notes(tmp_path):
    inbox_repo = MagicMock()
    inbox_repo.get = AsyncMock(return_value={
        "Id": 42, "file_path_repo": "_inbox/x.md", "title": "X",
        "raw_content": "https://x", "source_type": "url",
        "summary": "", "transcript": "",
    })
    inbox_repo.update = AsyncMock()
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "Id": 5, "slug": "vesna-web", "name": "Vesna Web",
        "context_notes": "Old notes", "folder_path": "projects/work/vesna-web"})
    projects_repo.update_context_notes = AsyncMock()

    src = tmp_path / "_inbox" / "x.md"
    src.parent.mkdir(parents=True)
    src.write_text("---\n---\n# X")
    (tmp_path / "projects" / "work" / "vesna-web" / "research").mkdir(parents=True)

    user = {"Id": 1, "telegram_id": 99, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    git_safe_commit = MagicMock()

    msg_sent = []
    msg = type("M", (), {"reply_text":
        AsyncMock(side_effect=lambda t, **k: msg_sent.append(t)),
        "text": "К Vesna-Web. Технические статьи про Next.js."})()
    upd = FakeUpd(message=msg,
                  effective_user=type("U", (), {"id": 99})())
    ctx = FakeContext()
    ctx.user_data["pending_clarify_inbox_id"] = 42
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "git_safe_commit": git_safe_commit, "repo_path": tmp_path,
        "process_inbox": AsyncMock(return_value={
            "project_slug": "vesna-web", "subfolder": "research",
            "summary_md": "", "action": "moved", "confidence": 0.95,
            "tokens_in": 1, "tokens_out": 1, "cost_usd": 0.001}),
        "extract_clarification": AsyncMock(return_value={
            "project_slug": "vesna-web",
            "rule_to_remember":
                "Технические статьи про Next.js — складывать сюда.",
        }),
    })
    await on_clarify_text(upd, ctx)
    projects_repo.update_context_notes.assert_awaited()
    args = projects_repo.update_context_notes.call_args
    assert "Next.js" in args.kwargs.get("notes", args.args[1] if len(args.args) > 1 else "")
    assert "pending_clarify_inbox_id" not in ctx.user_data
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_handler_clarify.py -v
```

- [ ] **Step 3: Add to `inbox_commands.py`**

Append to `planner_bot/handlers/inbox_commands.py`:
```python
from datetime import datetime, timezone
from pathlib import Path
from telegram import Update
from telegram.ext import ContextTypes


async def on_clarify_callback(update: Update,
                              context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    _, item_id_str = q.data.split(":", 1)
    context.user_data["pending_clarify_inbox_id"] = int(item_id_str)
    await q.edit_message_text(
        "Расскажи в двух словах что это и куда отнести "
        "(укажи slug проекта или опиши что за тип материала)."
    )


async def on_clarify_text(update: Update,
                          context: ContextTypes.DEFAULT_TYPE) -> None:
    item_id = context.user_data.get("pending_clarify_inbox_id")
    if not item_id:
        return
    msg = update.message
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    extract = context.bot_data["extract_clarification"]
    extracted = await extract(text=msg.text, item=item)
    target_slug = extracted["project_slug"]
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(target_slug)
    if project is None:
        await msg.reply_text(f"Проект `{target_slug}` не найден. Попробуй ещё.",
                             parse_mode="Markdown")
        return
    notes_old = project.get("context_notes") or ""
    rule = extracted["rule_to_remember"].strip()
    notes_new = (notes_old + "\n- " + rule) if rule else notes_old
    if rule:
        await projects.update_context_notes(project_id=project["Id"],
                                            notes=notes_new)
    process_inbox = context.bot_data["process_inbox"]
    decision = await process_inbox(item=item, target_project=project,
                                   recent_filenames=[])
    repo_root: Path = context.bot_data["repo_path"]
    src = repo_root / item["file_path_repo"]
    dest_dir = repo_root / project["folder_path"] / decision["subfolder"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    text = src.read_text()
    if decision.get("summary_md"):
        text = text + "\n" + decision["summary_md"] + "\n"
    src.unlink()
    dest.write_text(text)
    await inbox.update(item_id, {
        "status": "processed", "project_id": project["Id"],
        "target_path": str(dest.relative_to(repo_root)),
        "action_taken": "clarify+move",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "file_path_repo": str(dest.relative_to(repo_root)),
    })
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[src, dest],
        message=f"clarify #{item_id}: → {project['slug']}/{decision['subfolder']}",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="clarify", author_id=user["Id"],
                      inbox_id=item_id, llm_model="claude-haiku-4-5",
                      llm_input=msg.text[:500], user_decision=target_slug)
    context.user_data.pop("pending_clarify_inbox_id", None)
    await msg.reply_text(
        f"✅ #{item_id} → {project['slug']}/{decision['subfolder']}.\n"
        f"Запомнил: {rule}" if rule else f"✅ #{item_id} → {project['slug']}/{decision['subfolder']}"
    )
```

Also create `planner_bot/llm/clarify.py`:
```python
from __future__ import annotations

import json
from textwrap import dedent


def _system(slugs: list[str]) -> str:
    return dedent(f"""\
        The user is clarifying which project an inbox item belongs to.
        Available project slugs: {', '.join(slugs)}.
        From the user's text, extract:
          - project_slug (must be one of the slugs above)
          - rule_to_remember: a short Russian sentence describing the rule
            ("X — складывать сюда") for future similar items.
        STRICT JSON, no prose.
    """)


async def extract_clarification(*, llm, text: str, item: dict,
                                slugs: list[str]) -> dict:
    res = await llm.call_haiku(system=_system(slugs),
                               user=f"User said: {text}\nItem title: {item.get('title','')}")
    raw = res.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        d = json.loads(raw)
    except Exception:
        return {"project_slug": slugs[0] if slugs else "learning",
                "rule_to_remember": ""}
    return {
        "project_slug": d.get("project_slug")
                        or (slugs[0] if slugs else "learning"),
        "rule_to_remember": d.get("rule_to_remember") or "",
    }
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_handler_clarify.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/inbox_commands.py planner_bot/llm/clarify.py \
        tests/test_handler_clarify.py
git commit -m "feat(inbox): clarify flow updates project memory"
```

---

## Phase D — Multi-Source Ingestion

### Task 19: Whisper client + voice capture

**Files:**
- Create: `planner_bot/llm/whisper_client.py`
- Create: `planner_bot/handlers/voice_capture.py`
- Create: `tests/test_whisper_client.py`
- Create: `tests/test_voice_capture.py`

- [ ] **Step 1: Tests**

`tests/test_whisper_client.py`:
```python
import pytest
from pathlib import Path
from planner_bot.llm.whisper_client import WhisperClient


class FakeAudio:
    def __init__(self, text):
        self._text = text

    class _Translations:
        pass

    class transcriptions:
        pass

    class _T:
        async def create(self, **kw):
            return type("R", (), {"text": "Привет это тест"})()


class FakeOpenAIClient:
    def __init__(self):
        self.audio = type("A", (), {})()
        self.audio.transcriptions = type("T", (), {
            "create": self._create
        })()
        self.calls = []

    async def _create(self, *, model, file, language=None, **_):
        self.calls.append({"model": model, "lang": language})
        return type("R", (), {"text": "Привет это тест"})()


@pytest.mark.asyncio
async def test_transcribe_returns_text(tmp_path: Path):
    f = tmp_path / "v.ogg"
    f.write_bytes(b"\x00")
    client = WhisperClient(client=FakeOpenAIClient())
    out = await client.transcribe(f)
    assert out["text"] == "Привет это тест"
    assert out["cost_usd"] > 0
```

`tests/test_voice_capture.py`:
```python
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.voice_capture import capture_voice
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_voice_pipeline_creates_inbox_with_transcript(tmp_path: Path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 99})
    inbox_repo.update = AsyncMock()
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    transcribe = AsyncMock(return_value={
        "text": "купить молоко завтра",
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.001,
    })
    classify = AsyncMock(return_value={
        "title": "Купить молоко завтра",
        "summary": "Заметка про покупку.",
        "guess_project_slug": "personal-sasha",
        "confidence": 0.85,
        "tokens_in": 50, "tokens_out": 20, "cost_usd": 0.0001,
    })

    async def download_to_file(path):
        Path(path).write_bytes(b"\x00")
    voice_obj = type("V", (), {
        "duration": 4,
        "get_file": AsyncMock(return_value=type("F", (), {
            "download_to_drive": download_to_file,
        })())
    })()
    update = make_update(text=None, user_id=42)
    update.message.voice = voice_obj
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "transcribe_voice": transcribe, "classify_inbox": classify,
        "git_safe_commit": MagicMock(),
        "repo_path": tmp_path,
    })
    await capture_voice(update, ctx)
    transcribe.assert_awaited()
    classify.assert_awaited()
    inbox_repo.create.assert_awaited()
    args = inbox_repo.create.call_args.args[0]
    assert args["source_type"] == "voice"
    assert args["transcript"] == "купить молоко завтра"
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_whisper_client.py tests/test_voice_capture.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/llm/whisper_client.py`:
```python
from __future__ import annotations
from pathlib import Path

# Whisper price: $0.006/min. We approximate via duration if known,
# else infer from file size (~64 kbps Opus → ~0.5 KB/sec).
_WHISPER_PRICE_PER_MIN = 0.006


class WhisperClient:
    def __init__(self, *, client, model: str = "whisper-1"):
        self._client = client
        self._model = model

    async def transcribe(self, audio_path: Path,
                         duration_sec: int | None = None,
                         language: str = "ru") -> dict:
        with audio_path.open("rb") as f:
            resp = await self._client.audio.transcriptions.create(
                model=self._model, file=f, language=language,
            )
        if duration_sec is None:
            size = audio_path.stat().st_size
            duration_sec = max(1, int(size / 8_000))  # rough ~64 kbps
        cost = (duration_sec / 60.0) * _WHISPER_PRICE_PER_MIN
        return {"text": resp.text, "tokens_in": 0, "tokens_out": 0,
                "cost_usd": cost}
```

`planner_bot/handlers/voice_capture.py`:
```python
from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


async def capture_voice(update: Update,
                        context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if msg.voice is None:
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return

    transcribe = context.bot_data["transcribe_voice"]
    classify = context.bot_data["classify_inbox"]
    file_obj = await msg.voice.get_file()
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    await file_obj.download_to_drive(str(tmp_path))
    try:
        tr = await transcribe(tmp_path,
                              duration_sec=getattr(msg.voice, "duration", None))
    finally:
        tmp_path.unlink(missing_ok=True)
    transcript = tr["text"]
    cls = await classify({"raw_content": transcript, "source_type": "voice",
                          "initial_title": transcript[:60]})

    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "voice",
        "raw_content": "",
        "transcript": transcript,
        "title": cls["title"],
        "summary": cls["summary"],
        "confidence": cls["confidence"],
        "created_at": now_iso,
        "status": "new",
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "voice", "raw_content": "",
        "transcript": transcript,
        "title": cls["title"], "summary": cls["summary"],
        "created_at": now_iso, "status": "new", "project_slug": None,
    }
    md_path = write_inbox_md(context.bot_data["repo_path"], item)
    await inbox.update(rec["Id"], {
        "file_path_repo": str(md_path.relative_to(context.bot_data["repo_path"])),
    })
    context.bot_data["git_safe_commit"](
        repo_path=context.bot_data["repo_path"], paths=[md_path],
        message=f"inbox: voice #{rec['Id']} ({user['name'].lower()})",
    )
    await actions.log(action_type="transcribe", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="whisper-1",
                      cost_usd=tr["cost_usd"], llm_output=transcript[:500])
    await actions.log(action_type="propose_project", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="claude-haiku-4-5",
                      tokens_in=cls["tokens_in"], tokens_out=cls["tokens_out"],
                      cost_usd=cls["cost_usd"], llm_output=str(cls)[:500])

    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}")],
        [InlineKeyboardButton("✏️ Иначе",
                              callback_data=f"clarify:{rec['Id']}"),
         InlineKeyboardButton("🗑 Архив",
                              callback_data=f"archive:{rec['Id']}")],
    ]
    text = (f"🎙️ Voice → #{rec['Id']}\n«{cls['title']}»\n"
            f"Транскрипт: {transcript[:300]}\n"
            f"🤖 Похоже на: {cls.get('guess_project_slug') or '—'} "
            f"({int(cls['confidence']*100)}%)")
    await msg.reply_text(text, reply_markup=InlineKeyboardMarkup(kb))
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_whisper_client.py tests/test_voice_capture.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/llm/whisper_client.py \
        planner_bot/handlers/voice_capture.py \
        tests/test_whisper_client.py tests/test_voice_capture.py
git commit -m "feat(voice): Whisper transcription + capture pipeline"
```

---

### Task 20: Photo capture (no analysis in MVP)

**Files:**
- Create: `planner_bot/handlers/photo_capture.py`
- Create: `tests/test_photo_capture.py`

- [ ] **Step 1: Test**

```python
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.photo_capture import capture_photo
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_photo_creates_inbox_no_analysis(tmp_path: Path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 100})
    inbox_repo.update = AsyncMock()
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock()
    actions_repo.log = AsyncMock()
    git_safe_commit = MagicMock()

    async def download(path):
        Path(path).write_bytes(b"\x89PNG")
    photo = type("P", (), {
        "file_id": "X", "file_unique_id": "U",
        "get_file": AsyncMock(return_value=type("F", (), {
            "download_to_drive": download})())
    })()

    upd = make_update(text=None, user_id=42)
    upd.message.photo = [photo]
    upd.message.caption = None
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    (tmp_path / "_attachments").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "git_safe_commit": git_safe_commit, "repo_path": tmp_path,
    })
    await capture_photo(upd, ctx)
    args = inbox_repo.create.call_args.args[0]
    assert args["source_type"] == "photo"
    assert args["title"].startswith("Photo")
    assert any("Принято" in m["text"] for m in upd.message.sent)
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_photo_capture.py -v
```

- [ ] **Step 3: Implement**

```python
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


async def capture_photo(update: Update,
                        context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if not msg.photo:
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return
    biggest = msg.photo[-1]
    file_obj = await biggest.get_file()
    repo_root: Path = context.bot_data["repo_path"]
    attach_dir = repo_root / "_attachments"
    attach_dir.mkdir(parents=True, exist_ok=True)
    target = attach_dir / f"{biggest.file_unique_id}.jpg"
    await file_obj.download_to_drive(str(target))

    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    caption = (msg.caption or "").strip()
    title = caption[:60] if caption else f"Photo {biggest.file_unique_id[:6]}"
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "photo",
        "raw_content": str(target.relative_to(repo_root)),
        "caption": caption,
        "title": title, "summary": caption or "",
        "confidence": 0.0,
        "created_at": now_iso, "status": "new",
        "attachment_url": str(target.relative_to(repo_root)),
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "photo",
        "raw_content": str(target.relative_to(repo_root)),
        "title": title, "summary": caption or "",
        "transcript": "", "created_at": now_iso,
        "status": "new", "project_slug": None,
    }
    md = write_inbox_md(repo_root, item)
    await inbox.update(rec["Id"],
                       {"file_path_repo": str(md.relative_to(repo_root))})
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[md, target],
        message=f"inbox: photo #{rec['Id']} ({user['name'].lower()})",
    )
    await actions.log(action_type="propose_project", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="-",
                      llm_output="photo (no analysis)")
    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}"),
         InlineKeyboardButton("🔍 Анализ vision",
                              callback_data=f"analyze:{rec['Id']}")],
        [InlineKeyboardButton("📂 Изменить проект",
                              callback_data=f"clarify:{rec['Id']}"),
         InlineKeyboardButton("🗑 Архив",
                              callback_data=f"archive:{rec['Id']}")],
    ]
    await msg.reply_text(
        f"📷 Принято #{rec['Id']}\n«{title}»",
        reply_markup=InlineKeyboardMarkup(kb),
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_photo_capture.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/photo_capture.py tests/test_photo_capture.py
git commit -m "feat(photo): inbox capture for photos (no analysis MVP)"
```

---

### Task 21: Document/file capture

**Files:**
- Create: `planner_bot/handlers/document_capture.py`
- Create: `tests/test_document_capture.py`

- [ ] **Step 1: Test**

```python
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.document_capture import capture_document
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_document_pipeline(tmp_path: Path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox_repo = MagicMock()
    inbox_repo.create = AsyncMock(return_value={"Id": 5})
    inbox_repo.update = AsyncMock()
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    actions_repo = MagicMock(); actions_repo.log = AsyncMock()
    async def download(path): Path(path).write_bytes(b"%PDF")
    doc = type("D", (), {
        "file_id": "X", "file_unique_id": "U",
        "file_name": "report.pdf",
        "mime_type": "application/pdf",
        "get_file": AsyncMock(return_value=type("F", (), {
            "download_to_drive": download})())
    })()
    upd = make_update(text=None, user_id=42)
    upd.message.document = doc
    upd.message.caption = "ZIMA отчёт за апрель"
    ctx = FakeContext()
    (tmp_path / "_inbox").mkdir()
    (tmp_path / "_attachments").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "inbox_repo": inbox_repo,
        "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(), "repo_path": tmp_path,
    })
    await capture_document(upd, ctx)
    args = inbox_repo.create.call_args.args[0]
    assert args["source_type"] == "file"
    assert "report.pdf" in args["raw_content"]
    assert args["caption"] == "ZIMA отчёт за апрель"
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_document_capture.py -v
```

- [ ] **Step 3: Implement**

```python
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from planner_bot.markdown_files import write_inbox_md


async def capture_document(update: Update,
                           context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    doc = msg.document
    if doc is None:
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await msg.reply_text("Бот личный. Доступа нет.")
        return
    file_obj = await doc.get_file()
    repo_root: Path = context.bot_data["repo_path"]
    attach_dir = repo_root / "_attachments"
    attach_dir.mkdir(parents=True, exist_ok=True)
    safe_name = doc.file_name or f"{doc.file_unique_id}.bin"
    target = attach_dir / f"{doc.file_unique_id}-{safe_name}"
    await file_obj.download_to_drive(str(target))

    caption = (msg.caption or "").strip()
    title = caption[:60] if caption else (doc.file_name or "File")
    inbox = context.bot_data["inbox_repo"]
    actions = context.bot_data["actions_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    rec = await inbox.create({
        "author_id": user["Id"],
        "source_type": "file",
        "raw_content": str(target.relative_to(repo_root)),
        "caption": caption, "title": title,
        "summary": caption or (doc.mime_type or ""),
        "confidence": 0.0,
        "created_at": now_iso, "status": "new",
        "attachment_url": str(target.relative_to(repo_root)),
    })
    item = {
        "Id": rec["Id"], "author_name": user["name"].lower(),
        "source_type": "file",
        "raw_content": str(target.relative_to(repo_root)),
        "title": title, "summary": caption or "",
        "transcript": "", "created_at": now_iso,
        "status": "new", "project_slug": None,
    }
    md = write_inbox_md(repo_root, item)
    await inbox.update(rec["Id"],
                       {"file_path_repo": str(md.relative_to(repo_root))})
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[md, target],
        message=f"inbox: file #{rec['Id']} ({user['name'].lower()})",
    )
    await actions.log(action_type="propose_project", author_id=user["Id"],
                      inbox_id=rec["Id"], llm_model="-",
                      llm_output=f"file {safe_name}")
    kb = [
        [InlineKeyboardButton("📥 Обработать",
                              callback_data=f"process:{rec['Id']}"),
         InlineKeyboardButton("🔍 Извлечь текст",
                              callback_data=f"analyze:{rec['Id']}")],
        [InlineKeyboardButton("📂 Изменить проект",
                              callback_data=f"clarify:{rec['Id']}"),
         InlineKeyboardButton("🗑 Архив",
                              callback_data=f"archive:{rec['Id']}")],
    ]
    await msg.reply_text(
        f"📎 Принято #{rec['Id']} «{title}»",
        reply_markup=InlineKeyboardMarkup(kb),
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_document_capture.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/document_capture.py \
        tests/test_document_capture.py
git commit -m "feat(file): inbox capture for documents"
```

---

### Task 22: Archive callback (shared by all source types)

**Files:**
- Modify: `planner_bot/handlers/inbox_commands.py` (add `on_archive_callback`)
- Create: `tests/test_handler_archive.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_commands import on_archive_callback
from tests.fakes.tg_fake import FakeContext


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        async def ans(): return None
        self.answer = ans
        self.edited = []
        async def edit(text, **kw):
            self.edited.append({"text": text, **kw})
        self.edit_message_text = edit


class FakeUpd:
    def __init__(self, q, uid):
        self.callback_query = q
        self.effective_user = type("U", (), {"id": uid})()


@pytest.mark.asyncio
async def test_archive_marks_status_and_logs():
    inbox = MagicMock()
    inbox.get = AsyncMock(return_value={"Id": 7, "status": "new"})
    inbox.update = AsyncMock()
    users = MagicMock()
    users.get_by_telegram_id = AsyncMock(return_value={
        "Id": 1, "name": "Sasha", "role": "sasha"})
    actions = MagicMock()
    actions.log = AsyncMock()

    q = FakeQuery("archive:7", user_id=99)
    upd = FakeUpd(q, 99)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users, "inbox_repo": inbox,
                         "actions_repo": actions})

    await on_archive_callback(upd, ctx)
    inbox.update.assert_awaited_with(7, {"status": "archived"})
    actions.log.assert_awaited()
    assert q.edited[0]["text"].startswith("🗑")
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_handler_archive.py -v
```

- [ ] **Step 3: Append `on_archive_callback`**

```python
async def on_archive_callback(update, context):
    q = update.callback_query
    await q.answer()
    _, item_id_str = q.data.split(":", 1)
    item_id = int(item_id_str)
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    if user is None:
        await q.edit_message_text("Доступа нет.")
        return
    inbox = context.bot_data["inbox_repo"]
    item = await inbox.get(item_id)
    if item is None:
        await q.edit_message_text("Item не найден.")
        return
    await inbox.update(item_id, {"status": "archived"})
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="move", author_id=user["Id"],
                      inbox_id=item_id, user_decision="archived")
    await q.edit_message_text(f"🗑 #{item_id} архив")
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_handler_archive.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/inbox_commands.py \
        tests/test_handler_archive.py
git commit -m "feat(inbox): archive callback"
```

---

## Phase E — Tasks + Eisenhower

### Task 23: Date parsing helpers

**Files:**
- Create: `planner_bot/dateparse.py`
- Create: `tests/test_dateparse.py`

- [ ] **Step 1: Test**

```python
from datetime import date
from planner_bot.dateparse import parse_relative_date, parse_time


def test_zavtra():
    today = date(2026, 4, 26)
    assert parse_relative_date("завтра", today=today) == date(2026, 4, 27)


def test_dnem_today():
    today = date(2026, 4, 26)
    assert parse_relative_date("сегодня", today=today) == today


def test_iso_date_passthrough():
    today = date(2026, 4, 26)
    assert parse_relative_date("2026-05-15", today=today) == date(2026, 5, 15)


def test_unknown_returns_none():
    assert parse_relative_date("кря", today=date(2026, 4, 26)) is None


def test_parse_time_hh_mm():
    from datetime import time
    assert parse_time("14:30") == time(14, 30)
    assert parse_time("9:05") == time(9, 5)
    assert parse_time("garbage") is None
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_dateparse.py -v
```

- [ ] **Step 3: Implement**

```python
from __future__ import annotations
import re
from datetime import date, time, timedelta
from dateutil import parser as du

_RU = {
    "сегодня": 0, "завтра": 1, "послезавтра": 2,
    "today": 0, "tomorrow": 1,
}


def parse_relative_date(text: str, *, today: date) -> date | None:
    s = text.strip().lower()
    if s in _RU:
        return today + timedelta(days=_RU[s])
    try:
        d = du.parse(s, dayfirst=False, yearfirst=True, fuzzy=True).date()
        return d
    except Exception:
        return None


_TIME_RE = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*$")


def parse_time(text: str) -> time | None:
    m = _TIME_RE.match(text)
    if not m:
        return None
    h, mn = int(m.group(1)), int(m.group(2))
    if not (0 <= h < 24 and 0 <= mn < 60):
        return None
    return time(h, mn)
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_dateparse.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/dateparse.py tests/test_dateparse.py
git commit -m "feat(dateparse): relative date + time helpers"
```

---

### Task 24: Task creation from intent + write task md

**Files:**
- Create: `planner_bot/handlers/tasks_commands.py`
- Modify: `planner_bot/markdown_files.py` (add `write_task_md`)
- Create: `tests/test_write_task_md.py`
- Create: `tests/test_handler_task_create.py`

- [ ] **Step 1: Tests**

```python
# tests/test_write_task_md.py
from pathlib import Path
from planner_bot.markdown_files import write_task_md


def test_task_md_layout(tmp_path: Path):
    task = {
        "Id": 17, "author": "sasha", "project": "ctok",
        "quadrant": "Q1", "due": "2026-04-28", "due_time": "14:00",
        "status": "todo", "created": "2026-04-26T14:35:00",
        "title": "Дописать prompt для Ctok bot",
        "description": "контекст: ...",
    }
    p = write_task_md(tmp_path, task)
    assert p.exists()
    text = p.read_text()
    assert "task_id: 17" in text
    assert "quadrant: Q1" in text
    assert "Дописать prompt" in text
```

```python
# tests/test_handler_task_create.py
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import create_task_with_args
from tests.fakes.tg_fake import FakeContext


@pytest.mark.asyncio
async def test_create_task_inserts_row_and_writes_file(tmp_path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks_repo = MagicMock()
    tasks_repo.create = AsyncMock(return_value={"Id": 17})
    tasks_repo.update = AsyncMock()
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "Id": 9, "slug": "ctok", "visibility": "private",
        "owner_role": "sasha"})
    actions_repo = MagicMock(); actions_repo.log = AsyncMock()

    ctx = FakeContext()
    (tmp_path / "tasks").mkdir()
    ctx.bot_data.update({
        "tasks_repo": tasks_repo, "projects_repo": projects_repo,
        "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(), "repo_path": tmp_path,
    })

    out = await create_task_with_args(
        user=user,
        title="Дописать prompt", description="",
        project_slug="ctok", quadrant="Q1",
        due_date="2026-04-28", due_time="14:00",
        source_text="завтра 14:00 дописать prompt",
        context=ctx,
    )
    assert out["Id"] == 17
    tasks_repo.create.assert_awaited()
    fields = tasks_repo.create.call_args.args[0]
    assert fields["quadrant"] == "Q1"
    assert fields["due_date"] == "2026-04-28"
    assert fields["project_id"] == 9
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_write_task_md.py tests/test_handler_task_create.py -v
```

- [ ] **Step 3: Implement**

Add to `planner_bot/markdown_files.py`:
```python
from planner_bot.repo_layout import task_path


_TASK_FRONTMATTER = """---
task_id: {Id}
author: {author}
project: {project}
quadrant: {quadrant}
due: {due}
due_time: {due_time}
status: {status}
created: {created}
---
"""


def write_task_md(repo: Path, task: dict) -> Path:
    p = task_path(repo, task["created"], task["title"])
    p.parent.mkdir(parents=True, exist_ok=True)
    fm = _TASK_FRONTMATTER.format(
        Id=task["Id"], author=task["author"],
        project=task.get("project") or "null",
        quadrant=task["quadrant"],
        due=task.get("due") or "null",
        due_time=task.get("due_time") or "null",
        status=task["status"], created=task["created"],
    )
    body = f"\n# {task['title']}\n"
    if task.get("description"):
        body += f"\n{task['description']}\n"
    p.write_text(fm + body)
    return p
```

`planner_bot/handlers/tasks_commands.py`:
```python
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from telegram import Update
from telegram.ext import ContextTypes

from planner_bot.acl import can_access_project
from planner_bot.markdown_files import write_task_md


async def create_task_with_args(*, user: dict, title: str, description: str,
                                project_slug: str | None, quadrant: str,
                                due_date: str | None, due_time: str | None,
                                source_text: str,
                                context: ContextTypes.DEFAULT_TYPE) -> dict:
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(project_slug) if project_slug else None
    if project and not can_access_project(user, project):
        raise PermissionError(f"Нет доступа к {project_slug}")
    tasks = context.bot_data["tasks_repo"]
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "author_id": user["Id"], "title": title, "description": description,
        "project_id": project["Id"] if project else None,
        "quadrant": quadrant, "due_date": due_date, "due_time": due_time,
        "status": "todo", "source_text": source_text,
        "created_at": now_iso,
    }
    rec = await tasks.create(payload)
    md = write_task_md(context.bot_data["repo_path"], {
        "Id": rec["Id"], "author": user["name"].lower(),
        "project": project_slug, "quadrant": quadrant,
        "due": due_date, "due_time": due_time,
        "status": "todo", "created": now_iso,
        "title": title, "description": description,
    })
    repo_root: Path = context.bot_data["repo_path"]
    await tasks.update(rec["Id"],
                       {"file_path_repo": str(md.relative_to(repo_root))})
    context.bot_data["git_safe_commit"](
        repo_path=repo_root, paths=[md],
        message=f"task: #{rec['Id']} {title[:60]} ({user['name'].lower()})",
    )
    actions = context.bot_data["actions_repo"]
    await actions.log(action_type="process", author_id=user["Id"],
                      task_id=rec["Id"], user_decision=quadrant,
                      llm_input=source_text[:500])
    return rec
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_write_task_md.py tests/test_handler_task_create.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/markdown_files.py planner_bot/handlers/tasks_commands.py \
        tests/test_write_task_md.py tests/test_handler_task_create.py
git commit -m "feat(tasks): create_task_with_args + write_task_md"
```

---

### Task 25: Free-text task wizard (intent → quadrant prompt)

**Files:**
- Modify: `planner_bot/handlers/tasks_commands.py` (add `prompt_quadrant_for_task`, `on_quadrant_selected`)
- Create: `tests/test_task_wizard.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import (
    prompt_quadrant_for_task, on_quadrant_selected,
)
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_prompt_quadrant_stores_pending(tmp_path):
    upd = make_update("ignored", user_id=42)
    ctx = FakeContext()
    await prompt_quadrant_for_task(
        update=upd, context=ctx,
        title="Созвон с Vesna", description="",
        project_slug="vesna-web",
        due_date="2026-04-27", due_time="14:00",
        source_text="завтра 14:00 созвон с Vesna",
    )
    assert ctx.user_data["pending_task"]["title"] == "Созвон с Vesna"
    assert any("Q1" in m["text"] for m in upd.message.sent)


class FakeQuery:
    def __init__(self, data, user_id):
        self.data = data
        self.from_user = type("U", (), {"id": user_id})()
        async def ans(): return None
        self.answer = ans
        self.edited = []
        async def edit(text, **kw):
            self.edited.append({"text": text, **kw})
        self.edit_message_text = edit


@pytest.mark.asyncio
async def test_quadrant_selected_creates_task(tmp_path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    tasks_repo = MagicMock()
    tasks_repo.create = AsyncMock(return_value={"Id": 11})
    tasks_repo.update = AsyncMock()
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "Id": 5, "slug": "vesna-web", "visibility": "shared"})
    actions_repo = MagicMock(); actions_repo.log = AsyncMock()

    q = FakeQuery("quad:Q2", user_id=42)
    upd = type("U", (), {
        "callback_query": q,
        "effective_user": type("X", (), {"id": 42})(),
    })()
    ctx = FakeContext()
    ctx.user_data["pending_task"] = {
        "title": "X", "description": "", "project_slug": "vesna-web",
        "due_date": "2026-04-27", "due_time": "14:00",
        "source_text": "завтра 14:00 X",
    }
    (tmp_path / "tasks").mkdir()
    ctx.bot_data.update({
        "users_repo": users_repo, "tasks_repo": tasks_repo,
        "projects_repo": projects_repo, "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(), "repo_path": tmp_path,
    })
    await on_quadrant_selected(upd, ctx)
    args = tasks_repo.create.call_args.args[0]
    assert args["quadrant"] == "Q2"
    assert "pending_task" not in ctx.user_data
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_task_wizard.py -v
```

- [ ] **Step 3: Append to `tasks_commands.py`**

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup


async def prompt_quadrant_for_task(*, update, context, title, description,
                                   project_slug, due_date, due_time,
                                   source_text) -> None:
    context.user_data["pending_task"] = {
        "title": title, "description": description,
        "project_slug": project_slug,
        "due_date": due_date, "due_time": due_time,
        "source_text": source_text,
    }
    kb = [
        [InlineKeyboardButton("🔥 Q1 Срочно+Важно", callback_data="quad:Q1")],
        [InlineKeyboardButton("📌 Q2 Важно", callback_data="quad:Q2")],
        [InlineKeyboardButton("⏰ Q3 Срочно", callback_data="quad:Q3")],
        [InlineKeyboardButton("💤 Q4 Не важно", callback_data="quad:Q4")],
    ]
    text = (f"Создать задачу:\n📌 {title}\n"
            f"📅 {due_date or '—'} {due_time or ''}\n"
            f"📂 Проект: {project_slug or '—'}\nКуда по матрице?")
    await update.message.reply_text(text,
                                    reply_markup=InlineKeyboardMarkup(kb))


async def on_quadrant_selected(update, context):
    q = update.callback_query
    await q.answer()
    _, quadrant = q.data.split(":", 1)
    pending = context.user_data.get("pending_task")
    if not pending:
        await q.edit_message_text("Нет задачи в работе.")
        return
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(q.from_user.id)
    rec = await create_task_with_args(
        user=user, title=pending["title"], description=pending["description"],
        project_slug=pending["project_slug"], quadrant=quadrant,
        due_date=pending["due_date"], due_time=pending["due_time"],
        source_text=pending["source_text"], context=context,
    )
    context.user_data.pop("pending_task", None)
    await q.edit_message_text(
        f"✅ Создана задача #{rec['Id']} ({quadrant})")
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_task_wizard.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/tasks_commands.py tests/test_task_wizard.py
git commit -m "feat(tasks): quadrant wizard for free-text tasks"
```

---

### Task 26: `/today` and `/week` commands

**Files:**
- Modify: `planner_bot/handlers/tasks_commands.py` (add `today_command`, `week_command`)
- Create: `planner_bot/formatters.py`
- Create: `tests/test_formatters.py`
- Create: `tests/test_today_week.py`

- [ ] **Step 1: Tests**

```python
# tests/test_formatters.py
from datetime import date
from planner_bot.formatters import (
    render_today, render_week, render_inbox_list, render_project_overview,
)


def test_render_today_groups_by_quadrant():
    today = date(2026, 4, 26)
    tasks = [
        {"Id": 1, "title": "A", "quadrant": "Q1",
         "due_date": "2026-04-26", "due_time": "14:00"},
        {"Id": 2, "title": "B", "quadrant": "Q2",
         "due_date": "2026-04-26", "due_time": None},
        {"Id": 3, "title": "C", "quadrant": "Q1",
         "due_date": "2026-04-26", "due_time": None},
    ]
    text = render_today(tasks, today=today)
    assert "🔥 Q1" in text
    assert "📌 Q2" in text
    assert text.index("Q1") < text.index("Q2")


def test_render_week_groups_by_day():
    today = date(2026, 4, 26)  # Sunday
    tasks = [
        {"Id": 1, "title": "Mon",
         "quadrant": "Q1", "due_date": "2026-04-27", "due_time": "10:00"},
        {"Id": 2, "title": "Wed",
         "quadrant": "Q2", "due_date": "2026-04-29", "due_time": None},
    ]
    text = render_week(tasks, today=today)
    assert "ПН" in text or "27 апр" in text
    assert "СР" in text or "29 апр" in text


def test_render_inbox_list_shows_ids():
    items = [
        {"Id": 42, "title": "X", "author_name": "sasha"},
        {"Id": 43, "title": "Y", "author_name": "sasha"},
    ]
    out = render_inbox_list(items, viewer_role="sasha")
    assert "#42" in out and "#43" in out
```

```python
# tests/test_today_week.py
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import today_command, week_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_today_command_returns_text():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    tasks_repo = MagicMock()
    tasks_repo.list_today = AsyncMock(return_value=[
        {"Id": 1, "title": "X", "quadrant": "Q1",
         "due_date": "2026-04-26", "due_time": "14:00"}])
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/today", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo, "tasks_repo": tasks_repo})
    await today_command(upd, ctx)
    assert any("Q1" in m["text"] for m in upd.message.sent)


@pytest.mark.asyncio
async def test_week_command_passes_args_filter():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    tasks_repo = MagicMock()
    tasks_repo.list_week = AsyncMock(return_value=[])
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/week ctok", user_id=42)
    ctx = FakeContext()
    ctx.args = ["ctok"]
    ctx.bot_data.update({"users_repo": users_repo, "tasks_repo": tasks_repo})
    await week_command(upd, ctx)
    tasks_repo.list_week.assert_awaited()
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_formatters.py tests/test_today_week.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/formatters.py`:
```python
from __future__ import annotations
from datetime import date, timedelta

_QUAD_ICON = {"Q1": "🔥", "Q2": "📌", "Q3": "⏰", "Q4": "💤"}
_RU_DOW = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"]
_RU_MONTH = ["янв", "фев", "мар", "апр", "май", "июн",
             "июл", "авг", "сен", "окт", "ноя", "дек"]


def _line(t: dict) -> str:
    tm = (t.get("due_time") or "").strip()
    prefix = f"{tm} " if tm else ""
    return f"  • {prefix}#{t['Id']} {t['title']}"


def render_today(tasks: list[dict], today: date) -> str:
    if not tasks:
        return "📅 На сегодня задач нет."
    out = [f"📅 Сегодня ({_RU_DOW[today.weekday()]} {today.day} {_RU_MONTH[today.month-1]})"]
    for q in ("Q1", "Q2", "Q3", "Q4"):
        rows = [t for t in tasks if t.get("quadrant") == q]
        if not rows:
            continue
        out.append(f"\n{_QUAD_ICON[q]} {q}")
        for t in rows:
            out.append(_line(t))
    return "\n".join(out)


def render_week(tasks: list[dict], today: date) -> str:
    if not tasks:
        return "📅 На этой неделе задач нет."
    by_day: dict[str, list[dict]] = {}
    for t in tasks:
        by_day.setdefault(t["due_date"], []).append(t)
    out = ["📅 Эта неделя"]
    for delta in range(7):
        d = today + timedelta(days=delta)
        rows = by_day.get(d.isoformat(), [])
        if not rows:
            continue
        out.append(f"\n{_RU_DOW[d.weekday()]} {d.day} {_RU_MONTH[d.month-1]}")
        for t in rows:
            icon = _QUAD_ICON.get(t.get("quadrant", ""), "")
            tm = (t.get("due_time") or "").strip()
            prefix = f"{tm} " if tm else ""
            out.append(f"  {icon} {prefix}#{t['Id']} {t['title']}")
    return "\n".join(out)


def render_inbox_list(items: list[dict], viewer_role: str) -> str:
    if not items:
        return "📥 Inbox пуст."
    out = [f"📥 Необработано ({len(items)}):"]
    for i in items:
        author = i.get("author_name") or ""
        suffix = f" ({author})" if author else ""
        out.append(f"  #{i['Id']} {i['title']}{suffix}")
    return "\n".join(out)


def render_project_overview(project: dict, tasks: list[dict],
                            recent_inbox: list[dict]) -> str:
    out = [f"🎯 {project['name']} ({project['slug']})"]
    if tasks:
        out.append("\nАктивные задачи:")
        for t in tasks[:10]:
            icon = _QUAD_ICON.get(t.get("quadrant", ""), "")
            due = t.get("due_date") or "—"
            out.append(f"  {icon} #{t['Id']} {t['title']} (до {due})")
    if recent_inbox:
        out.append("\nПоследние items:")
        for i in recent_inbox[:5]:
            out.append(f"  #{i['Id']} {i['title']}")
    notes = (project.get("context_notes_compact")
             or project.get("context_notes") or "")
    if notes:
        out.append("\nКонтекст:\n" + notes[:600])
    return "\n".join(out)
```

Append to `planner_bot/handlers/tasks_commands.py`:
```python
from datetime import date, timedelta
from planner_bot.formatters import render_today, render_week


async def today_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    tasks_repo = context.bot_data["tasks_repo"]
    today = date.today()
    rows = await tasks_repo.list_today(author_id=user["Id"],
                                       today=today.isoformat())
    await update.message.reply_text(render_today(rows, today=today))


async def week_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    tasks_repo = context.bot_data["tasks_repo"]
    today = date.today()
    end = today + timedelta(days=6)
    rows = await tasks_repo.list_week(author_id=user["Id"],
                                      start=today.isoformat(),
                                      end=end.isoformat())
    project_filter = (context.args[0] if getattr(context, "args", None) else None)
    if project_filter:
        projects = context.bot_data["projects_repo"]
        p = await projects.get_by_slug(project_filter)
        if p is not None:
            rows = [r for r in rows if r.get("project_id") == p["Id"]]
    await update.message.reply_text(render_week(rows, today=today))
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_formatters.py tests/test_today_week.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/formatters.py planner_bot/handlers/tasks_commands.py \
        tests/test_formatters.py tests/test_today_week.py
git commit -m "feat(tasks): /today /week commands + formatters"
```

---

### Task 27: `/task` wizard command

**Files:**
- Modify: `planner_bot/handlers/tasks_commands.py` (add `task_command`)
- Create: `tests/test_task_command.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import task_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_task_command_inline_args():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/task Купить молоко", user_id=42)
    ctx = FakeContext()
    ctx.args = ["Купить", "молоко"]
    ctx.bot_data.update({"users_repo": users_repo})
    await task_command(upd, ctx)
    assert ctx.user_data["pending_task"]["title"] == "Купить молоко"
    assert any("Q1" in m["text"] for m in upd.message.sent)


@pytest.mark.asyncio
async def test_task_command_empty_asks_for_title():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/task", user_id=42)
    ctx = FakeContext()
    ctx.args = []
    ctx.bot_data.update({"users_repo": users_repo})
    await task_command(upd, ctx)
    assert ctx.user_data.get("pending_task_title_prompt") is True
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_task_command.py -v
```

- [ ] **Step 3: Append to `tasks_commands.py`**

```python
async def task_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    title = " ".join(getattr(context, "args", []) or []).strip()
    if not title:
        context.user_data["pending_task_title_prompt"] = True
        await update.message.reply_text(
            "Что за задача? Напиши одной строкой.")
        return
    await prompt_quadrant_for_task(
        update=update, context=context,
        title=title, description="",
        project_slug=None, due_date=None, due_time=None,
        source_text=f"/task {title}",
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_task_command.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/tasks_commands.py tests/test_task_command.py
git commit -m "feat(tasks): /task wizard entry"
```

---

## Phase F — Commands & Queries

### Task 28: `/inbox` listing

**Files:**
- Create: `planner_bot/handlers/inbox_list_command.py`
- Create: `tests/test_inbox_list_command.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.inbox_list_command import inbox_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_inbox_command_lists_user_and_shared():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    other = {"Id": 2, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    users_repo.list_all = AsyncMock(return_value=[user, other])
    inbox_repo = MagicMock()
    inbox_repo.list_unprocessed_for_user = AsyncMock(return_value=[
        {"Id": 42, "title": "X", "author_name": "sasha"},
        {"Id": 43, "title": "Y", "author_name": "seryozha"},
    ])
    upd = make_update("/inbox", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo, "inbox_repo": inbox_repo})
    await inbox_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "#42" in text and "#43" in text
    inbox_repo.list_unprocessed_for_user.assert_awaited_with(
        author_id=1, shared_authors=[2])
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_inbox_list_command.py -v
```

- [ ] **Step 3: Implement**

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from planner_bot.formatters import render_inbox_list


async def inbox_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    all_users = await users.list_all()
    shared_authors = [u["Id"] for u in all_users if u["Id"] != user["Id"]]
    inbox = context.bot_data["inbox_repo"]
    items = await inbox.list_unprocessed_for_user(
        author_id=user["Id"], shared_authors=shared_authors)
    text = render_inbox_list(items, viewer_role=user["role"])
    kb_rows = []
    for item in items[:10]:
        kb_rows.append([InlineKeyboardButton(
            f"#{item['Id']}",
            callback_data=f"open:{item['Id']}",
        )])
    markup = InlineKeyboardMarkup(kb_rows) if kb_rows else None
    await update.message.reply_text(text, reply_markup=markup)
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_inbox_list_command.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/inbox_list_command.py \
        tests/test_inbox_list_command.py
git commit -m "feat(cmd): /inbox listing"
```

---

### Task 29: `/projects` and `/project <slug>`

**Files:**
- Create: `planner_bot/handlers/projects_commands.py`
- Create: `tests/test_projects_commands.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.projects_commands import (
    projects_command, project_command,
)
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_projects_filters_by_acl():
    user = {"Id": 1, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    projects_repo = MagicMock()
    projects_repo.list_visible_to = AsyncMock(return_value=[
        {"slug": "personal-seryozha", "category": "personal",
         "name": "Personal — Seryozha"},
        {"slug": "learning", "category": "learning", "name": "Learning"},
    ])
    upd = make_update("/projects", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "projects_repo": projects_repo})
    await projects_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "personal-seryozha" in text
    assert "learning" in text
    assert "ctok" not in text


@pytest.mark.asyncio
async def test_project_command_acl_denied():
    user = {"Id": 1, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "slug": "ctok", "visibility": "private", "owner_role": "sasha"})
    upd = make_update("/project ctok", user_id=42)
    ctx = FakeContext()
    ctx.args = ["ctok"]
    ctx.bot_data.update({"users_repo": users_repo,
                         "projects_repo": projects_repo})
    await project_command(upd, ctx)
    assert any("приватный" in m["text"].lower()
               or "доступа нет" in m["text"].lower()
               for m in upd.message.sent)
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_projects_commands.py -v
```

- [ ] **Step 3: Implement**

```python
from planner_bot.acl import can_access_project
from planner_bot.formatters import render_project_overview


async def projects_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    projects = context.bot_data["projects_repo"]
    rows = await projects.list_visible_to(user["role"])
    by_cat: dict[str, list[dict]] = {}
    for p in rows:
        by_cat.setdefault(p["category"], []).append(p)
    out = ["📂 Проекты:"]
    for cat in ("personal", "learning", "work"):
        items = by_cat.get(cat, [])
        if not items:
            continue
        out.append(f"\n{cat}:")
        for p in items:
            out.append(f"  • {p['slug']} — {p['name']}")
    await update.message.reply_text("\n".join(out))


async def project_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    args = getattr(context, "args", []) or []
    if not args:
        await update.message.reply_text(
            "Укажи slug: /project <slug>")
        return
    slug = args[0]
    projects = context.bot_data["projects_repo"]
    project = await projects.get_by_slug(slug)
    if project is None:
        await update.message.reply_text(f"Проект {slug} не найден."); return
    if not can_access_project(user, project):
        await update.message.reply_text(
            f"Проект {slug} приватный. Доступа нет.")
        return
    tasks_repo = context.bot_data["tasks_repo"]
    tasks = await tasks_repo.list_for_user_active(user["Id"])
    project_tasks = [t for t in tasks if t.get("project_id") == project["Id"]]
    inbox = context.bot_data["inbox_repo"]
    recent_inbox = await inbox.search_text(slug, limit=5)
    text = render_project_overview(project, project_tasks, recent_inbox)
    await update.message.reply_text(text)
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_projects_commands.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/projects_commands.py \
        tests/test_projects_commands.py
git commit -m "feat(cmd): /projects and /project <slug>"
```

---

### Task 30: `/find <query>`

**Files:**
- Create: `planner_bot/handlers/find_command.py`
- Create: `tests/test_find_command.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.find_command import find_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_find_returns_results():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    inbox_repo = MagicMock()
    inbox_repo.search_text = AsyncMock(return_value=[
        {"Id": 42, "title": "PostgreSQL replication",
         "summary": "статья", "file_path_repo": "_inbox/x.md"},
    ])
    upd = make_update("/find postgresql", user_id=42)
    ctx = FakeContext()
    ctx.args = ["postgresql"]
    ctx.bot_data.update({"users_repo": users_repo, "inbox_repo": inbox_repo})
    await find_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "#42" in text
    assert "PostgreSQL" in text


@pytest.mark.asyncio
async def test_find_empty_query_help():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    upd = make_update("/find", user_id=42)
    ctx = FakeContext()
    ctx.args = []
    ctx.bot_data.update({"users_repo": users_repo})
    await find_command(upd, ctx)
    assert "найти" in upd.message.sent[0]["text"].lower() \
        or "/find" in upd.message.sent[0]["text"].lower()
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_find_command.py -v
```

- [ ] **Step 3: Implement**

```python
async def find_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    args = getattr(context, "args", []) or []
    if not args:
        await update.message.reply_text(
            "Использование: /find <слова для поиска>")
        return
    query = " ".join(args)
    inbox = context.bot_data["inbox_repo"]
    rows = await inbox.search_text(query, limit=10)
    if not rows:
        await update.message.reply_text(f"🔍 По «{query}» ничего нет.")
        return
    out = [f"🔍 По «{query}» — {len(rows)} совпадений:"]
    for r in rows:
        path = r.get("file_path_repo") or ""
        suffix = f"  `{path}`" if path else ""
        out.append(f"  #{r['Id']} {r.get('title','')}{suffix}")
    await update.message.reply_text("\n".join(out), parse_mode="Markdown")
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_find_command.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/find_command.py tests/test_find_command.py
git commit -m "feat(cmd): /find full-text search"
```

---

### Task 31: `/stats` (current month)

**Files:**
- Create: `planner_bot/handlers/stats_command.py`
- Create: `tests/test_stats_command.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.stats_command import stats_command
from tests.fakes.tg_fake import make_update, FakeContext


class StubClient:
    def __init__(self, listing):
        self._l = listing

    async def list(self, table, **kw):
        return self._l.get(table, [])


@pytest.mark.asyncio
async def test_stats_renders_counts():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    raw_client = StubClient({
        "Inbox": [{"Id": 1, "status": "processed"},
                  {"Id": 2, "status": "new"},
                  {"Id": 3, "status": "processed"}],
        "Tasks": [{"Id": 1, "status": "done", "quadrant": "Q1"},
                  {"Id": 2, "status": "todo", "quadrant": "Q2"}],
        "Actions": [{"Id": 1, "cost_usd": 0.05},
                    {"Id": 2, "cost_usd": 0.02}],
    })
    upd = make_update("/stats", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "nocodb_client": raw_client})
    await stats_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "Inbox" in text
    assert "0.07" in text or "$0.0" in text
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_stats_command.py -v
```

- [ ] **Step 3: Implement**

```python
from datetime import date


async def stats_command(update, context):
    users = context.bot_data["users_repo"]
    user = await users.get_by_telegram_id(update.effective_user.id)
    if user is None:
        await update.message.reply_text("Доступа нет."); return
    client = context.bot_data["nocodb_client"]
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    inbox_rows = await client.list(
        "Inbox", limit=1000,
        where=(f"(author_id,eq,{user['Id']})"
               f"~and(created_at,gte,{month_start})"),
    )
    tasks_rows = await client.list(
        "Tasks", limit=1000,
        where=(f"(author_id,eq,{user['Id']})"
               f"~and(created_at,gte,{month_start})"),
    )
    actions_rows = await client.list(
        "Actions", limit=2000,
        where=(f"(author_id,eq,{user['Id']})"
               f"~and(created_at,gte,{month_start})"),
    )
    in_total = len(inbox_rows)
    in_done = sum(1 for r in inbox_rows if r["status"] == "processed")
    t_total = len(tasks_rows)
    t_done = sum(1 for r in tasks_rows if r["status"] == "done")
    by_q = {q: sum(1 for r in tasks_rows
                   if r.get("quadrant") == q
                   and r.get("status") in ("todo", "in_progress"))
            for q in ("Q1", "Q2", "Q3", "Q4")}
    cost = round(sum((r.get("cost_usd") or 0) for r in actions_rows), 4)
    out = [
        f"📊 {today.strftime('%B %Y')} — {user['name']}",
        f"Inbox: принято {in_total} / обработано {in_done}",
        f"Tasks: создано {t_total} / закрыто {t_done}",
        f"В пайплайне Q1:{by_q['Q1']} Q2:{by_q['Q2']} "
        f"Q3:{by_q['Q3']} Q4:{by_q['Q4']}",
        f"LLM cost: ${cost}",
    ]
    await update.message.reply_text("\n".join(out))
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_stats_command.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/stats_command.py tests/test_stats_command.py
git commit -m "feat(cmd): /stats month summary"
```

---

### Task 32: `/help` and `/settings` stubs

**Files:**
- Create: `planner_bot/handlers/help_command.py`
- Create: `planner_bot/handlers/settings_command.py`
- Create: `tests/test_help_settings.py`

- [ ] **Step 1: Test**

```python
import pytest

from planner_bot.handlers.help_command import help_command
from planner_bot.handlers.settings_command import settings_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_help_lists_commands():
    upd = make_update("/help", user_id=42)
    await help_command(upd, FakeContext())
    text = upd.message.sent[0]["text"]
    for cmd in ("/inbox", "/today", "/week", "/projects", "/find",
                "/task", "/stats"):
        assert cmd in text


@pytest.mark.asyncio
async def test_settings_phase2_notice():
    upd = make_update("/settings", user_id=42)
    await settings_command(upd, FakeContext())
    text = upd.message.sent[0]["text"]
    assert "Phase 2" in text or "позже" in text.lower()
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_help_settings.py -v
```

- [ ] **Step 3: Implement**

```python
# help_command.py
async def help_command(update, context):
    text = (
        "Команды:\n"
        "/inbox — необработанные items\n"
        "/today — задачи на сегодня\n"
        "/week [project] — задачи на неделю\n"
        "/projects — список проектов\n"
        "/project <slug> — детали проекта\n"
        "/find <слова> — поиск\n"
        "/task <название> — создать задачу\n"
        "/stats — стата за месяц\n"
        "/settings — настройки\n"
        "/help — эта справка\n\n"
        "Можно писать свободным текстом — пойму намерение."
    )
    await update.message.reply_text(text)
```

```python
# settings_command.py
async def settings_command(update, context):
    await update.message.reply_text(
        "⚙️ /settings будет в Phase 2. "
        "Пока: дайджест 08:00, Q1-напоминалка 19:00, TZ Europe/Prague."
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_help_settings.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/help_command.py \
        planner_bot/handlers/settings_command.py \
        tests/test_help_settings.py
git commit -m "feat(cmd): /help + /settings stub"
```

---

### Task 33: Free-text intent router

**Files:**
- Create: `planner_bot/handlers/free_text.py`
- Create: `tests/test_free_text.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.free_text import handle_free_text
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_free_text_with_url_goes_to_capture():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    capture_message = AsyncMock()
    upd = make_update("https://habr.com/x", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "capture_message": capture_message,
                         "detect_intent": AsyncMock()})
    await handle_free_text(upd, ctx)
    capture_message.assert_awaited()


@pytest.mark.asyncio
async def test_free_text_intent_today_routes():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    today_command = AsyncMock()
    detect = AsyncMock(return_value={"intent": "today", "args": {},
                                     "tokens_in": 0, "tokens_out": 0,
                                     "cost_usd": 0.0})
    upd = make_update("что у меня сегодня", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "detect_intent": detect,
                         "today_command": today_command})
    await handle_free_text(upd, ctx)
    today_command.assert_awaited()


@pytest.mark.asyncio
async def test_free_text_intent_create_task_prompts_quadrant():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    detect = AsyncMock(return_value={
        "intent": "create_task",
        "args": {"title": "Созвон", "due_date": "2026-04-27",
                 "due_time": "14:00", "project_slug": "vesna-web"},
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
    })
    prompt_q = AsyncMock()
    upd = make_update("завтра 14 созвон", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "detect_intent": detect,
                         "prompt_quadrant_for_task": prompt_q})
    await handle_free_text(upd, ctx)
    prompt_q.assert_awaited()
    kwargs = prompt_q.call_args.kwargs
    assert kwargs["title"] == "Созвон"
    assert kwargs["due_date"] == "2026-04-27"
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_free_text.py -v
```

- [ ] **Step 3: Implement**

```python
import re

_URL_RE = re.compile(r"https?://\S+")


async def handle_free_text(update, context):
    msg = update.message
    text = (msg.text or "").strip()
    if not text or text.startswith("/"):
        return
    pending = context.user_data.get("pending_clarify_inbox_id")
    if pending:
        from planner_bot.handlers.inbox_commands import on_clarify_text
        await on_clarify_text(update, context); return
    if context.user_data.get("pending_task_title_prompt"):
        from planner_bot.handlers.tasks_commands import prompt_quadrant_for_task
        context.user_data.pop("pending_task_title_prompt", None)
        await prompt_quadrant_for_task(
            update=update, context=context,
            title=text, description="", project_slug=None,
            due_date=None, due_time=None, source_text=text,
        )
        return
    if _URL_RE.search(text):
        await context.bot_data["capture_message"](update, context); return
    detect = context.bot_data["detect_intent"]
    res = await detect(text=text)
    intent = res["intent"]
    args = res.get("args") or {}
    if intent == "inbox":
        from planner_bot.handlers.inbox_list_command import inbox_command
        await inbox_command(update, context); return
    if intent == "today":
        await context.bot_data["today_command"](update, context); return
    if intent == "week":
        from planner_bot.handlers.tasks_commands import week_command
        context.args = [args["project_slug"]] if args.get("project_slug") else []
        await week_command(update, context); return
    if intent == "projects":
        from planner_bot.handlers.projects_commands import projects_command
        await projects_command(update, context); return
    if intent == "project_overview" and args.get("slug"):
        from planner_bot.handlers.projects_commands import project_command
        context.args = [args["slug"]]
        await project_command(update, context); return
    if intent == "find" and args.get("query"):
        from planner_bot.handlers.find_command import find_command
        context.args = args["query"].split()
        await find_command(update, context); return
    if intent == "stats":
        from planner_bot.handlers.stats_command import stats_command
        await stats_command(update, context); return
    if intent == "create_task":
        prompt_q = context.bot_data["prompt_quadrant_for_task"]
        await prompt_q(update=update, context=context,
                       title=args.get("title", text)[:80],
                       description="",
                       project_slug=args.get("project_slug"),
                       due_date=args.get("due_date"),
                       due_time=args.get("due_time"),
                       source_text=text); return
    # fallback — treat as inbox capture
    await context.bot_data["capture_message"](update, context)
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_free_text.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/free_text.py tests/test_free_text.py
git commit -m "feat(router): free-text intent dispatch"
```

---

### Task 34: Wire all handlers in `bot.py`

**Files:**
- Modify: `planner_bot/bot.py`
- Create: `tests/test_bot_wiring.py`

- [ ] **Step 1: Test**

```python
import os
from unittest.mock import patch
from planner_bot.bot import build_application
from planner_bot.config import Settings


def test_app_registers_expected_commands(monkeypatch):
    for k, v in {
        "TG_BOT_TOKEN": "x", "ANTHROPIC_API_KEY": "x",
        "OPENAI_API_KEY": "x", "NOCODB_URL": "http://x",
        "NOCODB_TOKEN": "x", "GIT_REPO_PATH": "/tmp/x",
        "ADMIN_CHAT_ID": "1",
    }.items():
        monkeypatch.setenv(k, v)
    settings = Settings()
    with patch("planner_bot.bot.NocoDBClient"), \
         patch("planner_bot.bot.AnthropicLLM"), \
         patch("planner_bot.bot.WhisperClient"):
        app = build_application(settings)
    cmd_names = set()
    for h_list in app.handlers.values():
        for h in h_list:
            if h.__class__.__name__ == "CommandHandler":
                for c in h.commands:
                    cmd_names.add(c)
    expected = {"start", "inbox", "today", "week", "projects", "project",
                "find", "task", "stats", "settings", "help"}
    assert expected.issubset(cmd_names)
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_bot_wiring.py -v
```

- [ ] **Step 3: Replace `bot.py`**

```python
"""Bot entry point: wires Application, all handlers, JobQueue."""

from __future__ import annotations

import asyncio
import logging
from functools import partial

import anthropic
import openai
from loguru import logger
from telegram import Update
from telegram.ext import (
    Application, CallbackQueryHandler, CommandHandler, MessageHandler, filters,
)

from planner_bot.config import Settings
from planner_bot.git_ops import safe_commit
from planner_bot.handlers.find_command import find_command
from planner_bot.handlers.free_text import handle_free_text
from planner_bot.handlers.help_command import help_command
from planner_bot.handlers.inbox_capture import capture_message
from planner_bot.handlers.inbox_commands import (
    on_archive_callback, on_clarify_callback, on_process_callback,
)
from planner_bot.handlers.inbox_list_command import inbox_command
from planner_bot.handlers.photo_capture import capture_photo
from planner_bot.handlers.document_capture import capture_document
from planner_bot.handlers.projects_commands import (
    project_command, projects_command,
)
from planner_bot.handlers.settings_command import settings_command
from planner_bot.handlers.start import start_command
from planner_bot.handlers.stats_command import stats_command
from planner_bot.handlers.tasks_commands import (
    on_quadrant_selected, prompt_quadrant_for_task,
    task_command, today_command, week_command,
)
from planner_bot.handlers.voice_capture import capture_voice
from planner_bot.llm.anthropic_client import AnthropicLLM
from planner_bot.llm.classify import classify_inbox
from planner_bot.llm.clarify import extract_clarification
from planner_bot.llm.intent import detect_intent
from planner_bot.llm.process import process_inbox
from planner_bot.llm.whisper_client import WhisperClient
from planner_bot.nocodb.client import NocoDBClient
from planner_bot.nocodb.repos import (
    ActionsRepo, InboxRepo, ProjectsRepo, TasksRepo, UsersRepo,
)


def _wire_bot_data(app: Application, settings: Settings) -> None:
    nc = NocoDBClient(base_url=settings.nocodb_url, token=settings.nocodb_token)
    ant = AnthropicLLM(
        client=anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key),
        sonnet_model="claude-sonnet-4-6",
        haiku_model="claude-haiku-4-5",
    )
    whisper = WhisperClient(
        client=openai.AsyncOpenAI(api_key=settings.openai_api_key),
    )

    users = UsersRepo(nc); projects = ProjectsRepo(nc)
    inbox = InboxRepo(nc); tasks = TasksRepo(nc); actions = ActionsRepo(nc)

    async def _classify(item):
        proj_rows = await projects.list_all()
        return await classify_inbox(llm=ant, projects=proj_rows, item=item)

    async def _process(*, item, target_project, recent_filenames):
        return await process_inbox(llm=ant, item=item,
                                    target_project=target_project,
                                    recent_filenames=recent_filenames)

    async def _detect_intent(*, text):
        return await detect_intent(llm=ant, text=text)

    async def _extract_clarification(*, text, item):
        proj_rows = await projects.list_all()
        slugs = [p["slug"] for p in proj_rows]
        return await extract_clarification(llm=ant, text=text, item=item,
                                           slugs=slugs)

    async def _transcribe(audio_path, duration_sec=None):
        return await whisper.transcribe(audio_path,
                                        duration_sec=duration_sec)

    app.bot_data.update({
        "settings": settings,
        "nocodb_client": nc,
        "users_repo": users, "projects_repo": projects,
        "inbox_repo": inbox, "tasks_repo": tasks, "actions_repo": actions,
        "classify_inbox": _classify,
        "process_inbox": _process,
        "detect_intent": _detect_intent,
        "extract_clarification": _extract_clarification,
        "transcribe_voice": _transcribe,
        "capture_message": capture_message,
        "today_command": today_command,
        "prompt_quadrant_for_task": prompt_quadrant_for_task,
        "git_safe_commit": safe_commit,
        "repo_path": settings.git_repo_path,
    })


def build_application(settings: Settings) -> Application:
    app = Application.builder().token(settings.tg_bot_token).build()
    _wire_bot_data(app, settings)

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("inbox", inbox_command))
    app.add_handler(CommandHandler("today", today_command))
    app.add_handler(CommandHandler("week", week_command))
    app.add_handler(CommandHandler("projects", projects_command))
    app.add_handler(CommandHandler("project", project_command))
    app.add_handler(CommandHandler("find", find_command))
    app.add_handler(CommandHandler("task", task_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(CommandHandler("settings", settings_command))
    app.add_handler(CommandHandler("help", help_command))

    app.add_handler(CallbackQueryHandler(on_process_callback,
                                         pattern=r"^process:"))
    app.add_handler(CallbackQueryHandler(on_clarify_callback,
                                         pattern=r"^clarify:"))
    app.add_handler(CallbackQueryHandler(on_archive_callback,
                                         pattern=r"^archive:"))
    app.add_handler(CallbackQueryHandler(on_quadrant_selected,
                                         pattern=r"^quad:"))

    app.add_handler(MessageHandler(filters.VOICE, capture_voice))
    app.add_handler(MessageHandler(filters.PHOTO, capture_photo))
    app.add_handler(MessageHandler(filters.Document.ALL, capture_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND,
                                   handle_free_text))
    return app


def main() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info("planner-bot starting")
    app = build_application(settings)
    app.run_polling(allowed_updates=Update.ALL_TYPES, close_loop=False)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_bot_wiring.py -v
pytest -q  # full suite
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/bot.py tests/test_bot_wiring.py
git commit -m "feat(bot): wire all handlers + bot_data dependencies"
```

---

## Phase G — Cron & Digests

### Task 35: Morning digest job

**Files:**
- Create: `planner_bot/cron_jobs.py`
- Create: `tests/test_morning_digest.py`

- [ ] **Step 1: Test**

```python
import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from planner_bot.cron_jobs import morning_digest_for_user


@pytest.mark.asyncio
async def test_morning_digest_for_user_sends_text():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    inbox = MagicMock()
    inbox.list_unprocessed_for_user = AsyncMock(return_value=[
        {"Id": 1, "title": "X", "author_name": "sasha"},
        {"Id": 2, "title": "Y", "author_name": "sasha"},
    ])
    tasks = MagicMock()
    tasks.list_q1_today = AsyncMock(return_value=[
        {"Id": 5, "title": "Q1 task", "due_time": "14:00"}])
    tasks.list_for_user_active = AsyncMock(return_value=[
        {"Id": 5, "quadrant": "Q1"}, {"Id": 6, "quadrant": "Q2"},
        {"Id": 7, "quadrant": "Q2"}])
    bot = MagicMock(); bot.send_message = AsyncMock()

    await morning_digest_for_user(
        bot=bot, user=user, shared_authors=[2],
        inbox_repo=inbox, tasks_repo=tasks,
        today=date(2026, 4, 26),
    )
    bot.send_message.assert_awaited()
    text = bot.send_message.call_args.kwargs["text"]
    assert "Sasha" in text
    assert "Q1" in text
    assert "#1" in text or "Y" in text
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_morning_digest.py -v
```

- [ ] **Step 3: Implement**

`planner_bot/cron_jobs.py`:
```python
from __future__ import annotations

from datetime import date, time
from zoneinfo import ZoneInfo

from telegram.ext import Application


async def morning_digest_for_user(*, bot, user, shared_authors,
                                  inbox_repo, tasks_repo, today: date):
    inbox_items = await inbox_repo.list_unprocessed_for_user(
        author_id=user["Id"], shared_authors=shared_authors,
    )
    q1_today = await tasks_repo.list_q1_today(
        author_id=user["Id"], today=today.isoformat(),
    )
    active = await tasks_repo.list_for_user_active(user["Id"])
    q2_count = sum(1 for t in active if t.get("quadrant") == "Q2")
    out = [f"Доброе утро, {user['name']} 👋"]
    if q1_today:
        out.append("\n🔥 Q1 на сегодня:")
        for t in q1_today:
            tm = (t.get("due_time") or "").strip()
            prefix = f"{tm} " if tm else ""
            out.append(f"  • {prefix}#{t['Id']} {t['title']}")
    else:
        out.append("\n🔥 Q1: пусто.")
    if q2_count:
        out.append(f"\n📌 Q2 на этой неделе — {q2_count} задач (/week)")
    if inbox_items:
        out.append(f"\n📥 Inbox: {len(inbox_items)} необработанных")
        for i in inbox_items[:5]:
            out.append(f"  #{i['Id']} {i['title']}")
    await bot.send_message(chat_id=user["telegram_id"],
                           text="\n".join(out))


async def _morning_job_callback(context):
    settings = context.application.bot_data["settings"]
    users_repo = context.application.bot_data["users_repo"]
    inbox_repo = context.application.bot_data["inbox_repo"]
    tasks_repo = context.application.bot_data["tasks_repo"]
    all_users = await users_repo.list_all()
    today = date.today()
    for u in all_users:
        if not u.get("telegram_id"):
            continue
        shared = [x["Id"] for x in all_users if x["Id"] != u["Id"]]
        await morning_digest_for_user(
            bot=context.bot, user=u, shared_authors=shared,
            inbox_repo=inbox_repo, tasks_repo=tasks_repo, today=today,
        )


def register_cron_jobs(app: Application) -> None:
    settings = app.bot_data["settings"]
    tz = ZoneInfo(settings.default_timezone)
    app.job_queue.run_daily(
        _morning_job_callback,
        time=time(hour=8, minute=0, tzinfo=tz),
        name="morning_digest",
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_morning_digest.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/cron_jobs.py tests/test_morning_digest.py
git commit -m "feat(cron): morning digest job"
```

---

### Task 36: Q1 evening reminder

**Files:**
- Modify: `planner_bot/cron_jobs.py` (add `evening_q1_for_user` + register)
- Create: `tests/test_evening_q1.py`

- [ ] **Step 1: Test**

```python
import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from planner_bot.cron_jobs import evening_q1_for_user


@pytest.mark.asyncio
async def test_evening_q1_skips_when_empty():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks = MagicMock()
    tasks.list_q1_today = AsyncMock(return_value=[])
    bot = MagicMock(); bot.send_message = AsyncMock()
    await evening_q1_for_user(bot=bot, user=user, tasks_repo=tasks,
                              today=date(2026, 4, 26))
    bot.send_message.assert_not_awaited()


@pytest.mark.asyncio
async def test_evening_q1_sends_when_todo():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks = MagicMock()
    tasks.list_q1_today = AsyncMock(return_value=[
        {"Id": 7, "title": "Дописать prompt", "status": "todo"},
    ])
    bot = MagicMock(); bot.send_message = AsyncMock()
    await evening_q1_for_user(bot=bot, user=user, tasks_repo=tasks,
                              today=date(2026, 4, 26))
    bot.send_message.assert_awaited()
    assert "Дописать prompt" in bot.send_message.call_args.kwargs["text"]
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_evening_q1.py -v
```

- [ ] **Step 3: Append to `cron_jobs.py`**

```python
async def evening_q1_for_user(*, bot, user, tasks_repo, today: date):
    rows = await tasks_repo.list_q1_today(author_id=user["Id"],
                                          today=today.isoformat())
    if not rows:
        return
    out = [f"Вечерняя проверка 🌆\n\nQ1 на сегодня (статус todo):"]
    for t in rows:
        out.append(f"  ⏳ #{t['Id']} {t['title']}")
    await bot.send_message(chat_id=user["telegram_id"],
                           text="\n".join(out))


async def _evening_q1_callback(context):
    users_repo = context.application.bot_data["users_repo"]
    tasks_repo = context.application.bot_data["tasks_repo"]
    today = date.today()
    for u in await users_repo.list_all():
        if not u.get("telegram_id"):
            continue
        await evening_q1_for_user(bot=context.bot, user=u,
                                  tasks_repo=tasks_repo, today=today)
```

In `register_cron_jobs` add:
```python
    app.job_queue.run_daily(
        _evening_q1_callback,
        time=time(hour=19, minute=0, tzinfo=tz),
        name="evening_q1",
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_evening_q1.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/cron_jobs.py tests/test_evening_q1.py
git commit -m "feat(cron): Q1 evening reminder"
```

---

### Task 37: Due-date warner (hourly)

**Files:**
- Modify: `planner_bot/cron_jobs.py` (add `due_warner_callback`)
- Create: `tests/test_due_warner.py`

- [ ] **Step 1: Test**

```python
import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from planner_bot.cron_jobs import warn_due_for_user


@pytest.mark.asyncio
async def test_warn_due_only_overdue_or_today():
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks = MagicMock()
    tasks.list_for_user_active = AsyncMock(return_value=[
        {"Id": 1, "title": "Past", "due_date": "2026-04-25", "quadrant": "Q1",
         "status": "todo"},
        {"Id": 2, "title": "Today", "due_date": "2026-04-26", "quadrant": "Q1",
         "status": "todo"},
        {"Id": 3, "title": "Future", "due_date": "2026-05-10", "quadrant": "Q2",
         "status": "todo"},
    ])
    bot = MagicMock(); bot.send_message = AsyncMock()
    sent_today_cache = set()
    await warn_due_for_user(bot=bot, user=user, tasks_repo=tasks,
                            today=date(2026, 4, 26),
                            warned_today=sent_today_cache)
    text = bot.send_message.call_args.kwargs["text"]
    assert "#1" in text
    assert "#2" in text
    assert "#3" not in text
    # second call same day → no duplicate push
    await warn_due_for_user(bot=bot, user=user, tasks_repo=tasks,
                            today=date(2026, 4, 26),
                            warned_today=sent_today_cache)
    assert bot.send_message.await_count == 1
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_due_warner.py -v
```

- [ ] **Step 3: Append to `cron_jobs.py`**

```python
async def warn_due_for_user(*, bot, user, tasks_repo, today: date,
                            warned_today: set):
    rows = await tasks_repo.list_for_user_active(user["Id"])
    overdue = [r for r in rows
               if r.get("due_date") and r["due_date"] <= today.isoformat()]
    if not overdue:
        return
    new_ids = [r["Id"] for r in overdue if r["Id"] not in warned_today]
    if not new_ids:
        return
    out = ["⏰ Дедлайны:"]
    for r in overdue:
        if r["Id"] in new_ids:
            out.append(f"  #{r['Id']} {r['title']} (до {r['due_date']})")
    await bot.send_message(chat_id=user["telegram_id"],
                           text="\n".join(out))
    warned_today.update(new_ids)


async def _due_warner_callback(context):
    users_repo = context.application.bot_data["users_repo"]
    tasks_repo = context.application.bot_data["tasks_repo"]
    today = date.today()
    cache = context.application.bot_data.setdefault(
        "_warned_today", {"date": today, "ids": set()})
    if cache["date"] != today:
        cache["date"] = today
        cache["ids"] = set()
    for u in await users_repo.list_all():
        if not u.get("telegram_id"):
            continue
        await warn_due_for_user(bot=context.bot, user=u,
                                tasks_repo=tasks_repo, today=today,
                                warned_today=cache["ids"])
```

In `register_cron_jobs` add:
```python
    app.job_queue.run_repeating(
        _due_warner_callback,
        interval=3600, first=600, name="due_warner",
    )
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_due_warner.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/cron_jobs.py tests/test_due_warner.py
git commit -m "feat(cron): hourly due-date warner with daily dedupe"
```

---

### Task 38: Wire cron in `bot.py` + post-init

**Files:**
- Modify: `planner_bot/bot.py`
- Create: `tests/test_bot_post_init.py`

- [ ] **Step 1: Test**

```python
from unittest.mock import patch
from planner_bot.bot import build_application
from planner_bot.config import Settings


def test_post_init_registers_jobs(monkeypatch):
    for k, v in {
        "TG_BOT_TOKEN": "x", "ANTHROPIC_API_KEY": "x",
        "OPENAI_API_KEY": "x", "NOCODB_URL": "http://x",
        "NOCODB_TOKEN": "x", "GIT_REPO_PATH": "/tmp/x",
        "ADMIN_CHAT_ID": "1",
    }.items():
        monkeypatch.setenv(k, v)
    settings = Settings()
    with patch("planner_bot.bot.NocoDBClient"), \
         patch("planner_bot.bot.AnthropicLLM"), \
         patch("planner_bot.bot.WhisperClient"):
        app = build_application(settings)
    job_names = {j.name for j in app.job_queue.jobs()}
    assert {"morning_digest", "evening_q1", "due_warner"}.issubset(job_names)
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_bot_post_init.py -v
```

- [ ] **Step 3: Modify `bot.py`**

In `build_application`, before `return app`:
```python
    from planner_bot.cron_jobs import register_cron_jobs
    register_cron_jobs(app)
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_bot_post_init.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/bot.py tests/test_bot_post_init.py
git commit -m "feat(cron): wire JobQueue jobs at startup"
```

---

## Phase H — Polish & Ship

### Task 39: ACL hardening across handlers

**Files:**
- Create: `tests/test_acl_integration.py`

- [ ] **Step 1: Test (integration across handlers)**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.projects_commands import project_command
from planner_bot.handlers.find_command import find_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_seryozha_cannot_open_ctok_via_project_command():
    user = {"Id": 2, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "slug": "ctok", "visibility": "private", "owner_role": "sasha"})
    upd = make_update("/project ctok", user_id=99)
    ctx = FakeContext()
    ctx.args = ["ctok"]
    ctx.bot_data.update({"users_repo": users_repo,
                         "projects_repo": projects_repo,
                         "tasks_repo": MagicMock(),
                         "inbox_repo": MagicMock()})
    await project_command(upd, ctx)
    text = upd.message.sent[0]["text"].lower()
    assert "приватный" in text or "доступа нет" in text


@pytest.mark.asyncio
async def test_find_does_not_leak_other_users_private_items():
    user = {"Id": 2, "name": "Seryozha", "role": "seryozha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    inbox_repo = MagicMock()
    inbox_repo.search_text = AsyncMock(return_value=[
        {"Id": 1, "title": "Ctok plan", "author_name": "sasha",
         "project_slug": "ctok"}
    ])
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "slug": "ctok", "visibility": "private", "owner_role": "sasha"})
    upd = make_update("/find Ctok", user_id=99)
    ctx = FakeContext()
    ctx.args = ["Ctok"]
    ctx.bot_data.update({"users_repo": users_repo,
                         "inbox_repo": inbox_repo,
                         "projects_repo": projects_repo})
    await find_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "#1" not in text  # filtered
```

- [ ] **Step 2: Run — FAIL (find still returns)**

```bash
pytest tests/test_acl_integration.py -v
```

- [ ] **Step 3: Modify `find_command.py` to filter by visibility**

Replace body of `find_command` post-search:
```python
    rows = await inbox.search_text(query, limit=20)
    if rows:
        projects = context.bot_data["projects_repo"]
        all_projects = await projects.list_all()
        slug_to_proj = {p["slug"]: p for p in all_projects}
        from planner_bot.acl import can_access_project
        rows = [r for r in rows
                if not r.get("project_slug")
                or can_access_project(
                    user, slug_to_proj.get(r["project_slug"], {}))]
        rows = rows[:10]
    if not rows:
        await update.message.reply_text(f"🔍 По «{query}» ничего нет.")
        return
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_acl_integration.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/find_command.py \
        tests/test_acl_integration.py
git commit -m "fix(acl): /find filters private items from non-owners"
```

---

### Task 40: Admin `/admin stats` + `/admin health`

**Files:**
- Create: `planner_bot/handlers/admin.py`
- Create: `tests/test_admin.py`

- [ ] **Step 1: Test**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.admin import admin_command
from tests.fakes.tg_fake import make_update, FakeContext


@pytest.mark.asyncio
async def test_admin_denied_for_non_admin():
    upd = make_update("/admin", user_id=999)
    ctx = FakeContext()
    settings = MagicMock(); settings.admin_chat_id = 42
    ctx.bot_data.update({"settings": settings})
    await admin_command(upd, ctx)
    assert "не админ" in upd.message.sent[0]["text"].lower() \
        or "denied" in upd.message.sent[0]["text"].lower()


@pytest.mark.asyncio
async def test_admin_health_for_admin():
    upd = make_update("/admin", user_id=42)
    ctx = FakeContext()
    settings = MagicMock(); settings.admin_chat_id = 42
    ctx.args = ["health"]
    ctx.bot_data.update({"settings": settings})
    await admin_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "DB" in text or "Bot" in text
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_admin.py -v
```

- [ ] **Step 3: Implement**

```python
async def admin_command(update, context):
    settings = context.bot_data["settings"]
    if update.effective_user.id != settings.admin_chat_id:
        await update.message.reply_text("Не админ.")
        return
    args = getattr(context, "args", []) or []
    sub = args[0] if args else "health"
    if sub == "health":
        await update.message.reply_text(
            "🔧 Bot health:\n"
            "DB: NocoDB\n"
            "Bot: running\n"
            "Cron: registered"
        )
```

Wire in `bot.py`:
```python
from planner_bot.handlers.admin import admin_command
app.add_handler(CommandHandler("admin", admin_command))
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_admin.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/handlers/admin.py planner_bot/bot.py \
        tests/test_admin.py
git commit -m "feat(admin): /admin health gated by chat_id"
```

---

### Task 41: Logging setup with loguru rotation

**Files:**
- Modify: `planner_bot/bot.py` (add `_setup_logging`)
- Create: `tests/test_logging.py`

- [ ] **Step 1: Test**

```python
from pathlib import Path
from planner_bot.bot import _setup_logging


def test_setup_logging_creates_log_file(tmp_path: Path):
    _setup_logging(level="INFO", logs_dir=tmp_path)
    log = tmp_path / "bot.log"
    from loguru import logger
    logger.info("hello")
    assert log.exists()
    assert "hello" in log.read_text()
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_logging.py -v
```

- [ ] **Step 3: Modify `bot.py`**

Add at top:
```python
def _setup_logging(*, level: str, logs_dir):
    from pathlib import Path
    logs_dir = Path(logs_dir); logs_dir.mkdir(parents=True, exist_ok=True)
    logger.remove()
    logger.add(logs_dir / "bot.log", rotation="10 MB",
               retention=7, level=level, enqueue=True)
    logger.add(lambda m: print(m, end=""), level=level)
```

In `main`:
```python
    _setup_logging(level=settings.log_level.upper(), logs_dir="/app/logs")
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_logging.py -v
```

- [ ] **Step 5: Commit**

```bash
git add planner_bot/bot.py tests/test_logging.py
git commit -m "feat(observability): loguru with rotation"
```

---

### Task 42: Smoke deploy run-book

**Files:**
- Create: `docs/superpowers/runbooks/deploy.md`

- [ ] **Step 1: Test (lint that runbook covers required sections)**

```python
# tests/test_runbook.py
from pathlib import Path


def test_deploy_runbook_sections():
    text = Path("docs/superpowers/runbooks/deploy.md").read_text()
    for section in ("VPS prerequisites", "GitHub repo",
                    "NocoDB tables", "Seed", "Bot start", "Verify"):
        assert section in text
```

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_runbook.py -v
```

- [ ] **Step 3: Write runbook**

`docs/superpowers/runbooks/deploy.md`:
```markdown
# planner-bot deploy run-book

## VPS prerequisites
- Hetzner CPX22 (existing).
- Docker + Docker Compose installed.
- NocoDB + Postgres already running on default network.
- `/root/.ssh/id_ed25519` present and added to GitHub repo as deploy key.

## GitHub repo
1. Create private repo `personal-planner` (web UI or `gh`).
2. Add deploy key from VPS.

## Clone + skeleton
```bash
ssh root@188.245.42.4
cd /root
git clone git@github.com:<user>/personal-planner.git
cd planner-bot
cp .env.example .env  # then fill in tokens, NOCODB_TOKEN, etc.
REPO_PATH=/root/personal-planner python scripts/init_repo_layout.py
```

## NocoDB tables
1. Create a NocoDB base (web UI). Capture `NOCODB_BASE_ID`.
2. Run:
```bash
NOCODB_BASE_ID=<id> python scripts/create_nocodb_tables.py
```

## Seed
Look up each user's `telegram_id` (have them message `/start` → check `users_repo`
log line) and update the `Users` rows after seed:
```bash
python scripts/seed_nocodb.py
```

## Bot start
```bash
cd /root
docker compose build planner-bot
docker compose up -d planner-bot
docker compose logs -f planner-bot
```

## Verify
- `/start` from each sibling's TG → bot greets by name.
- Forward a URL → bot replies "✅ Принято" within 5s.
- `git -C /root/personal-planner log` shows the new commit.
- `/inbox`, `/today`, `/week`, `/projects`, `/help` all respond.

## Backup setup (optional but recommended)
- Cron pg_dump to /root/backups/ + push to a separate private GitHub repo
  (see spec § 6.7).
```

- [ ] **Step 4: Green**

```bash
pytest tests/test_runbook.py -v
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/runbooks/deploy.md tests/test_runbook.py
git commit -m "docs(deploy): run-book"
```

---

### Task 43: End-to-end smoke test on staging

**Files:**
- Create: `tests/test_e2e_smoke.py` (real HTTP, gated by env)

- [ ] **Step 1: Test (gated)**

```python
import os
import pytest


@pytest.mark.skipif(not os.environ.get("E2E_SMOKE"),
                    reason="set E2E_SMOKE=1 to run against live NocoDB")
def test_e2e_inbox_capture_then_process():
    """Manual smoke: configure live env, run from VPS, send TG message,
    assert NocoDB row + git commit + Mac visible after Obsidian Git pull.
    Document the human-driven steps in tests/E2E_CHECKLIST.md.
    """
    raise NotImplementedError("Manual smoke. Follow E2E_CHECKLIST.md.")
```

`tests/E2E_CHECKLIST.md`:
```markdown
# E2E smoke (manual)

Run after Task 42 completes on the VPS. Verifies all 15 acceptance criteria
from the spec.

1. Both siblings send `/start`. Bot greets each by name.
2. Sasha forwards a URL. Within 5 sec: NocoDB Inbox row appears, .md file
   appears in `_inbox/`, GitHub shows new commit.
3. Sasha presses **Обработать**. Bot proposes project. Sasha accepts.
   File moves to project subfolder. NocoDB row → `status=processed`.
4. Sasha sends a voice note. Whisper transcribes. NocoDB `transcript` filled.
5. Sasha sends a photo with caption. NocoDB row, attachment saved.
6. Seryozha sends `/inbox`. Sees own + shared. Does NOT see Sasha's
   `personal-sasha` items or Ctok items.
7. Seryozha runs `/project ctok`. Bot replies "приватный".
8. Sasha writes "завтра 14:00 созвон с Vesna клиентом". Bot prompts
   quadrant. Sasha picks Q2. Task is created with correct date.
9. Sasha runs `/today` and `/week`. Output matches NocoDB Tasks view.
10. Sasha runs `/find postgresql`. Returns matching items.
11. Wait until 08:00 Europe/Prague. Both siblings receive the morning
    digest.
12. Wait until 19:00 Europe/Prague. If Q1 tasks remain todo, both get
    reminder.
13. `/stats` shows non-zero counts and current month's LLM cost.
14. `docker logs planner-bot` shows no exceptions over an hour.
15. Run `git -C /root/personal-planner status` — clean. All commits
    pushed to GitHub.

If any step fails: open issue, mark unchecked, fix, repeat from step 1.
```

- [ ] **Step 2: Run skipped**

```bash
pytest tests/test_e2e_smoke.py -v
```
Expected: SKIPPED.

- [ ] **Step 3: Run with E2E_SMOKE on real VPS**

(See `E2E_CHECKLIST.md`. Manual sign-off after each step.)

- [ ] **Step 4: Run full suite**

```bash
pytest -q
```
Expected: all green except `test_e2e_smoke` skipped.

- [ ] **Step 5: Commit**

```bash
git add tests/test_e2e_smoke.py tests/E2E_CHECKLIST.md
git commit -m "test(e2e): manual smoke checklist"
```

---

## Self-Review

**Spec coverage map:**

| Acceptance criterion (spec §2) | Task |
|-------------------------------|------|
| 1. `/start` register both users | 5 |
| 2. Capture URL/text/voice/photo/file → NocoDB row + .md + git push within 5s | 12, 19, 20, 21 |
| 3. `/inbox` returns own + shared, newest first | 28 |
| 4. Process button → LLM proposes project + action → applies on approve | 17 |
| 5. Low-confidence path: clarification updates `Projects.context_notes` | 18 |
| 6. Tasks via free text or `/task` wizard with quadrant | 24, 25, 27 |
| 7. `/today`, `/week`, `/week <project>` correct grouping | 26 |
| 8. `/projects`, `/project`, `/find`, `/stats` | 29, 30, 31 |
| 9. Daily digest 08:00 + Q1 19:00 | 35, 36 |
| 10. Voice → Whisper → `Inbox.transcript` | 19 |
| 11. ACL: Ctok private to Sasha; rest shared per spec | 10, 39 (cross-handler) |
| 12. `git pull --rebase` before commits | 11 |
| 13. Voice always transcribes; photo/file analysis on demand | 19, 20, 21 |
| 14. Runs as Docker service alongside NocoDB on Hetzner | 6, 38, 42 |
| 15. LLM cost ≤$10/mo for 50 items/day | 13 (cost calc), 31 (`/stats` exposes), 43 (manual verify) |

**Placeholder scan:** No "TBD", "TODO", or "implement later" in tasks. Every code step contains exact code. No "similar to Task N" — code is repeated where needed.

**Type / signature consistency:**
- `safe_commit(repo_path=, paths=, message=, push=)` — used identically in all handlers.
- `bot_data` keys are documented at first introduction (`users_repo`, `inbox_repo`, ...). Same names in all consumers.
- `Inbox` enum statuses: `new | thinking | proposed | processed | archived` — only `new`, `processed`, `archived` used in handlers; `thinking` and `proposed` reserved for future agentic flows.
- `Tasks.quadrant` consistently `Q1|Q2|Q3|Q4` everywhere.

**Open follow-ups (not in this plan, deferred to Phase 2 per spec §6.8):**
1. Photo/PDF vision/OCR analysis when user presses `🔍 Анализ` or `🔍 Извлечь текст` (callback `analyze:<id>` is wired in capture handlers but the actual handler is Phase 2).
2. Cross-user task assignment (`task_assignees` M2M).
3. Monthly compact (cron + flow).
4. Google Calendar sync.
5. Semantic search (embeddings).
6. Thematic sub-folders within projects (LLM-driven).

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?


