# Handoff — After Phase C + Task 34 (minimal wiring)

**Date:** 2026-04-26
**Branch:** `main` (13 commits ahead of `origin/main` until pushed)
**Repo:** https://github.com/logovikalexandr-spec/personal-planner
**VPS:** Hetzner CPX22 at `188.245.42.4` (key auth from this Mac)
**Model used previous session:** Opus 4.7 (1M ctx). **Recommendation: switch to Sonnet 4.6** for the rest — tasks are mechanical TDD + paste-from-plan.

---

## Test status

```bash
cd /Users/logovik/ИИ-агенты/Projects/personal-planner/planner-bot
source .venv/bin/activate
pytest -v   # 58 passed
```

## What ships

| Phase | Tasks | Status |
|-------|-------|--------|
| A | 1–6 | ✅ shipped (handoff: `progress/2026-04-26-handoff-after-phase-a.md`) |
| B | 7–12 | ✅ shipped (NocoDB schema + client + repos + ACL + git_ops + inbox capture) |
| C | 13–18 | ✅ shipped (Anthropic wrapper + classify + process + intent + process callback + clarify) |
| **F Task 34** | min wiring | ✅ shipped — Phase A+B+C handlers wired in `bot.py`, voice/photo/doc + other commands deferred |
| D | 19–22 | ⏸ pending (voice/photo/document, archive callback) |
| E | 23–27 | ⏸ pending (tasks + Eisenhower + dates + /today /week /task) |
| F | 28–33 | ⏸ pending (`/inbox /projects /find /stats /help /settings`, free-text intent router) |
| G | 35–38 | ⏸ pending (cron, digests, reminders) |
| H | 39–43 | ⏸ pending (ACL hardening, /admin, logging, runbook, E2E) |

Plan file: `docs/superpowers/plans/2026-04-26-personal-planner-mvp.md` — line numbers per task in handoff-after-phase-a.md still valid.

## Wiring deviation in Task 34

Plan calls Task 34 to import all Phase D-F handlers — they don't exist yet. **My deviation:** wired only Phase A+B+C. Affected:
- `bot.py` registers only `/start`, capture (`route_text`), and 3 callback patterns (`process:`, `clarify:`, `archive:`).
- `route_text` chooses clarify vs capture by `context.user_data["pending_clarify_inbox_id"]`.
- `on_archive_callback` is a stub: replies "Archive — ждёт Phase H".
- Phase D-F tasks reintroduce the rest of the imports & registrations as their plans state.

When Phase D-F land, **`bot.py` needs to be re-merged** with the plan's full Task 34 listing (line 5276-5472 in plan).

## What works end-to-end after deploy

- `/start` (whitelist via `users_repo`)
- Forward URL/text → Haiku classify → Inbox row + `_inbox/<slug>.md` + git push + reply with [Обработать][Сразу в …][Иначе][Архив] buttons
- "Обработать" → Sonnet process → moves to `projects/.../research/` + appends TL;DR + push
- "Иначе" → bot waits for user reply → Haiku extracts target + rule → updates `Projects.context_notes` + processes

## What does NOT work yet

- Voice/photo/document capture
- `/inbox /today /week /projects /find /task /stats /settings /help`
- Free-text intent routing (`detect_intent` exists but not wired into `route_text`)
- Eisenhower tasks
- Cron jobs (digests, reminders)

## VPS deploy steps for testing inbox flow

Pre-req on Mac: push `main` (`git push origin main`).

1. **NocoDB UI** — http://188.245.42.4:8081
   - First-time admin signup
   - "Create base" → name "personal-planner"
   - **Capture** base ID (URL: `…/dashboard/#/nc/<BASE_ID>`) and an API token (User Settings → API Tokens)

2. **VPS — env**
   ```bash
   ssh root@188.245.42.4
   cd /root/personal-planner
   # add to planner-bot/.env:
   #   ANTHROPIC_API_KEY=sk-ant-...
   #   NOCODB_BASE_ID=<from step 1>
   #   NOCODB_TOKEN=<from step 1>   (already there from Phase A — replace if regenerated)
   ```

3. **VPS — git pull + create tables**
   ```bash
   cd /root/personal-planner && git pull
   docker compose exec planner-bot python -m scripts.create_nocodb_tables
   # expect: created: Users / Projects / Inbox / Tasks / Actions
   ```

4. **VPS — seed Users (must edit script first to set real telegram_ids)**

   Edit `planner-bot/scripts/seed_nocodb.py` — replace `"telegram_id": None` with real ints:
   - Sasha: `753714399`
   - Seryozha: capture via @userinfobot from his account, then commit + redeploy

   Then:
   ```bash
   cd /root/personal-planner && git pull
   docker compose exec planner-bot python -m scripts.seed_nocodb
   ```

5. **VPS — restart bot**
   ```bash
   docker compose up -d --build planner-bot
   docker compose logs -f planner-bot
   ```

6. **Test in TG**
   - `/start` → "Привет, Sasha…"
   - Send a URL like `https://habr.com/ru/articles/12345/` → expect `✅ Принято #1` with buttons
   - Tap "📥 Обработать" → expect `✅ #1 → learning/research/...md`

## Known follow-ups already documented

(from handoff-after-phase-a.md, still open):
- Add `.dockerignore` to `planner-bot/`
- Document `init_repo_layout.py` git identity requirement in Phase H runbook
- `/settings` schema deferred to Phase 2
- Delete `docker-compose.override.yml` from git (already deleted on VPS)
- Bot crashed on `/start` with `KeyError: 'users_repo'` before Task 34 — **fixed now**

## Continuation prompt for new session

```
Project: personal-planner. Continue from Phase D (Task 19) on Sonnet 4.6.
Read in order:
  - progress/2026-04-26-handoff-after-phase-c.md
  - docs/superpowers/plans/2026-04-26-personal-planner-mvp.md (Tasks 19-43)
VPS: ssh root@188.245.42.4 (key authorized).
Tests: 58 green. Phase A+B+C + Task 34 minimal wiring on main.
Use bulletproof M + superpowers:subagent-driven-development. Strict TDD.

Order: Phase D (19-22) → Phase E (23-27) → Phase F (28-33, includes
re-merging bot.py with full Task 34 listing from plan) → Phase G (35-38)
→ Phase H (39-43).

If tokens tight: skip Phase G+H, ship D+E+F. That gives full inbox/voice/
photo/tasks/commands. Cron and polish are nice-to-have.

Start Task 19.
```
