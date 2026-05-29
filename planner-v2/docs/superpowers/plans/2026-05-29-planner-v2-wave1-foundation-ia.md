# Planner v2 — Волна 1: Фундамент IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить нижнюю навигацию в 5 осмысленных табов (Сегодня / Календарь / Списки / Цели / Трекинг), слить Задачи+Проекты+Drawer в один таб «Списки», сделать «Сегодня» гибридом (таймлайн + без-времени + Inbox + сводка), переиспользовав таймлайн.

**Architecture:** Frontend-тяжёлая волна (React/TS+Vite). Извлекаем переиспользуемый `DayTimeline` из `Calendar.tsx`; собираем экраны `Today` (гибрид), `Lists` (смарт-вью + дерево проектов как полноэкранный, не Drawer), `Tracking` (плейсхолдер). Перепроводка `BottomTabs` + `App.tsx`. Backend: одна маленькая добавка — scope `planned` в `list_tasks` (TDD). Календарь-таб в этой волне остаётся текущим Day-view (станет месяцем в волне 2).

**Tech Stack:** FastAPI + SQLAlchemy 2 + pytest (backend); React 18 + TS + Vite (frontend). Стиль строго по `DESIGN.md` (onyx dark, ember-акцент, Geist, без emoji в UI, SVG-иконки, скелетоны). Frontend без JS-тест-раннера → верификация = `npm run build` зелёный + QA серверный initData-smoke + визуальный ОК пользователя.

**Маппинг ролей команды:** Task 1 — backend + qa. Tasks 2-6 — designer (визуал-спека) → frontend → reviewer. Task 7 — qa + reviewer + CEO-гейт.

---

## Структура файлов

**Backend (создать/изменить):**
- Modify: `src/planner/services/tasks.py` — добавить ветку `scope == "planned"` в `list_tasks`.
- Test: `tests/test_tasks_service.py` — тест на `planned`.

**Frontend (создать):**
- Create: `frontend/src/components/DayTimeline.tsx` — переиспользуемый часовой таймлайн (извлечён из Calendar).
- Create: `frontend/src/screens/Lists.tsx` — полноэкранные смарт-вью + дерево проектов.
- Create: `frontend/src/screens/Tracking.tsx` — плейсхолдер таба Трекинг.

**Frontend (изменить):**
- Modify: `frontend/src/screens/Calendar.tsx` — использовать `DayTimeline` вместо инлайн-разметки.
- Modify: `frontend/src/screens/Today.tsx` — переписать в гибрид (таймлайн + без-времени + Inbox + сводка).
- Modify: `frontend/src/components/BottomTabs.tsx` — 5 табов: today/calendar/lists/goals/tracking.
- Modify: `frontend/src/components/icons.tsx` — добавить `IcoLists`, `IcoTracking`.
- Modify: `frontend/src/App.tsx` — роутинг 5 табов, Lists-навигация вместо Drawer-как-таб.
- Modify: `frontend/src/api.ts` — типы SmartKey не меняются здесь (planned добавим в types при необходимости в волне 2; в волне 1 scope `planned` дергается строкой).

**Удаляемое/мёртвое:** Drawer перестаёт быть табом. В волне 1 Drawer-компонент НЕ удаляем физически (может остаться как quick-switch по свайпу), но таб «Проекты» убираем. Старый путь Today=ListView("today") заменяется гибридом.

---

## Task 1: Backend — scope `planned` в list_tasks (TDD)

**Files:**
- Modify: `src/planner/services/tasks.py` (функция `list_tasks`, ветка scope после `week`)
- Test: `tests/test_tasks_service.py`

- [ ] **Step 1: Написать падающий тест**

Добавить в `tests/test_tasks_service.py`:

```python
@pytest.mark.asyncio
async def test_list_planned_returns_future_dated_open(db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.flush()
    await svc.create_task(db_session, title="сегодня", due_date=date.today())
    await svc.create_task(db_session, title="через 3 дня", due_date=date.today() + timedelta(days=3))
    await svc.create_task(db_session, title="без даты")
    planned = await svc.list_tasks(db_session, scope="planned")
    titles = [t.title for t in planned]
    assert "через 3 дня" in titles
    assert "сегодня" in titles          # сегодня и будущее = запланированные
    assert "без даты" not in titles     # без due_date не запланирована
```

- [ ] **Step 2: Прогнать тест — убедиться что падает**

Run: `python -m pytest tests/test_tasks_service.py::test_list_planned_returns_future_dated_open -v`
Expected: FAIL (scope `planned` пока ведёт себя как `all`, вернёт «без даты» тоже → assert падает).

- [ ] **Step 3: Реализовать ветку scope**

В `src/planner/services/tasks.py`, в `list_tasks`, после блока `elif scope == "week":` и до `elif scope == "inbox":` вставить:

```python
    elif scope == "planned":
        stmt = stmt.where(Task.due_date.is_not(None), Task.due_date >= date.today(), Task.status != "done")
```

- [ ] **Step 4: Прогнать тест — убедиться что проходит**

Run: `python -m pytest tests/test_tasks_service.py::test_list_planned_returns_future_dated_open -v`
Expected: PASS

- [ ] **Step 5: Прогнать весь пакет (регрессия)**

Run: `python -m pytest -q`
Expected: все зелёные (было 63 + 1 новый = 64).

- [ ] **Step 6: Commit**

```bash
git add src/planner/services/tasks.py tests/test_tasks_service.py
git commit -m "feat(planner-v2): add 'planned' task scope for Lists smart-view"
```

---

## Task 2: Frontend — извлечь переиспользуемый DayTimeline

Цель: вынести часовой таймлайн из `Calendar.tsx` в отдельный компонент, чтобы Сегодня и Календарь-день использовали один код (риск из спека: не копировать).

**Files:**
- Create: `frontend/src/components/DayTimeline.tsx`
- Modify: `frontend/src/screens/Calendar.tsx`

- [ ] **Step 1: Создать DayTimeline.tsx**

Перенести презентационную часть (часовой rail + блоки + линия «сейчас» + чипы без времени) из `Calendar.tsx`. Контракт пропсов:

```tsx
import { useEffect, useMemo, useRef } from "react";
import type { Project, Task } from "../types";

const HOUR_H = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function parseMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function hhmm(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}
function resolveColor(projectId: number | null, byId: Map<number, Project>): string | null {
  let cur = projectId != null ? byId.get(projectId) : undefined;
  let g = 0;
  while (cur && g++ < 8) { if (cur.color) return cur.color; cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined; }
  return null;
}

export function DayTimeline({
  tasks, byId, isToday, onTapHour, onToggle, autoScroll = true,
}: {
  tasks: Task[];
  byId: Map<number, Project>;
  isToday: boolean;
  onTapHour: (hour: number) => void;
  onToggle: (t: Task) => void;
  autoScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timed = useMemo(() => tasks.filter((t) => t.due_time), [tasks]);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const focusHour = isToday ? new Date().getHours() : 7;
    el.scrollTop = Math.max(0, focusHour * HOUR_H - HOUR_H);
  }, [autoScroll, isToday]);

  return (
    <div className="cal-scroll" ref={scrollRef} style={{ flex: 1 }}>
      <div className="cal-grid" style={{ height: HOURS.length * HOUR_H }}>
        {HOURS.map((h) => (
          <div key={h} className="cal-hour" style={{ height: HOUR_H }} onClick={() => onTapHour(h)}>
            <span className="cal-hourlabel">{`${h}`.padStart(2, "0")}:00</span>
          </div>
        ))}
        {isToday && <div className="cal-now" style={{ top: (nowMin / 60) * HOUR_H }} />}
        {timed.map((t) => {
          const start = parseMin(t.due_time)!;
          const endRaw = parseMin(t.end_time);
          const dur = endRaw && endRaw > start ? endRaw - start : 60;
          const c = resolveColor(t.project_id, byId);
          const proj = t.project_id != null ? byId.get(t.project_id) : undefined;
          return (
            <div
              key={t.id}
              className={`cal-block ${t.status === "done" ? "done" : ""}`}
              style={{
                top: (start / 60) * HOUR_H + 1,
                height: Math.max((dur / 60) * HOUR_H - 2, 22),
                borderLeftColor: c ?? "var(--accent)",
                background: c ? `${c}22` : "var(--surface-2)",
              }}
              onClick={(e) => { e.stopPropagation(); onToggle(t); }}
            >
              <div className="bt">{proj?.icon ? `${proj.icon} ` : ""}{t.title}</div>
              <div className="bm">
                {hhmm(start)}{endRaw && endRaw > start ? `–${hhmm(endRaw)}` : ""}
                {t.recurrence ? "  \u{1F501}" : ""}{t.reminder_at ? "  \u{23F0}" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Переключить Calendar.tsx на DayTimeline**

В `frontend/src/screens/Calendar.tsx`: удалить инлайн `cal-scroll`/`cal-grid` разметку (строки таймлайна) и `parseMin`/`hhmm`/`resolveColor`/`HOUR_H`/`HOURS`/`scrollRef`/`timed`/`nowMin` (теперь в DayTimeline). Оставить шапку (cal-head), блок `cal-allday` (чипы без времени), `addHour`-композер. Вставить вместо таймлайн-разметки:

```tsx
<DayTimeline
  tasks={timed_and_all_here_pass_full_tasks}
  byId={byId}
  isToday={isToday}
  onTapHour={(h) => setAddHour(h)}
  onToggle={toggle}
/>
```

Точно: передавать `tasks={tasks}` (DayTimeline сам фильтрует timed). Импортировать `import { DayTimeline } from "../components/DayTimeline";`. Сохранить `untimed` рендер (cal-allday) в Calendar (он над таймлайном).

- [ ] **Step 3: Сборка зелёная**

Run: `cd frontend && npm run build`
Expected: tsc+vite без ошибок. (Если `resolveColor` остался неиспользуемым в Calendar — удалить его там.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DayTimeline.tsx frontend/src/screens/Calendar.tsx
git commit -m "refactor(planner-v2): extract reusable DayTimeline from Calendar"
```

---

## Task 3: Frontend — гибрид «Сегодня»

Переписать `Today.tsx`: сводка дня + Inbox-карточка + таймлайн (DayTimeline, заперт на сегодня) + секция «Без времени».

**Files:**
- Modify: `frontend/src/screens/Today.tsx`
- (контракт пропсов согласовать с App.tsx в Task 6)

- [ ] **Step 1: Переписать Today.tsx**

```tsx
import { useEffect, useMemo, useState } from "react";
import { DayTimeline } from "../components/DayTimeline";
import { TaskItem } from "../components/TaskItem";
import { getDayTasks, getProjects, patchTask } from "../api";
import { tg } from "../telegram";
import type { Project, Task } from "../types";

const FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function resolveColor(projectId: number | null, byId: Map<number, Project>): string | null {
  let cur = projectId != null ? byId.get(projectId) : undefined;
  let g = 0;
  while (cur && g++ < 8) { if (cur.color) return cur.color; cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined; }
  return null;
}

export function Today({
  reloadKey, inboxCount, onInbox, onTapHour,
}: { reloadKey: number; inboxCount: number; onInbox: () => void; onTapHour: (hour: number) => void }) {
  const iso = localToday();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [byId, setById] = useState<Map<number, Project>>(new Map());

  async function load() {
    const [ts, ps] = await Promise.all([getDayTasks(iso), getProjects()]);
    setTasks(ts);
    setById(new Map(ps.map((p) => [p.id, p])));
  }
  useEffect(() => { load().catch(() => {}); /* eslint-disable-next-line */ }, [reloadKey]);

  async function toggle(t: Task) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    load();
  }

  const untimed = useMemo(() => tasks.filter((t) => !t.due_time), [tasks]);
  const doneCount = useMemo(() => tasks.filter((t) => t.status === "done").length, [tasks]);

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", height: "100%", paddingLeft: 0, paddingRight: 0 }}>
      <div className="screen-hero" style={{ paddingLeft: "var(--s4)", paddingRight: "var(--s4)" }}>
        <h1>Сегодня</h1>
        <div className="date">{FMT.format(new Date())}</div>
        <div className="muted" style={{ fontSize: 13 }}>{tasks.length} задач · {doneCount} закрыто</div>
      </div>

      <div className="entry-card" style={{ marginLeft: "var(--s4)", marginRight: "var(--s4)" }} onClick={onInbox}>
        <span className="lead">In</span>
        <span className="grow">Разобрать Inbox</span>
        {inboxCount > 0 && <span className="count">{inboxCount}</span>}
        <span className="chev">{"›"}</span>
      </div>

      <DayTimeline tasks={tasks} byId={byId} isToday onTapHour={onTapHour} onToggle={toggle} />

      {untimed.length > 0 && (
        <div style={{ paddingLeft: "var(--s4)", paddingRight: "var(--s4)" }}>
          <div className="section-label">Без времени</div>
          <div className="list">
            {untimed.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={toggle} color={resolveColor(t.project_id, byId)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

> Примечание layout: таймлайн (`flex:1`) скроллится, «Без времени» снизу. Если на узких экранах нужен единый скролл — designer уточняет; дефолт выше приемлем.

- [ ] **Step 2: Сборка зелёная**

Run: `cd frontend && npm run build`
Expected: ошибок нет. (App.tsx ещё не передаёт `onTapHour` — будет в Task 6; временно TS может ругаться на пропсы — допустимо до Task 6, но лучше делать Task 6 сразу после. Если собираешь изолированно — App.tsx пока импортирует старый Today; синхронизировать в Task 6.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/Today.tsx
git commit -m "feat(planner-v2): hybrid Today screen (timeline + untimed + inbox + summary)"
```

---

## Task 4: Frontend — экран «Списки»

Полноэкранный список: смарт-вью (с счётчиками) + дерево проектов. Логику переиспользуем из `Drawer.tsx` (счётчики, дерево, create/edit/menu/reorder), но как экран, а не выезжающая панель. Тап строки → `onSelect(ActiveList)` (App открывает ListView).

**Files:**
- Create: `frontend/src/screens/Lists.tsx`

- [ ] **Step 1: Создать Lists.tsx**

Скопировать тело `Drawer.tsx` БЕЗ обёртки `drawer-backdrop`/`drawer` и без свайп-onClose. Контракт:

```tsx
import { useEffect, useRef, useState } from "react";
import { createProject, deleteProject, getCounts, getProjects, patchProject, reorderProjects } from "../api";
import { IcoAll, IcoInbox, IcoNext7, IcoPlus, IcoTodaySmall, IcoTomorrow, IcoWeekPlan } from "../components/icons";
import { ProjectTree } from "../components/ProjectTree";
import { ProjectMenu } from "../components/ProjectMenu";
import { ProjectSheet, type ProjectFormValue } from "../components/ProjectSheet";
import { tg } from "../telegram";
import type { ActiveList, Counts, Project, SmartKey } from "../types";

const SMART: { key: SmartKey; title: string; Ico: () => JSX.Element }[] = [
  { key: "all", title: "Все", Ico: IcoAll },
  { key: "today", title: "Сегодня", Ico: IcoTodaySmall },
  { key: "tomorrow", title: "Завтра", Ico: IcoTomorrow },
  { key: "next7", title: "Следующие 7 дней", Ico: IcoNext7 },
  { key: "inbox", title: "Входящие", Ico: IcoInbox },
  { key: "week", title: "План на неделю", Ico: IcoWeekPlan },
];
function countFor(k: SmartKey, c: Counts | null): number {
  if (!c) return 0;
  if (k === "all") return c.all;
  if (k === "today") return c.today;
  if (k === "tomorrow") return c.tomorrow;
  if (k === "next7" || k === "week") return c.next7;
  if (k === "inbox") return c.inbox;
  return 0;
}
type SheetState = { mode: "create"; parentId: number | null } | { mode: "edit"; project: Project };

export function Lists({
  active, onSelect,
}: { active: ActiveList; onSelect: (a: ActiveList) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [menuFor, setMenuFor] = useState<Project | null>(null);
  const didInitExpand = useRef(false);

  function loadProjects() {
    getProjects().then((ps) => {
      setProjects(ps);
      if (!didInitExpand.current) {
        didInitExpand.current = true;
        const parents = new Set<number>();
        for (const p of ps) if (p.parent_id != null) parents.add(p.parent_id);
        if (parents.size) setExpanded(parents);
      }
    }).catch(() => setProjects([]));
  }
  useEffect(() => { getCounts().then(setCounts).catch(() => setCounts(null)); loadProjects(); }, []);

  const byParent = new Map<number | null, Project[]>();
  for (const p of projects) { if (p.is_inbox) continue; const k = p.parent_id; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k)!.push(p); }
  function subtreeCount(id: number): number {
    const self = projects.find((p) => p.id === id);
    let n = self?.open_count ?? 0;
    for (const ch of byParent.get(id) ?? []) n += subtreeCount(ch.id);
    return n;
  }
  function toggle(id: number) { setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  const isActiveSmart = (k: SmartKey) => active.kind === "smart" && active.key === k;
  const activeProjectId = active.kind === "project" ? active.id : null;

  async function handleSubmit(value: ProjectFormValue) {
    if (sheet?.mode === "edit") { await patchProject(sheet.project.id, value); }
    else {
      const created = await createProject(value.name, { parent_id: value.parent_id, color: value.color, icon: value.icon });
      if (created.parent_id != null) setExpanded((s) => new Set(s).add(created.parent_id!));
    }
    setSheet(null); loadProjects();
  }
  async function togglePin(p: Project) { setMenuFor(null); await patchProject(p.id, { pinned: !p.pinned }); loadProjects(); }
  function requestDelete(p: Project) {
    setMenuFor(null);
    const doDelete = async () => { await deleteProject(p.id); loadProjects(); };
    const w = tg() as { showConfirm?: (m: string, cb: (ok: boolean) => void) => void } | undefined;
    if (w?.showConfirm) w.showConfirm(`Удалить «${p.name}»? Задачи уйдут во Входящие.`, (ok) => { if (ok) doDelete(); });
    else doDelete();
  }
  async function handleReorder(items: { id: number; parent_id: number | null; order_index: number }[]) {
    const patchMap = new Map(items.map((i) => [i.id, i]));
    setProjects((prev) => prev.map((p) => { const u = patchMap.get(p.id); return u ? { ...p, parent_id: u.parent_id, order_index: u.order_index } : p; })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order_index - b.order_index || a.name.localeCompare(b.name)));
    try { await reorderProjects(items); } finally { loadProjects(); }
  }

  return (
    <div className="screen">
      <div className="screen-hero"><h1>Списки</h1></div>
      <div className="drawer-section">Смарт-списки</div>
      {SMART.map(({ key, title, Ico }) => (
        <div key={key} className={`drawer-row ${isActiveSmart(key) ? "active" : ""}`} onClick={() => onSelect({ kind: "smart", key, title })}>
          <span className="drawer-ico"><Ico /></span>
          <span className="drawer-label">{title}</span>
          {countFor(key, counts) > 0 && <span className="drawer-count">{countFor(key, counts)}</span>}
        </div>
      ))}
      <div className="drawer-sep" />
      <div className="drawer-section">Проекты</div>
      <ProjectTree
        projects={projects} activeProjectId={activeProjectId} expanded={expanded} subtreeCount={subtreeCount}
        onSelect={(p) => onSelect({ kind: "project", id: p.id, title: p.name })}
        onToggle={toggle} onMenu={(p) => setMenuFor(p)} onReorder={handleReorder} onDragActiveChange={() => {}}
      />
      <div className="drawer-row drawer-add" onClick={() => setSheet({ mode: "create", parentId: null })}>
        <span className="drawer-ico"><IcoPlus /></span>
        <span className="drawer-label">Проект</span>
      </div>

      {menuFor && (
        <ProjectMenu project={menuFor} onClose={() => setMenuFor(null)}
          onCreateSub={() => { const id = menuFor.id; setMenuFor(null); setSheet({ mode: "create", parentId: id }); }}
          onEdit={() => { const p = menuFor; setMenuFor(null); setSheet({ mode: "edit", project: p }); }}
          onTogglePin={() => togglePin(menuFor)} onDelete={() => requestDelete(menuFor)} />
      )}
      {sheet && (
        <ProjectSheet projects={projects} mode={sheet.mode}
          initial={sheet.mode === "edit" ? sheet.project : undefined}
          defaultParentId={sheet.mode === "create" ? sheet.parentId : undefined}
          onClose={() => setSheet(null)} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
```

> designer: проверить, что `drawer-row`/`drawer-section`/`drawer-count` классы читаемы на полном экране (они из theme.css для панели). При необходимости добавить экранные варианты, не ломая Drawer.

- [ ] **Step 2: Сборка зелёная**

Run: `cd frontend && npm run build`
Expected: ошибок нет.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/Lists.tsx
git commit -m "feat(planner-v2): full-screen Lists (smart-views + project tree)"
```

---

## Task 5: Frontend — плейсхолдер таба «Трекинг»

Чтобы 5-й таб существовал в волне 1 (наполнение — волна 3).

**Files:**
- Create: `frontend/src/screens/Tracking.tsx`

- [ ] **Step 1: Создать Tracking.tsx**

```tsx
import { Empty } from "../components/Empty";

export function Tracking() {
  return (
    <div className="screen">
      <div className="screen-hero"><h1>Трекинг</h1></div>
      <Empty text="Тепловая карта, метрики, привычки и ретро появятся в волне 3." />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/screens/Tracking.tsx
git commit -m "feat(planner-v2): Tracking tab placeholder"
```

---

## Task 6: Frontend — 5-таб навигация (BottomTabs + icons + App)

**Files:**
- Modify: `frontend/src/components/icons.tsx`
- Modify: `frontend/src/components/BottomTabs.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Добавить иконки IcoLists, IcoTracking**

В `frontend/src/components/icons.tsx` добавить (стиль как существующие Ico*: 24×24, stroke currentColor, проп `active`):

```tsx
export function IcoLists({ active }: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1.2" /><circle cx="4" cy="12" r="1.2" /><circle cx="4" cy="18" r="1.2" />
    </svg>
  );
}
export function IcoTracking({ active }: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5M4 19h16" />
      <path d="M7 15l3-4 3 2 4-6" />
    </svg>
  );
}
```

> Тип `P` уже объявлен в icons.tsx (`{ active?: boolean }`). Если нет — использовать `{ active?: boolean }` инлайн.

- [ ] **Step 2: Переписать BottomTabs.tsx**

```tsx
import { IcoCalendar, IcoGoals, IcoLists, IcoToday, IcoTracking } from "./icons";

export type TabKey = "today" | "calendar" | "lists" | "goals" | "tracking";

const TABS: { key: TabKey; label: string; Ico: (p: { active?: boolean }) => React.ReactElement }[] = [
  { key: "today", label: "Сегодня", Ico: IcoToday },
  { key: "calendar", label: "Календарь", Ico: IcoCalendar },
  { key: "lists", label: "Списки", Ico: IcoLists },
  { key: "goals", label: "Цели", Ico: IcoGoals },
  { key: "tracking", label: "Трекинг", Ico: IcoTracking },
];

export function BottomTabs({
  active, onChange, inboxCount,
}: { active: TabKey; onChange: (k: TabKey) => void; inboxCount: number }) {
  return (
    <nav className="tabbar">
      {TABS.map(({ key, label, Ico }) => (
        <button key={key} className={active === key ? "active" : ""} onClick={() => onChange(key)}>
          <Ico active={active === key} />
          <span>{label}</span>
          {key === "today" && inboxCount > 0 && <span className="tab-badge">{inboxCount}</span>}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Переписать App.tsx роутинг**

Ключевые изменения: таб `tasks`→`lists`, таб `projects` убран, добавлен `tracking`. Тап смарт-вью/проекта в Lists → переключиться на просмотр через ListView (вводим под-состояние `viewing`). FAB остаётся. Drawer-как-таб убран (Drawer может остаться доступным свайпом — опционально; в волне 1 допустимо убрать вызов Drawer полностью).

```tsx
import { useEffect, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Fab } from "./components/Fab";
import { TaskComposer } from "./components/TaskComposer";
import { Sheet } from "./components/Sheet";
import { ListView } from "./components/ListView";
import { Today } from "./screens/Today";
import { Lists } from "./screens/Lists";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { Tracking } from "./screens/Tracking";
import { getCounts, getMe } from "./api";
import type { ActiveList } from "./types";
import { applyTelegramTheme } from "./telegram";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [viewing, setViewing] = useState<ActiveList | null>(null); // открытый список из Lists
  const [addOpen, setAddOpen] = useState(false);
  const [addHour, setAddHour] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [name, setName] = useState("");

  function bump() { setReloadKey((k) => k + 1); }

  useEffect(() => {
    applyTelegramTheme();
    getMe().then((m) => setName(m.first_name ?? "")).catch(() => {});
    getCounts().then((c) => setInboxCount(c.inbox)).catch(() => {});
  }, [reloadKey]);

  function onTabChange(k: TabKey) {
    setTab(k);
    setViewing(null); // сброс открытого списка при смене таба
  }

  let screen: React.ReactNode;
  if (viewing) {
    screen = <ListView active={viewing} reloadKey={reloadKey} onMenu={() => setViewing(null)} onInboxChange={bump} />;
  } else if (tab === "today") {
    screen = <Today reloadKey={reloadKey} inboxCount={inboxCount} onInbox={() => setViewing({ kind: "smart", key: "inbox", title: "Входящие" })} onTapHour={(h) => setAddHour(h)} />;
  } else if (tab === "calendar") {
    screen = <Calendar />;
  } else if (tab === "lists") {
    screen = <Lists active={viewing ?? { kind: "smart", key: "all", title: "Все" }} onSelect={setViewing} />;
  } else if (tab === "goals") {
    screen = <Goals />;
  } else {
    screen = <Tracking />;
  }

  const showFab = (tab === "today" || tab === "lists" || tab === "calendar") && !viewing;

  return (
    <div className="app">
      {screen}
      {showFab && <Fab onAdd={() => setAddOpen(true)} onAi={() => setAiOpen(true)} />}
      {addOpen && (
        <TaskComposer
          initialDate={tab === "today" ? localToday() : null}
          onClose={() => setAddOpen(false)}
          onSaved={bump}
        />
      )}
      {addHour != null && (
        <TaskComposer
          initialDate={localToday()}
          initialTime={`${`${addHour}`.padStart(2, "0")}:00:00`}
          initialEnd={`${`${Math.min(addHour + 1, 23)}`.padStart(2, "0")}:00:00`}
          onClose={() => setAddHour(null)}
          onSaved={() => { setAddHour(null); bump(); }}
        />
      )}
      {aiOpen && (
        <Sheet onClose={() => setAiOpen(false)}>
          <h1 style={{ fontSize: 20 }}>AI-копайлот</h1>
          <div className="muted">Скоро: разговорный помощник со знанием всего планнера.</div>
          <button className="btn btn-block" onClick={() => setAiOpen(false)}>Ок</button>
        </Sheet>
      )}
      <BottomTabs active={tab} onChange={onTabChange} inboxCount={inboxCount} />
    </div>
  );
}
```

> Замечания: (1) `ListView.onMenu` теперь = «назад к Lists» (`setViewing(null)`). (2) Inbox открывается как ListView со смарт-ключом inbox. (3) Drawer и старый свайп-открытие убраны из App в волне 1.

- [ ] **Step 4: Сборка зелёная (весь фронт)**

Run: `cd frontend && npm run build`
Expected: tsc+vite без ошибок. Чинить все несоответствия типов (старый Today-проп, удалённый Drawer-импорт и т.п.).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/icons.tsx frontend/src/components/BottomTabs.tsx frontend/src/App.tsx
git commit -m "feat(planner-v2): 5-tab IA (Today/Calendar/Lists/Goals/Tracking), drop Drawer-as-tab"
```

---

## Task 7: Верификация и гейт волны

**Files:** нет правок кода (только проверки; фиксы возвращаются backend/frontend).

- [ ] **Step 1: Полный backend-пакет**

Run: `python -m pytest -q`
Expected: все зелёные (64).

- [ ] **Step 2: Полная сборка фронта**

Run: `cd frontend && npm run build`
Expected: без ошибок tsc/vite/eslint.

- [ ] **Step 3: QA — серверный initData-smoke (если деплоится на прод)**

Внутри контейнера planner-api: python-скрипт подписывает initData боевым токеном из .env, дёргает `GET /api/tasks?scope=planned` и `GET /api/counts` на http://localhost:8000 → 200 и валидный JSON. Зафиксировать вывод.

- [ ] **Step 4: reviewer — адверсариальное ревью диффа волны**

Прогнать `git diff` волны через reviewer-агента. Вердикт MERGE/BLOCK. Blocker'ы (регрессия Списков, сломанная навигация ListView↔Lists, утечка пропсов, дубль таймлайна) — починить до закрытия.

- [ ] **Step 5: Чеклист визуальной проверки пользователю**

Выдать пользователю список для проверки в Telegram (deploy за CEO с подтверждения):
  - 5 табов снизу, активный = ember.
  - Сегодня: сводка + Inbox-карточка + таймлайн с «сейчас» + «Без времени».
  - Календарь: день-таймлайн как прежде (не сломан рефактором DayTimeline).
  - Списки: смарт-вью со счётчиками + дерево проектов; тап → ListView; «назад» возвращает.
  - Цели: экран на месте.
  - Трекинг: плейсхолдер.
  - FAB создаёт задачу; тап по часу в Сегодня создаёт задачу с временем.

- [ ] **Step 6: Деплой (только после ОК пользователя)**

```bash
ssh root@188.245.42.4 'cd /root/planner-v2-src && git pull --ff-only && cd planner-v2 && docker compose -f docker-compose.prod.yml up -d --build planner-api'
```

---

## Self-Review (выполнено автором плана)

- **Покрытие спека (волна 1):** 5-таб IA ✅ (Task 6), слияние Задачи+Проекты→Списки ✅ (Task 4+6), Сегодня-гибрид ✅ (Task 3), переиспользование таймлайна ✅ (Task 2), Трекинг-таб существует ✅ (Task 5), смарт-ключ planned ✅ (Task 1). Цели — таб сохранён (наполнение волна 4). Календарь-месяц — волна 2 (в волне 1 день-view сохранён осознанно).
- **Плейсхолдеры:** кода-заглушек нет; Tracking-плейсхолдер — намеренный продуктовый стаб, не плейсхолдер плана.
- **Согласованность типов:** `TabKey` (today/calendar/lists/goals/tracking) консистентен в BottomTabs+App. `ActiveList`/`SmartKey` не меняются. `DayTimeline` пропсы совпадают в Calendar (Task 2) и Today (Task 3). `Today` пропсы (reloadKey/inboxCount/onInbox/onTapHour) совпадают в Task 3 и App (Task 6).
- **Открытый риск:** классы `drawer-*` переиспользуются на полном экране Lists — designer валидирует читаемость; не блокер.
