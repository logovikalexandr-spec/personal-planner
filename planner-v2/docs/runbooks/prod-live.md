# Planner v2 — Prod (live)

Деплой MVP (Phase 0-2) на Hetzner VPS 188.245.42.4. Без emoji.

## Что развёрнуто
- Стек planner-v2 (prod compose) в `/root/planner-v2-src/planner-v2` (git worktree ветки planner-v2-phase0).
- Контейнеры: planner-postgres, planner-redis, planner-api, planner-bot. planner-migrate отрабатывает один раз (alembic upgrade head -> таблицы + сид Inbox).
- planner-caddy НЕ запускается (gated профилем standalone-caddy). HTTPS отдаёт общий ledger-caddy.
- Бот: переиспользован токен v1 (тот же бот). v1 pp-bot ОСТАНОВЛЕН (token конфликтовал бы при polling).
- `.env` на VPS: `/root/planner-v2-src/planner-v2/.env` (TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_ID из v1 ADMIN_CHAT_ID, POSTGRES_PASSWORD, ANTHROPIC_API_KEY).

## HTTPS
- Хост: `https://planner.188.245.42.4.nip.io` (nip.io, т.к. sslip.io упёрся в Let's Encrypt rate limit 429).
- Mini App: `https://planner.188.245.42.4.nip.io/app/`
- API: `https://planner.188.245.42.4.nip.io/api/...`
- Кнопка Mini App у бота установлена через setChatMenuButton на `/app/`.

## Как ledger-caddy маршрутизирует planner (ВАЖНЫЙ НЮАНС)
- В `/root/ledger/Caddyfile` добавлен site-блок `planner.188.245.42.4.nip.io -> reverse_proxy planner-api:8000`. Бэкап: `/root/ledger/Caddyfile.bak-prephase`.
- `ledger-caddy` подключён к сети planner вручную: `docker network connect planner-v2_planner_net ledger-caddy`.
- ХРУПКОСТЬ: если ledger-caddy будет пересоздан (redeploy ledger через compose), это подключение к сети planner ПОТЕРЯЕТСЯ и planner перестанет отдаваться. Тогда повторить:
  `docker network connect planner-v2_planner_net ledger-caddy`
  (Caddyfile-блок переживает рестарт, т.к. это host-файл; теряется только network attach.)
- Долговременный фикс (на будущее): прикрепить planner-api к внешней сети ledger_ledger_net в planner prod compose, тогда ручной connect не нужен.

## Операции
- Логи: `docker logs planner-bot`, `docker logs planner-api`.
- Рестарт: `cd /root/planner-v2-src/planner-v2 && docker compose -f docker-compose.prod.yml restart`.
- Обновить код: `cd /root/planner-v2-src && git pull --ff-only && cd planner-v2 && docker compose -f docker-compose.prod.yml up -d --build`.
- Откат бота к v1: `docker start pp-bot` ПОСЛЕ остановки planner-bot (иначе конфликт токена): `docker stop planner-bot && docker start pp-bot`.

## Что НЕ сделано (следующие фазы)
- LLM/AI-копайлот (ANTHROPIC_API_KEY уже в .env, но код Phase 4 ещё не написан).
- Цели/привычки/заметки экраны (Phase 3), календарь-drag, экосистема Claude Code (Phase 5).
- Долговременный фикс сети caddy (см. выше).
