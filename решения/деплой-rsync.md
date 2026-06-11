---
name: деплой-rsync
type: decision
---

# деплой-rsync

## Решение
git remote нет → деплой = rsync на Hetzner (`planner-188-245-42-4.sslip.io`), Caddy→planner-api:8000.
## Почему
Solo, $0-инфра. Визуальная проверка после деплоя обязательна (не верить хэшу).
## Связи
[[feedback]] · `planner-v2/Caddyfile` · [[project-state]]
