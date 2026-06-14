# Гейт 1 — contract-writer: План сборки

> ⛔ **УСТАРЕЛО (2026-06-14, профи-аудит).** Заменено: [gate1 v2 — Playwright](2026-06-14-gate1-playwright-v2.md). Дыры этого плана: `check-coverage.sh` грепает `data-ecode=` (реально `class="ecode"`, код=текст) → мёртв; YAML-контракт инертен (ничего не запускает). Файл = история.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать Гейт 1 — агент `contract-writer`, который из утверждённого мокапа делает явный проверяемый КОНТРАКТ экрана (линейку), и встроить его в Фазу 1 agent-team.

**Architecture:** Три артефакта-документа + одна правка. (1) Схема контракта — формат и правила. (2) Промпт агента `contract-writer`. (3) Первый рабочий контракт T2 (Календарь) как золотой пример, проверенный на полноту против реального HTML-мокапа. (4) Вшивка шага в TEAM.md. Контракт становится источником истины для гейтов 2/4/5/6.

**Tech Stack:** Markdown (документы-артефакты), YAML-frontmatter (формат контракта), bash+grep (проверки полноты), HTML-мокапы (`база-проекта-v3/pages/`).

---

## Контекст для исполнителя (читай до старта)

- Дизайн: [конвейер](../спеки/2026-06-14-конвейер-замысел-в-продукт-design.md). Гейт 1 = «мокап → контракт».
- Мокапы V3: `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/база-проекта-v3/pages/*.html`. В HTML вшиты бейджи: класс `fcode` (фрейм) и `ecode` (интерактивный элемент). Реестр адресов: `контекст/реестр-мокапов.md`.
- DESIGN.md: `planner-v2/DESIGN.md` — токены (ember `#EE8A3C`, onyx `#0F0F11`, Geist, отступы кратны 4, приоритеты high `#FF5C5C` / medium `#FFB02E`, нет emoji в хроме).
- Agent-team: `planner-v2/.claude/TEAM.md` (процесс/гейты), агенты в `planner-v2/.claude/agents/*.md`.
- Принцип контракта: каждая фича/состояние/флоу/токен из мокапа = отдельный проверяемый пункт. «Definition of done».

## File Structure

- Create: `контекст/контракты/_SCHEMA.md` — формат контракта + правила заполнения. Одна ответственность: эталон формата.
- Create: `planner-v2/.claude/agents/contract-writer.md` — промпт агента. Одна ответственность: мокап → контракт.
- Create: `контекст/контракты/T2-calendar-week.md` — первый рабочий контракт (золотой пример).
- Create: `контекст/контракты/check-coverage.sh` — скрипт проверки полноты (каждый `ecode` мокапа покрыт контрактом).
- Modify: `planner-v2/.claude/TEAM.md` — добавить шаг Гейт 1 в Фазу 1.

---

### Task 1: Схема контракта

**Files:**
- Create: `контекст/контракты/_SCHEMA.md`

- [ ] **Step 1: Написать файл схемы**

Создать `контекст/контракты/_SCHEMA.md` с точным содержимым:

````markdown
# Схема контракта экрана

Контракт = «линейка»: что экран ДОЛЖЕН делать, как выглядеть, какие состояния и флоу.
Один файл на экран: `контекст/контракты/<screen-id>.md`. Источник истины для гейтов 2/4/5/6.

## Формат

```yaml
screen: <screen-id>            # напр. T2-calendar-week
mockup: <путь к HTML-мокапу>   # напр. база-проекта-v3/pages/T2a-calendar-week.html
approved_at: <YYYY-MM-DD>

behaviors:                     # ЧТО РАБОТАЕТ (проверяет Гейт 5)
  - id: <kebab-id>
    truth: "<наблюдаемая правда с точки зрения пользователя>"

visual:                        # КАК ВЫГЛЯДИТ (проверяет Гейт 4)
  - element: "<css-селектор>"
    tokens: { <свойство>: "<ожидаемое значение из DESIGN.md>" }
  - rule: "<правило, если без конкретного селектора>"

states:                        # СОСТОЯНИЯ (проверяют Гейт 4 + 5)
  - empty: "<что показать когда пусто>"
  - loading: "<скелетон, не спиннер>"
  - error: "<сообщение + ретрай>"

flows:                         # СКВОЗНЫЕ СЦЕНАРИИ (проверяет Гейт 5)
  - "<шаг → шаг → ожидаемый результат, включая persist после refresh>"

elements_covered:              # для проверки полноты: какие ecode мокапа покрыты
  - <ecode>                    # напр. A4, B2
```

## Правила заполнения

1. **Полнота.** Каждый интерактивный элемент мокапа (бейдж `ecode`) → минимум один пункт `behaviors` или `visual`. Список покрытых — в `elements_covered`.
2. **Наблюдаемость.** `truth` — с точки зрения пользователя («задача прилипает к 15-мин сетке»), не реализации («функция snapToGrid вызвана»).
3. **Токены — из DESIGN.md.** Никаких «примерно». Конкретные значения: цвет/шрифт/радиус/отступ.
4. **Все три состояния** (empty/loading/error) обязательны, если экран грузит данные.
5. **persist в флоу.** Если действие меняет данные — флоу обязан проверить, что после refresh изменение осталось.
6. **Неясность = флаг.** Если мокап не отвечает «как должно быть» — пункт помечается `# FLAG: вопрос владельцу`, не выдумывается.
````

- [ ] **Step 2: Проверить структуру**

Run: `grep -E '^(behaviors|visual|states|flows|elements_covered):' "контекст/контракты/_SCHEMA.md" | wc -l`
Expected: `5` (все пять секций описаны).

- [ ] **Step 3: Commit**

```bash
git add контекст/контракты/_SCHEMA.md
git commit -m "docs(contracts): add contract schema for gate 1"
```

---

### Task 2: Промпт агента contract-writer

**Files:**
- Create: `planner-v2/.claude/agents/contract-writer.md`

- [ ] **Step 1: Написать промпт агента**

Создать `planner-v2/.claude/agents/contract-writer.md` с содержимым:

````markdown
---
name: contract-writer
description: Гейт 1. Из утверждённого мокапа делает проверяемый контракт экрана (линейку). Активируется в Фазе 1 после утверждения мокапа владельцем.
tools: Read, Write, Bash, Glob, Grep
---

# Роль: contract-writer (Гейт 1)

Ты переводишь утверждённый мокап в явный КОНТРАКТ — «definition of done», по которому гейты 2/4/5/6 потом сверяют код. Ты НЕ пишешь код и НЕ судишь реализацию. Ты фиксируешь «что хотел владелец» в проверяемую форму.

## Вход
- Путь к HTML-мокапу (напр. `база-проекта-v3/pages/T2a-calendar-week.html`).
- Опц.: спека разведки от product-depth (флоу/состояния/edge-кейсы).

## Процесс
1. Прочитай схему: `контекст/контракты/_SCHEMA.md`. Следуй формату и правилам строго.
2. Прочитай HTML-мокап целиком.
3. Извлеки ВСЕ интерактивные элементы: `Grep` по классам `ecode` и `fcode` в мокапе → список кодов.
4. Прочитай `planner-v2/DESIGN.md` — взять конкретные токены для секции `visual`.
5. Заполни контракт по схеме:
   - `behaviors` — что каждый элемент делает (наблюдаемая правда).
   - `visual` — токены/правила вида (из DESIGN.md, конкретные значения).
   - `states` — empty/loading/error (как в мокапе; если состояний нет в мокапе — FLAG).
   - `flows` — сквозные сценарии из спеки разведки, с persist-проверкой.
   - `elements_covered` — каждый `ecode` из шага 3.
6. Самопроверка полноты: каждый `ecode` из шага 3 присутствует в `elements_covered` И покрыт пунктом behaviors/visual. Непокрытые — добавь или пометь `# FLAG`.

## Выход
Файл `контекст/контракты/<screen-id>.md` строго по схеме. В конце — короткий список `# FLAG`-вопросов владельцу (что мокап не прояснил).

## Правило
Не выдумывай поведение, которого нет в мокапе/спеке. Неясность → FLAG, не догадка. Полнота важнее краткости: лучше лишний проверяемый пункт, чем дыра.
````

- [ ] **Step 2: Проверить промпт**

Run: `grep -E 'ecode|_SCHEMA.md|DESIGN.md|elements_covered|FLAG' "planner-v2/.claude/agents/contract-writer.md" | wc -l`
Expected: `≥5` (промпт ссылается на схему, DESIGN, извлечение ecode, покрытие и флаги).

- [ ] **Step 3: Commit**

```bash
git add planner-v2/.claude/agents/contract-writer.md
git commit -m "feat(agents): add contract-writer agent for gate 1"
```

---

### Task 3: Скрипт проверки полноты

**Files:**
- Create: `контекст/контракты/check-coverage.sh`

- [ ] **Step 1: Написать скрипт**

Создать `контекст/контракты/check-coverage.sh`:

```bash
#!/usr/bin/env bash
# Проверка полноты контракта: каждый ecode мокапа покрыт в контракте.
# Usage: bash check-coverage.sh <mockup.html> <contract.md>
set -euo pipefail
mockup="$1"; contract="$2"
[ -f "$mockup" ] || { echo "MOCKUP NOT FOUND: $mockup"; exit 2; }
[ -f "$contract" ] || { echo "CONTRACT NOT FOUND: $contract"; exit 2; }

# ecode-бейджи вшиты как class="... ecode ..." с текстом кода рядом (data-ecode или содержимое .ecode)
codes=$(grep -oE 'data-ecode="[A-Z][0-9]+"' "$mockup" | grep -oE '[A-Z][0-9]+' | sort -u)
[ -n "$codes" ] || { echo "WARN: в мокапе не найдено data-ecode — проверь разметку бейджей"; exit 3; }

missing=0
for c in $codes; do
  if ! grep -qE "(^|[^A-Z])$c([^0-9]|$)" "$contract"; then
    echo "MISSING: $c не покрыт в контракте"
    missing=$((missing+1))
  fi
done
if [ "$missing" -eq 0 ]; then echo "PASS: все $(echo "$codes" | wc -w | tr -d ' ') ecode покрыты"; else echo "BLOCK: $missing непокрытых"; exit 1; fi
```

Примечание исполнителю: если бейджи в мокапах размечены не через `data-ecode`, а иначе (проверь реальный HTML в `база-проекта-v3/pages/` и `контекст/реестр-мокапов.md`) — поправь grep-паттерн извлечения `codes` под фактическую разметку. Логика покрытия не меняется.

- [ ] **Step 2: Проверить синтаксис скрипта**

Run: `bash -n "контекст/контракты/check-coverage.sh" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Commit**

```bash
git add контекст/контракты/check-coverage.sh
git commit -m "test(contracts): add coverage check script for gate 1"
```

---

### Task 4: Первый рабочий контракт T2 (золотой пример)

**Files:**
- Create: `контекст/контракты/T2-calendar-week.md`

- [ ] **Step 1: Снять элементы мокапа**

Run: `grep -oE 'data-ecode="[A-Z][0-9]+"' "база-проекта-v3/pages/T2a-calendar-week.html" | grep -oE '[A-Z][0-9]+' | sort -u`
Expected: список кодов (напр. `A1 A2 A3 B1 ...`). Если паттерн не сработал — открой HTML, найди как размечены бейджи (класс `ecode`), подстрой grep. Зафиксируй фактический список для следующего шага.

- [ ] **Step 2: Запустить агент contract-writer на T2**

Через Task tool вызови агента `contract-writer` с входом:
- mockup: `база-проекта-v3/pages/T2a-calendar-week.html`
- спека разведки: найди в `контекст/forks-mockups-2026-06-11.md` раздел T2 (если есть).

Агент пишет `контекст/контракты/T2-calendar-week.md` по схеме `_SCHEMA.md`. Минимально контракт обязан покрыть (сверь с реальным мокапом, дополни):

```yaml
screen: T2-calendar-week
mockup: база-проекта-v3/pages/T2a-calendar-week.html
approved_at: 2026-06-14

behaviors:
  - id: drag-task
    truth: "задачу можно перетащить по таймлайну недели"
  - id: snap-15
    truth: "при отпускании блок прилипает к 15-минутной сетке"
  - id: color-project
    truth: "цвет блока соответствует цвету его проекта"
  - id: swipe-week
    truth: "горизонтальный свайп листает недели вперёд/назад"
  - id: persist-move
    truth: "новое время задачи сохраняется и переживает refresh"

visual:
  - element: ".time-block"
    tokens: { borderRadius: "8px", fontFamily: "Geist" }
  - rule: "фон .time-block = тинт цвета проекта, НЕ ember"
  - rule: "ember #EE8A3C только на активном табе и primary-кнопке"
  - rule: "приоритет high — кант #FF5C5C; medium — #FFB02E"
  - rule: "фон экрана #0F0F11 (onyx), не #000000"
  - rule: "нет emoji в хроме (иконки = SVG)"

states:
  - empty: "нет задач в неделе → скелетон-заглушка, не пустой экран"
  - loading: "скелетон строк, не круглый спиннер"
  - error: "сообщение + кнопка ретрай"

flows:
  - "открыл неделю → перетащил задачу на четверг 14:15 → блок встал на 14:15 → refresh → задача всё ещё на 14:15"
  - "свайп влево → показана следующая неделя → заголовок диапазона дат обновился"

elements_covered:
  - A1  # (замени на фактические ecode из Step 1)
```

- [ ] **Step 3: Проверить полноту**

Run: `bash "контекст/контракты/check-coverage.sh" "база-проекта-v3/pages/T2a-calendar-week.html" "контекст/контракты/T2-calendar-week.md"`
Expected: `PASS: все N ecode покрыты`. Если `BLOCK` — дополни контракт непокрытыми элементами, повтори.

- [ ] **Step 4: Гейт владельца**

Покажи владельцу список `behaviors` + `# FLAG`-вопросы. Владелец подтверждает «да, это всё, что я хотел в T2» или дополняет. Внеси правки. Это единственная ручная сверка линейки.

- [ ] **Step 5: Commit**

```bash
git add контекст/контракты/T2-calendar-week.md
git commit -m "docs(contracts): add T2 calendar-week contract (golden example)"
```

---

### Task 5: Вшить Гейт 1 в TEAM.md

**Files:**
- Modify: `planner-v2/.claude/TEAM.md`

- [ ] **Step 1: Найти секцию Фазы 1**

Run: `grep -n -iE 'фаза 1|разведк|product-depth' "planner-v2/.claude/TEAM.md"`
Expected: номера строк секции Фазы 1 (Разведка). Прочитай её (`Read` с offset).

- [ ] **Step 2: Добавить шаг Гейт 1**

В конец описания Фазы 1 (после утверждения мокапа владельцем, перед Фазой 2) вставить блок:

```markdown
**Гейт 1 — КОНТРАКТ (после утверждения мокапа):**
- Агент `contract-writer` читает утверждённый мокап + спеку разведки → пишет `контекст/контракты/<screen>.md` по `контекст/контракты/_SCHEMA.md`.
- Проверка полноты: `bash контекст/контракты/check-coverage.sh <mockup> <contract>` → PASS обязателен.
- Владелец сверяет `behaviors` + FLAG-вопросы один раз («это всё, что я хотел?»).
- Контракт = источник истины. Гейты 2 (план), 4 (визуал), 5 (поведение), 6 (деплой) сверяют С НИМ, а не с мокапом «на глаз».
- Без утверждённого контракта Фаза 2 не начинается.
```

- [ ] **Step 3: Проверить вставку**

Run: `grep -c 'Гейт 1 — КОНТРАКТ' "planner-v2/.claude/TEAM.md"`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add planner-v2/.claude/TEAM.md
git commit -m "docs(team): wire gate 1 (contract) into phase 1"
```

---

## Definition of Done (Гейт 1)

- [ ] `_SCHEMA.md` описывает формат контракта (5 секций + правила).
- [ ] Агент `contract-writer` создан, ссылается на схему/DESIGN/полноту/флаги.
- [ ] `check-coverage.sh` проверяет покрытие ecode, синтаксис ок.
- [ ] Контракт `T2-calendar-week.md` существует, проходит check-coverage PASS, утверждён владельцем.
- [ ] Гейт 1 вшит в TEAM.md Фаза 1; Фаза 2 требует утверждённый контракт.

## Что НЕ входит (следующие фазы конвейера)

- Гейт 4 visual-verifier (своя спека уже есть) — следующий кирпич.
- Гейты 5 (behavior), 6 (deploy), 2 (plan-checker) — отдельные планы.
- Контракты остальных экранов (T1/T3/T4/T5/DETAIL/INBOX) — по мере сборки каждого.
