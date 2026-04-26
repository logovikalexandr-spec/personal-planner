# Personal Telegram Planner — Design Spec

**Status:** Draft (awaiting user review)
**Date:** 2026-04-26
**Authors:** Sasha (product) + Claude (design)
**Users:** Sasha (admin), Seryozha (sibling, shared use)
**Timezone:** Europe/Prague

---

## 1. Problem & Goal

### Problem
Items (links, ideas, voice notes, photos, action verbs) accumulate across chats, browser tabs, and head. No single inbox. No connection between captured items and active project context. Tasks ("придумать", "создать", "посмотреть") are not indexed alongside their owning project, so they never reach a calendar.

### Goal
A Telegram bot that acts as a personal chief-of-staff for two siblings:

1. **Inbox** — capture anything sent in Telegram (URL, text, voice, photo, file) into a structured store within ~2 seconds.
2. **Process** — on demand, the bot proposes which project the item belongs to and what action to take. The user approves or overrides.
3. **Tasks** — items containing action verbs become Tasks classified by Eisenhower quadrant, optionally with due date/time.
4. **Context-aware planning** — the bot maintains per-project memory and surfaces "what's on my week", project overviews, and reminders.
5. **Sustainable** — monthly compact keeps memory and storage from drowning the system.

### Non-Goals
- Not a team task tracker for >2 users.
- Not a CRM, not a knowledge base for arbitrary external readers.
- Not a replacement for Obsidian — Obsidian remains the human-facing read/edit surface.
- No public-facing API or web UI in MVP.

---

## 2. Acceptance Criteria

The MVP is complete when:

1. Both Sasha and Seryozha can `/start` the bot, are recognized by `telegram_id`, and addressed by name.
2. Forwarding any of {URL, text, voice, photo, file} to the bot creates a row in `Inbox`, a `.md` file in `_inbox/`, and a git push within 5 seconds.
3. `/inbox` returns the user's own + shared unprocessed items, sorted newest first.
4. Pressing **Обработать** under an item routes it to LLM-based processing that proposes a project + action and applies the change after user approval (move file, generate summary, update NocoDB row).
5. Bot handles low-confidence items by asking the user a clarifying question and persisting the answer into `Projects.context_notes`.
6. Tasks are created either from free text containing action verbs or via `/task` wizard. Each Task has a quadrant (Q1–Q4) chosen by user.
7. `/today`, `/week`, `/week <project>` return correctly filtered task views grouped by day.
8. `/projects`, `/project <slug>`, `/find <query>`, `/stats` work.
9. Daily digest at 08:00 and Q1 evening reminder at 19:00 fire automatically per user.
10. Voice notes are transcribed via Whisper API and stored in `Inbox.transcript`.
11. Multi-user ACL works: `personal/sasha`, `personal/seryozha`, and `work/ctok` are private to their owner; everything else is shared.
12. The bot uses `git pull --rebase` before any commit, then commits and pushes on each state change.
13. Voice always triggers transcription. Photos/files only trigger vision/OCR analysis when the user explicitly requests via caption or button.
14. The system runs as a Docker service on the existing Hetzner VPS alongside NocoDB without disturbing other containers.
15. Total runtime LLM cost stays under $10/month for the described usage pattern (≤50 items/day combined).

---

## 3. Architecture

### High-Level Diagram

```
┌─────────────┐         ┌─────────────────────────────────────┐
│  Telegram   │◄───────►│        Hetzner VPS (188.245.42.4)   │
│  (Sasha,    │ polling │                                     │
│   Seryozha) │         │  ┌────────────────────────────┐    │
└─────────────┘         │  │  python-telegram-bot       │    │
                        │  │  (asyncio, single process) │    │
                        │  └──────┬──────────┬──────────┘    │
                        │         │          │                │
                        │         ▼          ▼                │
                        │  ┌──────────┐  ┌───────────────┐   │
                        │  │ NocoDB   │  │ Local git     │   │
                        │  │+Postgres │  │ working copy  │   │
                        │  │(state +  │  │ /root/        │   │
                        │  │ binaries)│  │ personal-     │   │
                        │  └──────────┘  │ planner/      │   │
                        │                └──────┬────────┘   │
                        │                       │ push        │
                        │  Anthropic API ◄──────┤             │
                        │  (Sonnet 4.6 + Haiku 4.5 + caching) │
                        │  OpenAI Whisper API                 │
                        └───────────────────────┼─────────────┘
                                                │
                                                ▼
                                      ┌─────────────────────┐
                                      │  GitHub             │
                                      │  personal-planner   │
                                      │  (private repo)     │
                                      └──────────┬──────────┘
                                                 │ git pull
                                                 ▼
                                      ┌─────────────────────┐
                                      │  Mac (Sasha)        │
                                      │  ~/ИИ-агенты/       │
                                      │  Projects/          │
                                      │  personal-planner/  │
                                      │  (Obsidian Git)     │
                                      └─────────────────────┘
```

### Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Hosting | Hetzner CPX22 (existing, €3.90/mo) | Already paid, NocoDB already deployed |
| Bot framework | python-telegram-bot v21+ | Async, JobQueue, prior pattern (vladbot) |
| State store | NocoDB (Postgres backend) | Already running, web UI, attachment support |
| Content layer | Git → GitHub private repo | History, easy rollback, Obsidian-friendly |
| LLM (reasoning) | Claude Sonnet 4.6 + prompt caching | Quality, ~90% cache savings |
| LLM (cheap classify) | Claude Haiku 4.5 | Intent detection, low confidence path |
| Voice → text | OpenAI Whisper API | $0.006/min, accurate |
| Cron | python-telegram-bot `JobQueue` | Built-in, no separate process |
| Mac sync | Obsidian Git plugin | Auto-pull/commit/push in background |
| Deploy | Docker Compose | Already used for NocoDB |
| TG transport | Long-polling | No domain available; sufficient latency |
| Default timezone | Europe/Prague | Both users in Prague |

### VPS Deploy Layout

```
/root/
├── docker-compose.yml          # extends existing (nocodb + postgres + planner-bot)
├── personal-planner/           # git working copy
│   ├── _inbox/
│   ├── _archive/
│   ├── projects/
│   ├── tasks/
│   └── _meta/
└── planner-bot/
    ├── Dockerfile
    ├── bot.py                  # entry
    ├── handlers/               # TG handlers
    ├── llm/                    # Anthropic + OpenAI wrappers
    ├── nocodb/                 # NocoDB client
    ├── git_ops.py              # commit/push utilities
    ├── cron_jobs.py            # JobQueue jobs
    ├── acl.py                  # permission checks
    ├── logs/
    └── .env
```

### Python Dependencies

- `python-telegram-bot >= 21`
- `anthropic` (Claude SDK)
- `openai` (Whisper only)
- `httpx` (NocoDB REST client)
- `gitpython`
- `pydantic` v2
- `loguru`

### Architectural Invariants

1. **Single process, single writer.** All TG events serialized via asyncio. No race conditions in NocoDB or git.
2. **Idempotency.** Each TG `update_id` is recorded; reprocessing is a no-op.
3. **Prompt caching by default.** System prompt + per-project context cached. ~90% token savings on subsequent calls within cache window.
4. **Long-polling, not webhook.** No SSL/domain required. Latency acceptable.
5. **Auto-recovery.** Docker `restart=always`. Bot reads state from NocoDB on startup; no local state files.
6. **NocoDB is source of truth for state.** Git holds content (.md). On divergence, NocoDB wins; bot can regenerate `.md` from rows.
7. **No deletes.** Only `status=archived` or moves into `_archive/`. Recoverable via NocoDB UI or git revert.

---

## 4. Data Model

### NocoDB Tables

#### `Users`
| Field | Type | Notes |
|-------|------|-------|
| id | auto PK | |
| telegram_id | int unique | from TG |
| name | text | "Sasha" / "Seryozha" |
| role | enum | `sasha` \| `seryozha` |
| timezone | text | default `Europe/Prague` |
| created_at | datetime | |

Seed manually with both siblings before first use.

#### `Projects`
| Field | Type | Notes |
|-------|------|-------|
| id | auto PK | |
| slug | text unique | `ctok`, `learning`, `personal-sasha`, ... |
| category | enum | `personal` \| `learning` \| `work` |
| name | text | display name |
| description | text | short |
| context_notes | longtext | LLM-accumulated memory (raw) |
| context_notes_compact | longtext | compacted version (after monthly compact) |
| visibility | enum | `private` \| `shared` |
| owner_id | FK → Users | NULL for shared |
| folder_path | text | `projects/work/ctok` |
| color | text | optional emoji indicator |
| created_at | datetime | |
| archived | bool | default false |

**Initial Seed:**

| slug | category | visibility | owner |
|------|----------|------------|-------|
| personal-sasha | personal | private | sasha |
| personal-seryozha | personal | private | seryozha |
| learning | learning | shared | — |
| ctok | work | private | sasha |
| zima | work | shared | — |
| mr-vlad | work | shared | — |
| champ | work | shared | — |
| vesna-web | work | shared | — |
| prague-investment | work | shared | — |

#### `Inbox`
| Field | Type | Notes |
|-------|------|-------|
| id | auto PK | |
| created_at | datetime | |
| author_id | FK → Users | |
| source_type | enum | `url` \| `text` \| `voice` \| `photo` \| `file` \| `forward` |
| raw_content | longtext | URL / text / attachment path |
| title | text | auto-derived |
| summary | text | LLM 2–3 sentences |
| caption | text | nullable — user caption at upload |
| status | enum | `new` \| `thinking` \| `proposed` \| `processed` \| `archived` |
| project_id | FK → Projects | nullable until processed |
| target_path | text | `projects/work/ctok/research/` |
| action_taken | text | what was done |
| processed_at | datetime | nullable |
| file_path_repo | text | path to `.md` in repo |
| attachment_url | text | nullable, for photo/voice/file |
| transcript | longtext | nullable, Whisper output |
| confidence | float | nullable, LLM confidence in proposed project |

#### `Tasks`
| Field | Type | Notes |
|-------|------|-------|
| id | auto PK | |
| created_at | datetime | |
| author_id | FK → Users | |
| title | text | |
| description | longtext | nullable |
| project_id | FK → Projects | nullable |
| quadrant | enum | `Q1` \| `Q2` \| `Q3` \| `Q4` |
| due_date | date | nullable |
| due_time | time | nullable |
| status | enum | `todo` \| `in_progress` \| `done` \| `archived` |
| done_at | datetime | nullable |
| inbox_id | FK → Inbox | nullable |
| source_text | text | original user input |
| gcal_event_id | text | nullable (Phase 2) |
| file_path_repo | text | `tasks/2026-04/...md` |

#### `Actions`
Audit log of bot decisions and LLM calls.

| Field | Type | Notes |
|-------|------|-------|
| id | auto PK | |
| created_at | datetime | |
| inbox_id | FK → Inbox | nullable |
| task_id | FK → Tasks | nullable |
| author_id | FK → Users | |
| action_type | enum | `propose_project` \| `process` \| `move` \| `summarize` \| `transcribe` \| `clarify` \| `compact` |
| llm_input | longtext | |
| llm_output | longtext | |
| llm_model | text | `claude-sonnet-4-6` \| `claude-haiku-4-5` |
| tokens_in | int | |
| tokens_out | int | |
| cost_usd | float | |
| user_decision | text | nullable |

### Git Repo Layout

```
personal-planner/
├── README.md
├── .gitignore
├── .obsidian/
│
├── _inbox/                                  # unprocessed
│   └── 2026-04-26-1432-postgresql-replication.md
│
├── _archive/                                # post monthly compact
│   ├── inbox/2026-03/
│   └── tasks/2026-03/
│
├── projects/
│   ├── personal/
│   │   ├── sasha/{inbox,research,tasks,notes,files}/
│   │   └── seryozha/{inbox,research,tasks,notes,files}/
│   ├── learning/{inbox,research,tasks,notes,files}/
│   └── work/
│       ├── ctok/{inbox,research,tasks,notes,files}/
│       ├── zima/...
│       ├── mr-vlad/...
│       ├── champ/...
│       ├── vesna-web/...
│       └── prague-investment/...
│
├── tasks/                                   # cross-project view
│   ├── 2026-04/
│   │   └── 2026-04-26-prompt-ctok.md
│   └── _backlog.md
│
└── _meta/
    ├── context_notes_history/<slug>/2026-10.md
    └── monthly_reports/2026-10.md
```

### Frontmatter Schemas

**Inbox item (new):**
```yaml
---
inbox_id: 42
author: sasha
source: url
url: https://habr.com/ru/articles/12345/
created: 2026-04-26T14:32:00
status: new
project: null
---
```

**Inbox item (processed):**
```yaml
---
inbox_id: 42
author: sasha
source: url
url: https://habr.com/ru/articles/12345/
created: 2026-04-26T14:32:00
status: processed
project: learning
processed_at: 2026-04-26T18:01:32
action: moved + summary
---
```

**Task:**
```yaml
---
task_id: 17
author: sasha
project: ctok
quadrant: Q1
due: 2026-04-28
due_time: 14:00
status: todo
created: 2026-04-26T14:35:00
---
```

---

## 5. User Flows

### 5.1 Commands

**Direct commands (no LLM):**

| Command | Effect |
|---------|--------|
| `/start` | Register / greet (UPSERT Users by chat_id) |
| `/inbox` | List user's own + shared unprocessed items |
| `/inbox all` | All items (debug) |
| `/today` | Tasks where due_date = today, sorted Q1→Q4 |
| `/week` | Tasks for next 7 days, grouped by day |
| `/week <project>` | Same, filtered to project |
| `/projects` | Project list with item/task counts |
| `/project <slug>` | Project detail + recent items + context_notes |
| `/find <query>` | Full-text NocoDB search |
| `/task` | Task wizard (Eisenhower → date → project) |
| `/stats` | Current month stats for caller |
| `/settings` | Toggle digest, reminder times |
| `/help` | Command reference |

**LLM intent fallback:** Free text not matching a command and not resembling a new inbox item → Haiku detects intent. Examples:
- "что у меня на неделе" → `/week`
- "найди статью про postgresql" → `/find postgresql`
- "обработай последний" → process newest `status=new` item
- "расскажи про Ctok" → `/project ctok`

If intent ambiguous → bot asks clarifying question.

### 5.2 Flow — Item Arrival

```
User sends/forwards content in TG
         │
         ▼
[1] Detect source_type
         │
         ▼
[2] Preprocessing:
    - URL → fetch <title>, OpenGraph
    - Voice → Whisper → transcript
    - Photo/file → save to NocoDB attachments (no analysis yet)
    - Text → as-is
         │
         ▼
[3] LLM Haiku quick classify:
    - title (if not derived)
    - 2–3 sentence summary
    - guess project + confidence score
         │
         ▼
[4] INSERT Inbox (status=new)
         │
         ▼
[5] Create _inbox/YYYY-MM-DD-HHMM-slug.md
         │
         ▼
[6] git pull --rebase → add → commit → push
         │
         ▼
[7] TG reply:
    ✅ Принято #42
    "Title"
    Summary: ...
    🤖 Похоже на: learning (87%)
    [📥 Обработать] [📂 В learning] [✏️ Иначе] [🗑 Архив]
```

**Low-confidence path (<70%):**
```
🤔 #42 "Title"
Не уверен куда отнести. Расскажи в двух словах что это?
[Положи в inbox] [Я напишу]
```

User's clarification → bot updates `Projects.context_notes` for the chosen project, persists rule, confirms.

### 5.3 Flow — Process Inbox Item

User selects item from `/inbox`. Bot shows full content with:
`[📥 Обработать] [📂 Изменить проект] [✏️ Свободная инструкция] [🗑 Архив]`

**On Обработать:**
1. LLM Sonnet (agentic, with cached project context):
   - If confidence ≥ 70%: propose project + action
   - Else: ask clarifying question
2. Bot displays proposal:
   ```
   📂 learning/databases
   ⚙️ Action: переместить + TL;DR (3 пункта)
   [✅ Ок] [✏️ Иначе] [📂 Другой проект]
   ```
3. On approve:
   - LLM generates TL;DR, appends to `.md`
   - File moves `_inbox/...md` → `projects/.../...md` (`git mv`)
   - UPDATE Inbox: `status=processed`, `project_id`, `target_path`, `action_taken`
   - INSERT Actions row
   - `git add → commit → push`
   - Reply: `✅ #42 → learning/databases/postgresql-replication.md`

**On Свободная инструкция:** Bot prompts for arbitrary instruction, executes via Sonnet with tool use, confirms.

### 5.4 Flow — Task Creation

**From free text:**

User: *"завтра в 14:00 созвон с Vesna клиентом"*

Bot (Haiku detects task intent + parses date/time):
```
Создать задачу:
📌 Созвон с Vesna клиентом
📅 ВТ 27 апр, 14:00
📂 Проект: vesna-web
Куда по матрице?
[🔥 Q1] [📌 Q2] [⏰ Q3] [💤 Q4]
```

User picks quadrant → INSERT Tasks → write `tasks/YYYY-MM/...md` → push → confirm.

**Via `/task` wizard:** sequential prompts (description → quadrant → date → time → project) → INSERT → push.

### 5.5 Flow — Morning Digest (08:00)

For each user, JobQueue fires:
```
Доброе утро, Саша 👋

🔥 Q1 — 2 задачи на сегодня:
  • 14:00 Созвон с Vesna клиентом
  • Дописать prompt для Ctok bot

📌 Q2 на этой неделе — 5 задач (/week)

📥 Inbox: 3 необработанных
  #42 PostgreSQL replication
  #43 Идея для Ctok рекламы
  #44 Купить молоко
  [Обработать все] [/inbox]

⏰ Просрочено: 1
  • Deploy ZIMA креатив (вчера)
```

### 5.6 Flow — Q1 Evening Reminder (19:00)

Only fires if user has `status=todo` Q1 tasks.

```
Вечерняя проверка 🌆

Q1 на сегодня:
  ✅ Созвон с Vesna — done?
  ⏳ Дописать prompt для Ctok — todo

Что сделал?
[✅ Дописал prompt] [❌ Перенести] [📋 /today]
```

### 5.7 Flow — Project Overview Query

User: *"что у меня по Ctok"*

1. Haiku detects intent: `project_overview(ctok)`
2. ACL check — Sasha owns ctok → ok. Seryozha → "Ctok приватный, доступа нет."
3. Sonnet (with cached `context_notes`) reads:
   - Tasks where project=ctok, status≠done (top 10)
   - Inbox where project=ctok ORDER BY created DESC LIMIT 5
4. Reply: structured project overview (Q1/Q2/Q3/Q4 tasks + recent items + context summary).

### 5.8 Flow — Multi-User

- Bot identifies user by `chat_id` on every message.
- Replies address the user by name.
- `/inbox` returns own + shared. Private items of the other sibling are filtered out.
- Cross-user task assignment is **Phase 2**. In MVP: a sibling can create a task in a shared project; bot notifies the other ("Серёжа создал задачу X в vesna-web").

---

## 6. Operations

### 6.1 Cron Jobs (JobQueue)

| Job | Time (Europe/Prague) | Effect |
|-----|----------------------|--------|
| `morning_digest` | 08:00 daily | Per-user digest |
| `evening_q1_reminder` | 19:00 daily | Q1 todo check |
| `weekly_q2_review` | Friday 17:00 | "Не забудь про важное (Q2)" |
| `weekly_q3_batch` | 12:00 daily | Q3 batch reminder |
| `weekly_q4_cleanup` | Sunday 12:00 | Q4 archive prompt |
| `monthly_compact` | 1st of month 09:00 | Compact (preview → approve → execute) |
| `monthly_stats` | 1st of month 09:30 | Per-user month report |
| `git_health_check` | every 6h | `git fetch --dry-run` sanity |
| `due_date_warner` | hourly 09–21 | Push tasks with due_date ≤ today, status=todo, not yet pushed today |

### 6.2 Monthly Compact

**Preview (09:00 on 1st):**

Bot collects candidates:
1. `Projects.context_notes` larger than 2 KB
2. Inbox items with `status` in (processed, archived) and `created_at > 30 days ago`
3. Tasks `status=done`, `done_at > 30 days ago`

Sends preview to admin (Sasha):
```
📊 Месячный компакт — 1 ноя 2026

1. Сжать context_notes:
   • ctok (4.2kb → ~1.5kb)
   • learning (3.1kb → ~1.2kb)

2. Архивировать processed inbox:
   • 38 items → _archive/inbox/2026-10/

3. Архивировать done tasks:
   • 23 задач → _archive/tasks/2026-10/

Ничего не удаляется. Raw версии в _meta/context_notes_history/.

[✅ Запустить] [⏰ Отложить] [⚙️ Изменить план]
```

**Execute (after approval):**
1. For each project with oversized notes:
   - Save raw to `_meta/context_notes_history/<slug>/YYYY-MM.md`
   - Sonnet compacts with rules: keep all active rules, dedupe, drop rules marked obsolete, target ≤2 KB
   - UPDATE `Projects.context_notes_compact`
   - Runtime uses compact version as system prompt
2. `git mv` archive candidates into `_archive/`
3. Single commit `chore: monthly compact YYYY-MM` + push
4. Send month stats report

**Rollback:** `git revert <sha>` or restore from `_meta/context_notes_history/`.

### 6.3 Monthly Stats Report

Per-user message after compact:
```
📊 Октябрь 2026 — Саша

Inbox: 47 принято / 41 обработано (87%) / avg 3.5 в день
Tasks: 32 создано / 23 закрыто / 9 в пайплайне (Q1:2 Q2:4 Q3:2 Q4:1)
Топ-3 проекта: ctok(15+8) learning(12+6) vesna-web(8+5)
LLM costs: Sonnet $3.20 / Haiku $0.40 / Whisper $0.15 / total $3.75
Архивировано: 38 items + 23 tasks → _archive/2026-10/
```

### 6.4 Initial Deploy

```bash
ssh root@188.245.42.4
cd /root

# 1. Create GitHub private repo personal-planner

# 2. Add deploy key (existing /root/.ssh/id_ed25519.pub) to GitHub repo settings

# 3. Clone
git clone git@github.com:<user>/personal-planner.git
cd personal-planner

# 4. Create skeleton
mkdir -p _inbox _archive tasks _meta/context_notes_history _meta/monthly_reports
mkdir -p projects/personal/{sasha,seryozha}/{inbox,research,tasks,notes,files}
mkdir -p projects/learning/{inbox,research,tasks,notes,files}
for p in ctok zima mr-vlad champ vesna-web prague-investment; do
  mkdir -p projects/work/$p/{inbox,research,tasks,notes,files}
done
git add . && git commit -m "init structure" && git push

# 5. Seed Users + Projects in NocoDB UI

# 6. Build & start bot
cd /root/planner-bot
docker compose up -d
docker compose logs -f planner-bot
```

**docker-compose.yml addition (extends existing nocodb file):**
```yaml
services:
  planner-bot:
    build: ./planner-bot
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

**.env (on VPS, never in git):**
```
TG_BOT_TOKEN=...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
NOCODB_URL=http://nocodb:8080/api/v2
NOCODB_TOKEN=...
GIT_REPO_PATH=/app/repo
GIT_USER_EMAIL=bot@personal-planner
GIT_USER_NAME=planner-bot
ADMIN_CHAT_ID=<sasha telegram id>
LOG_LEVEL=INFO
DEFAULT_TIMEZONE=Europe/Prague
```

### 6.5 Security & Permissions

1. **TG access control** — `Users.telegram_id` whitelist. Unknown chat_ids get `"Бот личный. Доступа нет."` and an admin notification.
2. **Project visibility** — `acl_check(user, project)` runs on every read/write:
   - `private + owner=user` → ok
   - `private + owner≠user` → deny + log
   - `shared` → ok
3. **Secrets** in `.env` only. Never in git, never in logs.
4. **Git deploy key** — read-write to this repo only, on VPS `/root/.ssh/`.
5. **NocoDB API** — token auth, bound to docker network (not exposed publicly).
6. **LLM data exposure** — only the active item + its target project's `context_notes` are sent to Anthropic. Anthropic API ToS: 30-day retention, no training use.

### 6.6 Observability

- `loguru` → `/app/logs/bot.log`, rotated 10 MB × 7 files.
- Per-call metrics in `Actions` table: tokens, cost, model, latency, errors.
- `/admin stats` (admin-only) shows uptime, TG update count, p95 latency, LLM call count, NocoDB row counts, disk usage.

### 6.7 Backup

| Layer | Mechanism | Frequency |
|-------|-----------|-----------|
| Content | git history on GitHub | per commit (instant) |
| NocoDB Postgres | `pg_dump` → `/root/backups/` → push to separate private backup repo | daily 03:00 |
| NocoDB attachments | rsync → backup repo | weekly |

Recovery: pull backup repo on a fresh VPS, `pg_restore`, `docker compose up`.

### 6.8 Phase Plan

**MVP (Phase 1):**
- Inbox flow (text/url/voice/photo/file capture + processing)
- Tasks with Eisenhower
- Commands: `/inbox /today /week /projects /project /find /task /stats /settings /help`
- Daily digest 08:00 + Q1 evening reminder 19:00
- Multi-user with ACL
- Git sync per change
- LLM: Sonnet + Haiku + Whisper

**Phase 2 (after 2–4 weeks of MVP usage):**
- Monthly compact
- Google Calendar integration
- Cross-user task assignment
- Semantic search (embeddings) if corpus >1000
- Thematic sub-folders within projects (LLM-driven)
- `/settings` extensions (quiet hours, custom digest times)

**Phase 3 (if traction):**
- Voice diarization
- OCR / vision for photos
- Inline-mode `@bot` for adding from other chats
- Read-only web UI

### 6.9 Cost Estimate

| Item | Monthly |
|------|---------|
| Hetzner VPS | €0 (existing) |
| GitHub | $0 (private) |
| Anthropic Sonnet (with caching) | $2–4 |
| Anthropic Haiku | $0.30–0.80 |
| OpenAI Whisper | $0.20–0.50 |
| **Total** | **~$3–5** |

Worst case (≥50 items/day, frequent long dialogues): $10–15/mo.

---

## 7. Constraints

- VPS RAM budget for bot: ≤256 MB (Hetzner CPX22 has 4 GB total, NocoDB+Postgres consume most).
- Single-process design — no worker pool, no horizontal scaling.
- No webhook (no domain) → long-polling latency 1–2 s acceptable.
- Bot owners must manually maintain GitHub deploy key on VPS.
- Anthropic + OpenAI API availability is a hard dependency. If down, inbox capture still works (no LLM for classify); processing is queued.
- 1M-row+ scale is out of scope. NocoDB + single Postgres is sufficient up to ~10k items per user.

---

## 8. Open Items / Deferred Decisions

These are intentionally deferred and documented here so they aren't lost:

1. **Cross-user task assignment** — Phase 2. M2M `task_assignees` table. MVP uses single `author_id`.
2. **Thematic sub-folders inside projects** (variant D from brainstorm) — Phase 2. LLM proposes new sub-folder when it detects clusters.
3. **Google Calendar sync** — Phase 2. `Tasks.gcal_event_id` field is reserved.
4. **Semantic search** — Phase 2. Will require embeddings store (pgvector on existing Postgres).
5. **Quiet hours / configurable digest times** — Phase 2 via `/settings`.
6. **`/settings` schema** — defined together with the Phase 2 features that need configuration (digest time, quiet hours, reminder cadence). Not in MVP scope.

---

## 9. Glossary

- **Inbox** — capture queue. Newly arrived items, unsorted.
- **Process** — LLM-assisted move from inbox to a project, optionally with summary/extract.
- **Quadrant** — Eisenhower category. Q1 (urgent+important), Q2 (important not urgent), Q3 (urgent not important), Q4 (neither).
- **Context notes** — per-project memory accumulated by the bot from user clarifications. The bot's "knowledge" of how a project should be treated.
- **Compact** — monthly LLM-driven summarization of `context_notes` and archival of old items/tasks.
- **Shared project** — visible and editable to both siblings.
- **Private project** — visible only to its `owner_id`.
