# Task.impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить задаче поле «вклад в успех» (`impact` 0–100|null), записываемое интерактивным Claude через write-API, и показать токен `NN%` в UI по правилу видимости.

**Architecture:** Бэкенд — тупой трекер (ZERO-AFK): новое nullable-поле `Task.impact`, отдаётся в `TaskOut`, ставится через `PATCH /api/tasks/{id}`. Фронт — чистая функция-правило `shouldShowImpact` + рендер моно-токена в мете строки. Без LLM в бэке.

**Tech Stack:** Python 3.12 · SQLAlchemy 2 · Alembic · FastAPI · pytest (SQLite conftest) · React 18 · TS · vitest.

Спека: `docs/superpowers/specs/2026-06-11-task-impact-vklad-design.md` (в `personal-planner/`).

---

### Task 1: Поле `Task.impact` в модели

**Files:**
- Modify: `src/planner/db/models.py` (class Task, после `stage_id`)

- [ ] **Step 1: Добавить колонку**

В `class Task(Base)` после блока `stage_id`:
```python
    impact: Mapped[int | None] = mapped_column(Integer, default=None)  # вклад в успех 0-100, пишет Claude (ZERO-AFK)
```

- [ ] **Step 2: Commit**

```bash
git add src/planner/db/models.py
git commit -m "feat(planner-v2): Task.impact колонка (вклад в успех)"
```

---

### Task 2: Сериализация в TaskOut + приём в TaskPatch

**Files:**
- Modify: `src/planner/api/schemas.py` (TaskOut ~line 50, TaskPatch ~line 70)
- Modify: `src/planner/api/routes/tasks.py` (`_TASK_FIELDS` ~line 22)
- Test: `tests/test_task_impact.py`

- [ ] **Step 1: Написать падающий тест**

Create `tests/test_task_impact.py`:
```python
import pytest
from httpx import AsyncClient


async def _make_task(client: AsyncClient, **kw) -> dict:
    r = await client.post("/api/tasks", json={"title": "T", **kw})
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.mark.asyncio
async def test_impact_defaults_null_and_roundtrips(client: AsyncClient):
    t = await _make_task(client)
    assert t["impact"] is None
    r = await client.patch(f"/api/tasks/{t['id']}", json={"impact": 80})
    assert r.status_code == 200, r.text
    assert r.json()["task"]["impact"] == 80
    # повторное чтение
    g = await client.get(f"/api/tasks/{t['id']}")
    assert g.json()["impact"] == 80


@pytest.mark.asyncio
async def test_impact_clear_to_null(client: AsyncClient):
    t = await _make_task(client)
    await client.patch(f"/api/tasks/{t['id']}", json={"impact": 50})
    r = await client.patch(f"/api/tasks/{t['id']}", json={"impact": None})
    assert r.status_code == 200, r.text
    assert r.json()["task"]["impact"] is None
```
(Проверить фикстуру `client` в `tests/conftest.py` — использовать её имя; если фикстура иная, подставить.)

- [ ] **Step 2: Запустить — упадёт**

Run: `.venv/bin/python -m pytest tests/test_task_impact.py -q`
Expected: FAIL (`impact` нет в ответе / KeyError).

- [ ] **Step 3: Добавить поле в схемы**

В `schemas.py` `class TaskOut` после `stage_id: int | None = None`:
```python
    impact: int | None = None
```
В `class TaskPatch` после `progress: int | None = None`:
```python
    impact: int | None = None
```

- [ ] **Step 4: Разрешить поле в PATCH**

В `routes/tasks.py` `_TASK_FIELDS` добавить `"impact"`:
```python
_TASK_FIELDS = (
    "title", "priority", "project_id", "due_date", "due_time", "end_time",
    "description", "reminder_at", "recurrence", "recurrence_json", "progress",
    "pinned", "parent_task_id", "impact",
)
```
ВНИМАНИЕ к null: PATCH должен уметь СБРОСИТЬ impact в null. Проверить как `patch_task` применяет поля — если использует `payload.model_dump(exclude_unset=True)`, то явный `{"impact": null}` приходит как заданный → ок. Если фильтрует None глобально — поправить, чтобы `impact` мог стать null при явной передаче. (Прочитать `patch_task` тело перед правкой.)

- [ ] **Step 5: Запустить — пройдёт**

Run: `.venv/bin/python -m pytest tests/test_task_impact.py -q`
Expected: PASS (2 passed).

- [ ] **Step 6: Прогнать весь бэкенд (регрессия)**

Run: `.venv/bin/python -m pytest -q`
Expected: 134+2 = 136 passed.

- [ ] **Step 7: Commit**

```bash
git add src/planner/api/schemas.py src/planner/api/routes/tasks.py tests/test_task_impact.py
git commit -m "feat(planner-v2): impact в TaskOut/TaskPatch + PATCH-приём + тесты"
```

---

### Task 3: Alembic-миграция `task.impact`

**Files:**
- Create: `alembic/versions/<rev>_task_impact.py` (через autogenerate или вручную, down_revision = текущий head `e5f6a7b8c9d0`)

- [ ] **Step 1: Сгенерировать ревизию**

Run: `.venv/bin/python -m alembic revision -m "task_impact"`
(Создаст файл с пустыми upgrade/downgrade.)

- [ ] **Step 2: Заполнить up/down**

В новом файле:
```python
def upgrade() -> None:
    op.add_column("task", sa.Column("impact", sa.Integer(), nullable=True))

def downgrade() -> None:
    op.drop_column("task", "impact")
```
Проверить `down_revision = "e5f6a7b8c9d0"` (head Форка 0).

- [ ] **Step 3: Проверить линейность (один head)**

Run: `.venv/bin/python -m alembic heads`
Expected: один head = новая ревизия.

- [ ] **Step 4: Round-trip на живом PG (если docker доступен)**

Поднять временный PG, прогнать `alembic upgrade head` → `downgrade -1` → `upgrade head`. Если docker недоступен — пометить в коммите «round-trip отложен до деплоя», тесты идут на SQLite-conftest (создаёт схему из моделей, миграцию не применяет → поле уже в модели, тесты валидны).

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/
git commit -m "feat(planner-v2): миграция task.impact"
```

---

### Task 4: Фронт — тип + правило видимости (чистая функция, vitest)

**Files:**
- Modify: `frontend/src/types.ts` (interface Task — добавить impact)
- Create: `frontend/src/lib/impact.ts`
- Test: `frontend/src/lib/impact.test.ts`

- [ ] **Step 1: Тип**

В `types.ts` в `interface Task` рядом с `stage_id`:
```ts
  impact?: number | null;   // вклад в успех 0-100, пишет Claude
```

- [ ] **Step 2: Падающий тест**

Create `frontend/src/lib/impact.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldShowImpact, IMPACT_THRESHOLD } from "./impact";
import type { Task } from "../types";

const base = (o: Partial<Task>): Task => ({ id: 1, title: "t", status: "todo", priority: "none", ...o } as Task);

describe("shouldShowImpact", () => {
  it("скрыт без impact", () => { expect(shouldShowImpact(base({ project_id: 1 }))).toBe(false); });
  it("скрыт ниже порога", () => { expect(shouldShowImpact(base({ impact: IMPACT_THRESHOLD - 1, project_id: 1 }))).toBe(false); });
  it("скрыт без привязки к проекту/цели", () => { expect(shouldShowImpact(base({ impact: 90 }))).toBe(false); });
  it("виден при impact>=порог И привязке к проекту", () => { expect(shouldShowImpact(base({ impact: IMPACT_THRESHOLD, project_id: 3 }))).toBe(true); });
  it("виден при привязке к этапу", () => { expect(shouldShowImpact(base({ impact: 50, stage_id: 2 }))).toBe(true); });
});
```

- [ ] **Step 3: Запустить — упадёт**

Run (из `frontend/`): `npx vitest run src/lib/impact.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 4: Реализация**

Create `frontend/src/lib/impact.ts`:
```ts
import type { Task } from "../types";

export const IMPACT_THRESHOLD = 30;

/** Токен вклада виден только у заметных задач, привязанных к проекту/цели. */
export function shouldShowImpact(task: Task): boolean {
  if (task.impact == null) return false;
  if (task.impact < IMPACT_THRESHOLD) return false;
  return task.project_id != null || task.stage_id != null;
}
```

- [ ] **Step 5: Запустить — пройдёт**

Run: `npx vitest run src/lib/impact.test.ts`
Expected: PASS (5).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/impact.ts frontend/src/lib/impact.test.ts
git commit -m "feat(planner-v2): тип impact + правило видимости токена + vitest"
```

---

### Task 5: Фронт — рендер токена в строке задачи + детали

**Files:**
- Modify: `frontend/src/components/TaskItem.tsx` (мета-блок ~line 240-246)
- Modify: `frontend/src/components/DayTimeline.tsx` (мета блока-задачи)
- Modify: `frontend/src/screens/TaskDetail.tsx` (показ всегда, ниже блока проекта/этапа)
- Modify: `frontend/src/theme.css` (класс `.imp`)

- [ ] **Step 1: Стиль токена**

В `theme.css` добавить (если ещё нет; имена токенов сверить — slate/bone):
```css
.imp{color:var(--bone);background:var(--slate);border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600;font-family:"Geist Mono",monospace;display:inline-flex;align-items:center}
```

- [ ] **Step 2: TaskItem — токен в мете**

В `TaskItem.tsx`, в мета-строке (рядом с `fmtMeta(...)`), добавить условный рендер:
```tsx
{shouldShowImpact(task) && <span className="imp">{task.impact}%</span>}
```
Импорт: `import { shouldShowImpact } from "../lib/impact";`

- [ ] **Step 3: DayTimeline — токен в мете блока**

Аналогично в мете блока-задачи DayTimeline (где рендерится время/мета) — тот же условный `<span className="imp">{t.impact}%</span>` + импорт `shouldShowImpact`.

- [ ] **Step 4: TaskDetail — показ всегда**

В `TaskDetail.tsx` под блоком проекта/этапа добавить строку «Вклад в успех»:
```tsx
{task.impact != null && (
  <div className="td-row"><span className="td-lbl">Вклад в успех</span><span className="imp">{task.impact}%</span></div>
)}
```
(Класс-обёртку `.td-row/.td-lbl` сверить с существующими в TaskDetail; если иные — подставить локальные.)

- [ ] **Step 5: tsc + build чисто**

Run (из `frontend/`): `npx tsc --noEmit && npx vite build`
Expected: 0 ошибок, build ок.

- [ ] **Step 6: vitest весь фронт (регрессия)**

Run: `npx vitest run`
Expected: 30+5 = 35 passed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/TaskItem.tsx frontend/src/components/DayTimeline.tsx frontend/src/screens/TaskDetail.tsx frontend/src/theme.css
git commit -m "feat(planner-v2): рендер токена вклада в строке/таймлайне/детали"
```

---

## Итоговый гейт
- `.venv/bin/python -m pytest -q` → 136 зелёных.
- `npx vitest run` → 35 зелёных. `npx tsc --noEmit` 0. `npx vite build` ок.
- Деплой НЕ делать (нужен визуал-гейт владельца в Telegram). Оставить собранным + хэндофф.
