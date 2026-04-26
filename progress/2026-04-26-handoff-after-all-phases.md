# Handoff — After Phase D+E+F+G+H

**Date:** 2026-04-26
**Branch:** `main` (49 commits)
**Tests:** 102 passed, 1 skipped (E2E smoke gate, requires `E2E_SMOKE=1`)
**Model used:** Sonnet 4.6

---

## What shipped this session

| Phase | Tasks | Status |
|-------|-------|--------|
| D | 19-22 | ✅ Voice/photo/doc capture + archive callback |
| E | 23-27 | ✅ Dateparse + task creation + quadrant wizard + /today /week /task |
| F | 28-34 | ✅ /inbox /projects /project /find /stats /help /settings + free-text router + full bot.py |
| G | 35-38 | ✅ Morning digest + evening Q1 reminder + due-date warner + cron wired |
| H | 39-43 | ✅ ACL hardening + /admin + loguru + deploy runbook + E2E checklist |

**All 43 MVP tasks complete.**

---

## Test baseline

```bash
cd /Users/logovik/ИИ-AgentsProjects/personal-planner/planner-bot
source .venv/bin/activate
pytest -q   # 102 passed, 1 skipped
```

---

## Key files added this session

**Handlers (new):**
- `planner_bot/handlers/voice_capture.py`
- `planner_bot/handlers/photo_capture.py`
- `planner_bot/handlers/document_capture.py`
- `planner_bot/handlers/tasks_commands.py` (create_task, quadrant wizard, /today, /week, /task)
- `planner_bot/handlers/inbox_list_command.py`
- `planner_bot/handlers/projects_commands.py`
- `planner_bot/handlers/find_command.py`
- `planner_bot/handlers/stats_command.py`
- `planner_bot/handlers/help_command.py`
- `planner_bot/handlers/settings_command.py`
- `planner_bot/handlers/free_text.py`
- `planner_bot/handlers/admin.py`

**Core (new/modified):**
- `planner_bot/llm/whisper_client.py`
- `planner_bot/dateparse.py`
- `planner_bot/formatters.py`
- `planner_bot/cron_jobs.py`
- `planner_bot/bot.py` (full replacement — all handlers wired)
- `planner_bot/markdown_files.py` (added `write_task_md`)
- `planner_bot/handlers/inbox_commands.py` (added `on_archive_callback`)

**Docs:**
- `docs/superpowers/runbooks/deploy.md`
- `tests/E2E_CHECKLIST.md`

---

## What works end-to-end (after deploy)

- `/start` → whitelist check
- URL/text → Haiku classify → inbox + md + git push + buttons
- Voice note → Whisper → classify → inbox + transcript + buttons
- Photo/doc → save to _attachments + inbox + buttons
- Обработать → Sonnet process → move to project folder
- Иначе → clarify → update context_notes → process
- Архив → status=archived
- `/inbox` → own + shared unprocessed
- `/today`, `/week [slug]` → grouped by quadrant/day
- `/task <title>` → quadrant wizard → create task
- `/projects`, `/project <slug>` → ACL-filtered
- `/find <query>` → ACL-filtered search
- `/stats` → month summary + LLM cost
- `/help`, `/settings` (stub)
- `/admin health` → admin-only
- Free-text intent routing via Haiku detect_intent
- Morning digest 08:00 + evening Q1 check 19:00 + hourly due-date warner

## What does NOT work yet

- `analyze:` callback (photo/doc analysis) — Phase 2
- `/settings` schema — Phase 2
- Semantic search (embeddings) — Phase 2
- Cross-user task assignment — Phase 2
- Monthly compact cron — Phase 2

---

## NocoDB repos needed by new handlers (not yet implemented)

The tests mock these — real NocoDB repos need these methods:
- `InboxRepo.list_unprocessed_for_user(author_id, shared_authors)`
- `InboxRepo.search_text(query, limit)`
- `TasksRepo.create(payload)`, `update(id, fields)`
- `TasksRepo.list_today(author_id, today)`
- `TasksRepo.list_week(author_id, start, end)`
- `TasksRepo.list_for_user_active(author_id)`
- `TasksRepo.list_q1_today(author_id, today)`
- `ProjectsRepo.list_visible_to(role)`
- `ProjectsRepo.list_all()`
- `UsersRepo.list_all()`

These need to be implemented in `planner_bot/nocodb/repos.py` before VPS deploy works end-to-end.

---

## Deploy next steps

1. Push to GitHub: `git push origin main`
2. VPS: `ssh root@188.245.42.4` → `cd /root/personal-planner && git pull`
3. Implement missing NocoDB repo methods (see above)
4. `docker compose up -d --build planner-bot`
5. Follow `tests/E2E_CHECKLIST.md`
