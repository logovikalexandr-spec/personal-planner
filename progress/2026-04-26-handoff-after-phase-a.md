# Handoff — After Phase A

**Date:** 2026-04-26
**Author:** Sasha + Claude (this session)
**Project:** Personal Telegram Planner MVP
**Repo:** https://github.com/logovikalexandr-spec/personal-planner
**VPS:** Hetzner CPX22 at `188.245.42.4` (project `MR-VLAD` in Hetzner Console)

---

## Current State (everything green)

- 9 commits on `main`, latest `d4d64d3 docs(runbook): Phase A VPS deploy steps`
- Phase A code shipped:
  - Python package `planner_bot` (config, repo_layout with slugify, handlers/start)
  - NocoDB seed payloads (Users + Projects)
  - Dockerfile (python:3.11-slim) + isolated docker-compose.yml on VPS
- 18 unit tests passing (`cd planner-bot && pytest -v`)
- VPS deployed in **isolated stack** at `/root/personal-planner/`:
  - `pp-postgres` (Postgres 16, internal only)
  - `pp-nocodb` (NocoDB UI on **port 8081** to avoid clashing with the `ch-nocodb` already on 8080)
  - `pp-bot` (planner-bot, polling Telegram)
- Bot is alive, getUpdates polling works, receives `/start` and crashes with `KeyError: 'users_repo'` (expected — wiring is Phase F Task 34)

## Decisions made this session

1. **Isolation over sharing** — separate NocoDB+Postgres stack for personal-planner; existing `ch-nocodb` and `mr-vlad-n8n-1` untouched.
2. **Long-polling** for Telegram (no domain/SSL).
3. **Plan amendments approved during execution:**
   - `pythonpath = ["."]` in `pyproject.toml` (pytest 9 doesn't auto-add cwd)
   - 3 fixes in `slugify` (consecutive dashes, trailing dash, empty fallback)
   - `FakeContext.args` added; `close_loop=False` comment in bot.py
   - NocoDB healthcheck switched from `/usr/src/appEntry/healthcheck.sh` to `wget /api/v1/health` (image structure changed)

## Reproducible env

### From Mac
```bash
cd /Users/logovik/ИИ-агенты/Projects/personal-planner/planner-bot
source .venv/bin/activate
pytest -v   # 18 passed
```

### SSH to VPS
SSH key `~/.ssh/id_ed25519.pub` is in `/root/.ssh/authorized_keys` on VPS — passwordless login from this Mac works:
```bash
ssh root@188.245.42.4
```

### Docker stack on VPS
```bash
ssh root@188.245.42.4 'cd /root/personal-planner && docker compose ps'
ssh root@188.245.42.4 'cd /root/personal-planner && docker compose logs planner-bot --tail=50'
ssh root@188.245.42.4 'cd /root/personal-planner && docker compose restart planner-bot'
```

### NocoDB UI
http://188.245.42.4:8081 — no project/tables created yet. First-time setup will need: create admin account, create "Base", capture base ID + API token for Phase B.

## Telegram bot

- Token: see `.env` on VPS at `/root/personal-planner/planner-bot/.env`
- Bot username: whatever BotFather gave (created today)
- Admin chat_id (Sasha): `753714399`
- Seryozha chat_id: not captured yet (run @userinfobot from his account when needed for Phase B+)

## Security cleanup needed

User was asked to:
1. Revoke GitHub PAT `ghp_p190...` (https://github.com/settings/tokens)
2. Change VPS root password from the Hetzner-generated `Logovik15237890!` (run `passwd` on VPS)
3. Optionally rotate Telegram bot token via @BotFather `/revoke` and update `.env`

Status of these: **unconfirmed by user as of session end**.

## Phase Roadmap (37 tasks left)

| Phase | Tasks | Goal |
|-------|-------|------|
| **B** | 7–12 | Inbox capture (text/url). Creates NocoDB tables, async client, repos, ACL helper, git_ops, markdown writer, capture handler. After Phase B, forwarding a URL to the bot creates a NocoDB row + a `.md` file + a git push. `/start` will work for the first time. |
| C | 13–18 | LLM classify (Haiku) + process (Sonnet) + clarify flow + intent detection |
| D | 19–22 | Voice (Whisper transcribe), photo, document capture |
| E | 23–27 | Tasks + Eisenhower matrix + date parsing + `/today` `/week` `/task` |
| F | 28–34 | Commands `/inbox /projects /find /stats /help /settings`, intent router, full bot wiring |
| G | 35–38 | Cron jobs (morning digest 08:00, Q1 evening 19:00, due warner) |
| H | 39–43 | ACL hardening, /admin, logging, deploy runbook, E2E manual checklist |

## How to resume in a new session

Tell the new Claude:

> *Project: personal-planner. Continue from Phase B.*
> *Read these to catch up:*
>  - *`docs/superpowers/specs/2026-04-26-personal-planner-design.md` (the spec)*
>  - *`docs/superpowers/plans/2026-04-26-personal-planner-mvp.md` (the plan, 43 tasks)*
>  - *`progress/2026-04-26-handoff-after-phase-a.md` (this file)*
> *VPS access: `ssh root@188.245.42.4` (key already authorized).*
> *Use bulletproof skill in M mode + superpowers:subagent-driven-development.*
> *Phase A done (Tasks 1–6), 18 tests green, bot deployed and polling Telegram, but `/start` crashes with KeyError until Phase B Task 8+ wires `users_repo`.*
> *Start with Task 7 (NocoDB tables creation script).*

## Files to read first in next session

1. `docs/superpowers/specs/2026-04-26-personal-planner-design.md`
2. `docs/superpowers/plans/2026-04-26-personal-planner-mvp.md` — jump to "Phase B — Inbox Capture (text/url)" → Task 7
3. This handoff
4. `docs/runbooks/phase-a-deploy.md` (for VPS context if needed)

## Known follow-ups (deferred technical debt)

- Add `.dockerignore` to `planner-bot/` — currently the build context uploads `.venv/` and other clutter. Plan didn't request, defer to Phase H polish.
- `init_repo_layout.py` requires git identity configured at `/root/personal-planner/` on VPS — currently is (`planner-bot@vps`). Document in Phase H runbook update.
- `/settings` schema is Phase 2 placeholder, not in MVP.
- The plan calls `docker-compose.override.yml` at the project root for VPS deploy. We deviated to a standalone `docker-compose.yml` in `/root/personal-planner/` with its own NocoDB+Postgres for isolation. The override file is no longer needed and was deleted on VPS — but it still exists in git. Phase B should remove it.
- NocoDB seed (`scripts/seed_nocodb.py`) and table-creation script not yet executed against the live NocoDB (Phase B Task 7+8 will do this).
