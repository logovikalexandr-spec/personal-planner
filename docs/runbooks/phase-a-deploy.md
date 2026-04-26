# Phase A — VPS Deploy Runbook

> **Status:** Phase A code is live on GitHub. Phase A scope = skeleton + `/start` only. NO inbox/tasks/cron yet (those land in Phases B–G).
>
> **Goal of this runbook:** stand up the bot on the existing Hetzner VPS so we can verify the infra wiring (Docker build, NocoDB still up, env loaded, Telegram connection, `/start` reply) end-to-end before Phase B begins.
>
> **You will need:**
> - SSH or Hetzner Console access to `188.245.42.4`
> - A Telegram bot token (@BotFather)
> - An Anthropic API key (https://console.anthropic.com/settings/keys) — placeholder OK for Phase A, real value needed for Phase B+
> - An OpenAI API key — same, placeholder OK for Phase A
> - A NocoDB API token (already-running NocoDB UI → Account Settings → Tokens → Create)
> - Your own Telegram numeric `chat_id` (placeholder for Phase A, real value needed before `/start`)

---

## 1. Telegram bot creation (one-time)

If you don't already have a bot:

1. Open Telegram, talk to **@BotFather**
2. `/newbot` → name → username (e.g., `personal_planner_log_bot`)
3. Save the token BotFather gives you (looks like `8412345678:AAEab...`).
4. (Optional, recommended) `/setprivacy` → Disabled — lets the bot read group messages later if needed. Not required for MVP.

Do NOT add the bot to any chats yet. Phase A runbook only verifies private DM `/start`.

---

## 2. Find your Telegram numeric `chat_id`

Easiest way: temporarily talk to **@userinfobot** in Telegram. It echoes your chat_id.

Save your `chat_id` (e.g. `123456789`) and Seryozha's (also via @userinfobot from his account).

---

## 3. SSH to the VPS

```bash
ssh root@188.245.42.4
# or use Hetzner Cloud Console if SSH not configured
```

If SSH key isn't set up yet, use Hetzner Console.

---

## 4. Add a deploy key for the GitHub repo

The bot's git working copy on the VPS pushes back to GitHub on every change. We need a deploy key with **write access**.

```bash
# On the VPS:
ssh-keygen -t ed25519 -C "planner-bot@vps" -f ~/.ssh/id_ed25519_planner -N ""
cat ~/.ssh/id_ed25519_planner.pub
```

Copy the printed public key. On GitHub:
1. Go to https://github.com/logovikalexandr-spec/personal-planner/settings/keys
2. **Add deploy key**
3. Title: `Hetzner planner-bot`
4. Key: paste the public key
5. **✅ Allow write access** (this is critical — Phase B+ will git push)
6. Add key

Configure the VPS to use this key for github.com:

```bash
cat >> ~/.ssh/config <<'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_planner
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
# Expected: "Hi logovikalexandr-spec/personal-planner! You've successfully authenticated, but GitHub does not provide shell access."
```

---

## 5. Clone the repo

```bash
cd /root
git clone git@github.com:logovikalexandr-spec/personal-planner.git
cd personal-planner
git config user.email "planner-bot@vps"
git config user.name "planner-bot"
```

You should now have:
```
/root/personal-planner/
├── docs/
├── docker-compose.override.yml
├── planner-bot/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── planner_bot/
│   ├── scripts/
│   └── tests/
└── README.md (none yet — created later)
```

---

## 6. Create the .env

```bash
cd /root/personal-planner/planner-bot
cp .env.example .env
nano .env
```

Fill in (replace each placeholder):
```
TG_BOT_TOKEN=<from BotFather>
ANTHROPIC_API_KEY=<placeholder for Phase A, e.g. "PHASE_A_PLACEHOLDER">
OPENAI_API_KEY=<placeholder for Phase A>
NOCODB_URL=http://nocodb:8080/api/v2
NOCODB_TOKEN=<from NocoDB UI Account Settings → Tokens>
GIT_REPO_PATH=/app/repo
GIT_REMOTE=origin
GIT_USER_EMAIL=planner-bot@vps
GIT_USER_NAME=planner-bot
ADMIN_CHAT_ID=<your numeric chat_id>
LOG_LEVEL=INFO
DEFAULT_TIMEZONE=Europe/Prague
```

Save & exit nano (Ctrl+O, Enter, Ctrl+X).

> **Phase A note:** the bot will start fine with placeholder Anthropic/OpenAI keys because no LLM call happens until Phase C. Same for NocoDB — Phase A's `/start` only reads Users via the (yet-unused) `users_repo`, but the binding happens later (Task 34). For Phase A we just need the bot to start without crashing.

---

## 7. Verify NocoDB is still up

```bash
docker ps --filter name=nocodb
docker compose ps nocodb
curl -s http://127.0.0.1:8080/api/v1/health || echo "NocoDB not responding on 8080"
```

If NocoDB isn't running, that's a pre-existing issue — fix before continuing.

---

## 8. Determine the existing compose file location

Where is the existing `docker-compose.yml` that runs NocoDB? Probably `/root/docker-compose.yml`. Confirm:

```bash
ls -la /root/docker-compose*.yml
```

The repo we just cloned ships its own `docker-compose.override.yml` at `/root/personal-planner/docker-compose.override.yml`. We need that file alongside the existing NocoDB compose so Docker Compose merges them.

Two options:

**Option A — symlink (cleaner):**
```bash
ln -sf /root/personal-planner/docker-compose.override.yml /root/docker-compose.override.yml
```

**Option B — copy:**
```bash
cp /root/personal-planner/docker-compose.override.yml /root/docker-compose.override.yml
```

Either works. Option A keeps the override in sync with future `git pull`s. Recommend A.

---

## 9. Adjust paths in the override

The override has these volume mounts:
```yaml
volumes:
  - /root/personal-planner:/app/repo
  - /root/.ssh:/root/.ssh:ro
  - ./planner-bot/logs:/app/logs
```

Notes:
- `./planner-bot/logs` resolves relative to where compose is run from (i.e. `/root/`). So you need `/root/planner-bot/logs` to exist OR change the volume to absolute.

**Easiest fix — change the path to absolute:**
```bash
sed -i 's|./planner-bot/logs|/root/personal-planner/planner-bot/logs|g' /root/personal-planner/docker-compose.override.yml
```

Then ensure the dir exists:
```bash
mkdir -p /root/personal-planner/planner-bot/logs
```

(Note: this `sed` modifies the file in the git working copy. We will commit the change in Phase B planning, but for Phase A smoke deploy this is fine. Alternatively: edit the override manually with absolute paths.)

Also: the `build.context: ./planner-bot` resolves relative to compose's directory. If we run compose from `/root/`, this points to `/root/planner-bot/` which doesn't exist. Fix:

```bash
sed -i 's|context: ./planner-bot|context: /root/personal-planner/planner-bot|g' /root/personal-planner/docker-compose.override.yml
```

So the final override file should have:
```yaml
services:
  planner-bot:
    build:
      context: /root/personal-planner/planner-bot
    image: planner-bot:latest
    restart: always
    env_file: /root/personal-planner/planner-bot/.env
    volumes:
      - /root/personal-planner:/app/repo
      - /root/.ssh:/root/.ssh:ro
      - /root/personal-planner/planner-bot/logs:/app/logs
    depends_on:
      - nocodb
    networks:
      - default
```

Update `env_file` too:
```bash
sed -i 's|env_file: ./planner-bot/.env|env_file: /root/personal-planner/planner-bot/.env|g' /root/personal-planner/docker-compose.override.yml
```

Verify:
```bash
cat /root/personal-planner/docker-compose.override.yml
```

---

## 10. Build the bot image

```bash
cd /root
docker compose build planner-bot
```

Should take 30–90 seconds. Watch for `Successfully tagged planner-bot:latest`. If pip install fails on a dependency, screenshot the error and ping me.

---

## 11. Start it

```bash
docker compose up -d planner-bot
docker compose ps planner-bot
docker compose logs -f planner-bot
```

In the logs you should see something like:
```
INFO:root:planner-bot starting
... (no error stack)
```

Press Ctrl+C to detach (the container keeps running with `restart: always`).

---

## 12. Smoke test in Telegram

Open Telegram, find your bot (`@personal_planner_log_bot` or whatever you named it), and send `/start`.

Expected reply (from your numeric chat_id):
```
Бот личный. Доступа нет.
```

This is the **correct** Phase A response: the bot is running, but no `Users` row exists for your `chat_id` yet (NocoDB tables aren't created until Phase B's seed step). Seeing this message means **infra is fully wired**.

If you see no response and the bot logs an exception (`KeyError: 'users_repo'`), that's because `bot_data["users_repo"]` is unwired — this is expected for Phase A and will be fixed in Phase B Task 8 (`NocoDBClient`) and Task 34 (`_wire_bot_data`). For now, we just want the polling connection itself to work.

---

## 13. Phase A complete

If `/start` triggered any reply (even the "Доступа нет" one) OR the logs show clean polling without crash, Phase A deploy is verified. ✅

If the bot errors on missing `users_repo` (because Phase A's `bot.py` only registers the handler but no wiring yet), that's expected — Phase B will introduce real wiring.

Stop the container until Phase B is ready:
```bash
docker compose stop planner-bot
```

---

## 14. Reporting back

Take a screenshot of:
- `docker compose ps planner-bot` (showing it ran)
- `docker compose logs planner-bot --tail=20` (last log lines)
- Your `/start` reply in Telegram (if any)

Send those when you're back at the keyboard. If something fails, paste the error.

---

## Known limitations of Phase A deploy

These are expected — they're handled in Phase B–G:

- **`/start` always replies "Доступа нет"** — no Users seed yet, no NocoDB wiring. Phase B Tasks 7–8 fix this.
- **No inbox capture** — Phase B Task 12 (text/url) and Phase D (voice/photo/file).
- **No commands beyond `/start`** — Phase F.
- **No cron / digests** — Phase G.
- **No `users_repo` binding** — Phase F Task 34 wires `bot_data` end-to-end.

Phase A's only purpose: prove the infra works. Once verified, Phase B can build with confidence.
