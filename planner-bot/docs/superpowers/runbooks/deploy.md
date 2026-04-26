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
Look up each user's `telegram_id` (have them message `/start` to the bot) and update the `Users` rows after seed:

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
