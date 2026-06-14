# Гейт 1 v2 — Playwright-контракт + слой предотвращения: План сборки

> **Заменяет** [gate1 v1](2026-06-14-gate1-contract-writer.md) (греп `data-ecode` мёртв, YAML инертен).
> Дизайн: [конвейер v2](../спеки/2026-06-14-конвейер-v2-playwright-design.md).
> **For agentic workers:** используй superpowers:test-driven-development. Шаги — чекбоксы `- [ ]`.

**Goal:** Поставить фундамент конвейера верности: (1) слой предотвращения (stylelint/eslint бан сырого hex) + (2) Playwright-скелет + (3) первый исполняемый контракт на T2 (Календарь-неделя) как золотой пример.

**Tech Stack:** stylelint + stylelint-declaration-strict-value, eslint, @playwright/test (webkit+chromium), Vite preview-сервер, существующий `theme.css`.

---

## Контекст для исполнителя (читай до старта)

- Стек: React 18 + Vite 5 + TS, @dnd-kit, Telegram Mini App. Тесты: vitest (есть), Playwright (ставим).
- Токены УЖЕ есть: `planner-v2/frontend/src/theme.css` — `--bg #0F0F11`, `--accent #ee8a3c`, `--danger #ff5c5c`, `--warning #ffb02e`, `--surface`, `--border`, `--radius`, `--font`, `--font-mono`.
- Сырой hex течёт в 8 файлах вне theme.css (дубли токенов `#ee8a3c`/`#ff5c5c`/`#ffb02e` + палитра проектов `#3FB68B`/`#5B8DEF`/`#9B6BE0` = data-цвета, легитимны).
- Мокап T2: `база-проекта-v3/pages/T2a-calendar-week.html`. Бейджи: `<span class="ecode">A1</span>`, коды A1–A8, суффиксы `·T1`/`·DETAIL` = кросс-ссылки (отрезать по `·`). Всего 8 ecode.
- Preview-паттерн: `frontend/preview-<x>-mock.html` (entry, грузит `/src/preview-<x>-mock.tsx`) + `.tsx` (импорт `theme.css`, мок `window.fetch`, рендер компонента). Примеры: t1, today, tracking.
- preview-t2 НЕТ — собрать.
- Слепая зона: baseline визуала утверждает человек; **агенту запрещено** `playwright --update-snapshots`/`-u`.

---

## Часть A — Слой предотвращения (источник дрейфа)

### Task A1: Поставить и настроить stylelint
**Files:** Create `frontend/.stylelintrc.json`, modify `frontend/package.json`

- [ ] Поставить: `cd frontend && npm i -D stylelint stylelint-config-standard stylelint-declaration-strict-value`
- [ ] `.stylelintrc.json`: `declaration-strict-value` на `["/color/","fill","stroke"]` (требовать `var()`), `color-no-hex: true`. Игнор: `theme.css`. Для палитры проектов — либо вынести в `--project-*` в theme.css, либо `disableFix`-allowlist.
- [ ] Скрипт `"lint:css": "stylelint 'src/**/*.css'"` в package.json.
- [ ] Run: `npm run lint:css` — увидеть текущие нарушения (8 файлов). Зафиксировать список.
- [ ] Commit: `chore(lint): add stylelint with token enforcement`

### Task A2: Дочистить сырой hex → var()
**Files:** 8 файлов с сырым hex (из `grep -rlE '#[0-9A-Fa-f]{6}' src --include='*.tsx' --include='*.css' | grep -v theme.css`)

- [ ] Дубли токенов (`#ee8a3c`→`var(--accent)`, `#ff5c5c`→`var(--danger)`, `#ffb02e`→`var(--warning)`, `#fff`→`var(--accent-contrast)`/`--text`) — заменить.
- [ ] Палитра проектов (`#3FB68B` и пр.) — вынести в `theme.css` как `--project-green` и т.д. ИЛИ оставить в allowlist (решить: это семантика данных, не хром).
- [ ] Run: `npm run lint:css` → 0 ошибок (кроме осознанного allowlist).
- [ ] Визуально открыть `npm run dev` — убедиться что цвета не поехали (замена var должна быть 1:1).
- [ ] Commit: `refactor(theme): replace raw hex with tokens`

### Task A3: ESLint бан hex-литералов в TSX
**Files:** modify `frontend/eslint.config.*`

- [ ] Добавить `no-restricted-syntax` на строковые литералы вида `/#[0-9a-fA-F]{3,6}/` в inline-стилях. (Если eslint не настроен — пропустить, stylelint покрывает CSS; зафиксировать как открытый пункт.)
- [ ] Commit: `chore(lint): ban hex literals in tsx inline styles`

---

## Часть B — Playwright-скелет

### Task B1: Поставить Playwright
**Files:** Create `frontend/playwright.config.ts`, modify `package.json`

- [ ] `cd frontend && npm i -D @playwright/test && npx playwright install webkit chromium`
- [ ] `playwright.config.ts`: `use: { viewport: {width:390,height:844} }`, проекты webkit+chromium, `webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true }`, `testDir: './tests-e2e'`, `snapshotDir`.
- [ ] Скрипты: `"e2e": "playwright test"`, `"e2e:report": "playwright show-report"`. **НЕ добавлять** скрипт с `--update-snapshots` (человек запускает руками при утверждении baseline).
- [ ] Commit: `chore(e2e): add playwright config (390x844, webkit+chromium)`

### Task B2: Застабить Telegram WebApp
**Files:** Create `frontend/tests-e2e/_telegram-stub.ts`

- [ ] Хелпер: `page.addInitScript` ставит `window.Telegram.WebApp` (initData, themeParams, ready/expand no-op, showConfirm→true). Чтобы preview/прод не зависели от живого Telegram-клиента.
- [ ] Smoke: `tests-e2e/smoke.spec.ts` — открыть preview-t1, ассерт `#root` не пуст. `npm run e2e` зелёный.
- [ ] Commit: `test(e2e): telegram webapp stub + smoke`

---

## Часть C — Гейт 1 на T2 (золотой пример)

### Task C1: Собрать preview-t2
**Files:** Create `frontend/preview-t2-mock.html` + `frontend/src/preview-t2-mock.tsx`

- [ ] По паттерну t1: html-entry + tsx (импорт theme.css, мок `window.fetch` на `/api/tasks` с задачами недели c проектами/цветами/приоритетами, рендер компонента календаря-недели).
- [ ] Мок-данные совпадают с мокапом T2a (те же блоки/время/цвета — чтобы baseline был осмысленным).
- [ ] `npm run dev` → открыть `/preview-t2-mock.html` → визуально совпало с `база-проекта-v3/pages/T2a-calendar-week.html`. **Гейт владельца:** показать, владелец ОК.
- [ ] Commit: `feat(preview): add T2 calendar-week preview`

### Task C2: Контракт T2 = tests-e2e/T2.spec.ts
**Files:** Create `frontend/tests-e2e/T2.spec.ts`

- [ ] Открой мокап, выпиши 8 ecode (A1–A8) и что каждый делает. Каждый интерактивный элемент → проставь `data-testid` в реальном компоненте (или зафиксируй существующий).
- [ ] Тесты с заголовками-критериями приёмки (покрыть behaviors из мокапа):
  - `test("задачу можно перетащить по таймлайну недели")` — `dragTo`.
  - `test("блок прилипает к 15-мин сетке при отпускании")`.
  - `test("цвет блока = цвет его проекта, не ember")` — `toHaveCSS('background-color', ...)` (тонкий токен-смоук).
  - `test("свайп листает недели, заголовок дат обновился")`.
  - `test("новое время переживает refresh")` — действие → `page.reload()` → ассерт.
  - `test("empty/loading/error состояния рендерятся")` (мок соответствующих ответов).
  - `test("визуал недели совпадает с baseline")` — `toHaveScreenshot('T2-week.png')`.
- [ ] Первый прогон создаст baseline (`npx playwright test --update-snapshots` запускает **владелец/человек**, не агент). Владелец глазами подтверждает скрин = мокап → коммитит baseline.
- [ ] `npm run e2e` зелёный (после утверждения baseline).
- [ ] Commit: `test(e2e): T2 calendar-week contract (golden example)` (+ baseline PNG отдельным human-коммитом).

### Task C3: coverage.sh — греп исправлен
**Files:** Create `контекст/контракты/coverage.sh`

- [ ] Скрипт: извлечь коды из мокапа — `grep -oE '<span class="ecode[^"]*">[^<]*</span>' "$mockup" | sed -E 's/<[^>]+>//g; s/·.*//' | sort -u` (текст .ecode, отрезать суффикс по `·`).
- [ ] Для каждого кода проверить наличие `data-testid` или маркера-комментария `// ecode:A1` в spec-файле. MISSING → BLOCK.
- [ ] Run на T2: `bash coverage.sh база-проекта-v3/pages/T2a-calendar-week.html planner-v2/frontend/tests-e2e/T2.spec.ts` → `PASS: 8/8`.
- [ ] `bash -n coverage.sh` → SYNTAX_OK.
- [ ] Commit: `test(contracts): coverage script (ecode→playwright test)`

### Task C4: Вшить в TEAM.md
**Files:** Modify `planner-v2/.claude/TEAM.md`

- [ ] Фаза 1: после утверждения мокапа → собрать preview + написать `tests-e2e/<screen>.spec.ts` (контракт) + владелец сверяет заголовки тестов 1 раз.
- [ ] Фаза 0/слой: stylelint/eslint в pre-commit или CI (бан сырого hex).
- [ ] Фаза 3 (Гейт): порядок = `npm run lint:css` → vitest → `npm run e2e` (visual+behavior) → reviewer читает вердикт. reviewer не MERGE пока всё не зелёное. **Правило: агент не запускает `--update-snapshots`.**
- [ ] Деплой: тот же `e2e` против прод-URL (`PLAYWRIGHT_BASE_URL=https://planner-188-245-42-4.sslip.io`).
- [ ] Commit: `docs(team): wire playwright fidelity gate into phases`

---

## Definition of Done (Гейт 1 v2)

- [ ] stylelint банит сырой hex; `npm run lint:css` = 0 (кроме allowlist); сырой hex дочищен → var().
- [ ] Playwright стоит, конфиг 390×844 webkit+chromium, Telegram застаблен, smoke зелёный.
- [ ] preview-t2 собран, визуально = мокап, владелец ОК.
- [ ] `tests-e2e/T2.spec.ts` покрывает behaviors+flows+persist+visual baseline; `npm run e2e` зелёный.
- [ ] `coverage.sh` (греп исправлен) даёт PASS 8/8 на T2.
- [ ] Гейт вшит в TEAM.md; правило «агент не обновляет baseline» зафиксировано.

## Что НЕ входит (следующие фазы)

- Контракты остальных экранов (T1/T3/T4/T5/DETAIL/INBOX) — по мере сборки.
- Деплой-гейт против прода — отдельный прогон (конфиг уже готов).
- Чужая модель-судья (резерв) — если самопроверки мало.
