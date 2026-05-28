# Phase 0 deploy

## Локально (dev)
1. `cp .env.example .env`, заполнить TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_ID.
2. Поднять dev-инфру: `docker compose up -d postgres redis`.
   ВНИМАНИЕ про порты: проект ledger на этой же машине уже занимает 5432 (ledger-postgres).
   Варианты для planner dev:
   - остановить ledger-postgres на время; ИЛИ
   - в planner-v2/docker-compose.yml сменить проброс порта postgres на "5433:5432"
     и использовать DATABASE_URL ...@localhost:5433/planner.
3. Применить миграции:
   `DATABASE_URL=postgresql+asyncpg://planner:planner@localhost:5432/planner alembic upgrade head`
   (поменяй порт на 5433, если ремапнул).
4. API: `source .venv/bin/activate && uvicorn planner.api.app:app --reload`
   Бот: `source .venv/bin/activate && python -m planner.bot.main`
5. Mini App dev: `cd frontend && npm run dev` (Vite на 5173, проксирует /api на :8000).

## BotFather (привязка Mini App к боту)
1. /newbot (или взять токен v2) -> TELEGRAM_BOT_TOKEN.
2. Menu Button (Bot Settings -> Menu Button) -> URL = https://planner-<ip-через-дефисы>.sslip.io/app/
3. Узнать свой OWNER_TELEGRAM_ID (например через @userinfobot) -> в .env.

## VPS (prod)
1. На VPS: склонировать/обновить repo, положить .env (с POSTGRES_PASSWORD).
2. Caddy: ledger уже слушает 80/443 (ledger-caddy). Нельзя поднять второй caddy на тех же портах.
   Решение (предусловие деплоя): объединить в ОДИН Caddy два site-блока (ledger + planner)
   и не запускать planner-caddy отдельно; planner-api подключить в общую сеть/прокси.
   Альтернатива: один общий reverse-proxy контейнер на двоих.
3. Аналогично postgres: на VPS у planner свой контейнер planner-postgres в своей сети
   (порт наружу не пробрасывается в prod), конфликта с ledger-postgres нет.
4. Поднять: `docker compose -f docker-compose.prod.yml up -d --build`
   (если используешь общий Caddy — без planner-caddy, через профиль/override).
5. Проверить: https://planner-<ip-через-дефисы>.sslip.io/api/health -> {"status":"ok"}
6. Открыть Mini App в Telegram через menu button -> видно "Привет, <имя>".

## DoD Phase 0
- `pytest -q` зелёный.
- dev: postgres+redis healthy (с учётом порт-конфликта выше), alembic upgrade head проходит.
- /api/health отвечает; /api/me с валидной initData возвращает owner, без неё 401.
- Бот отвечает на /start владельцу, игнорит чужих.
- Mini App shell грузится по HTTPS и показывает имя владельца.

## Известные предусловия/конфликты (вынести в Phase 1+)
- Общий Caddy для ledger + planner (порты 80/443).
- Dev-порт postgres 5432 пересекается с ledger; ремап на 5433 или поочерёдный запуск.
- LLM-ключи (Groq/Gemini) нужны начиная с фазы парсинга, в Phase 0 не используются.
