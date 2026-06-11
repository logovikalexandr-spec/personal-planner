# Planner v2 — Phase 2: Mini App UI (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Рабочий Telegram Mini App: 5 нижних табов, экраны Сегодня / Задачи / Inbox функциональны (читают и пишут через Phase 1 API), Календарь и Цели — заглушки на Phase 3. Быстрое добавление задачи, триаж Inbox в проект. Стиль Air-Bank-ish: чисто, мягко, один акцент, тема от Telegram.

**Architecture:** React + TS + Vite (уже есть). Без тяжёлых зависимостей: свой state-роутер на useState (не react-router). Тонкий типизированный API-клиент (fetch + initData header). CSS-переменные как дизайн-токены, тема подхватывается из Telegram WebApp themeParams. Компоненты маленькие, по одному ответственному файлу.

**Tech Stack:** дополняет Phase 1 frontend. Новых runtime-зависимостей нет.

**Проверка:** UI визуально в реальном Telegram не проверяется в этой фазе (нужен деплой+токен). Критерий готовности — `tsc -b` без ошибок и `vite build` собирает dist. Логика тонкая; бизнес-правила покрыты бэкенд-тестами Phase 1.

**Примечание:** без emoji в коде/файлах. Тексты UI — кириллица.

---

## File Structure (frontend/src)

```
frontend/src/
  theme.css        # NEW: CSS-переменные (палитра, типошкала, отступы) + базовые стили
  telegram.ts      # NEW: инициализация Telegram WebApp, применение themeParams к CSS-переменным
  types.ts         # NEW: доменные типы (Task, Project, InboxItem)
  api.ts           # MOD: getMe + projects/tasks/inbox методы
  components/
    BottomTabs.tsx # NEW: нижняя навигация (5 табов)
    TaskItem.tsx   # NEW: строка задачи (чекбокс, приоритет, дата)
    AddTaskBar.tsx # NEW: быстрый ввод задачи
    Empty.tsx      # NEW: пустое состояние (текст + действие)
  screens/
    Today.tsx      # NEW
    Tasks.tsx      # NEW
    Inbox.tsx      # NEW
    Calendar.tsx   # NEW (заглушка)
    Goals.tsx      # NEW (заглушка)
  App.tsx          # MOD: shell (активный таб + рендер экрана)
  main.tsx         # MOD: импорт theme.css
```

---

## Task 1: Дизайн-токены, тема, типы, API-клиент

**Files:** Create `theme.css`, `telegram.ts`, `types.ts`; modify `api.ts`, `main.tsx`.

- [ ] **Step 1: `frontend/src/theme.css`**
```css
:root {
  --bg: #f4f5f7;
  --surface: #ffffff;
  --text: #16181d;
  --text-muted: #6b7280;
  --accent: #2d7ff9;
  --accent-contrast: #ffffff;
  --danger: #e5484d;
  --border: #e6e8eb;
  --radius: 14px;
  --gap: 12px;
  --tab-h: 64px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 16px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.app { min-height: 100%; padding-bottom: calc(var(--tab-h) + env(safe-area-inset-bottom)); }
.screen { padding: 16px; }
.screen h1 { font-size: 22px; font-weight: 700; margin: 8px 0 16px; }
.muted { color: var(--text-muted); }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.list { display: flex; flex-direction: column; gap: 10px; }

.btn {
  appearance: none; border: none; cursor: pointer;
  background: var(--accent); color: var(--accent-contrast);
  border-radius: 10px; padding: 12px 16px; font-size: 16px; font-weight: 600;
  min-height: 44px;
}
.btn-ghost { background: transparent; color: var(--accent); }

.input {
  width: 100%; border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; font-size: 16px; background: var(--surface); color: var(--text);
  min-height: 44px;
}

.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0;
  height: calc(var(--tab-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: grid; grid-template-columns: repeat(5, 1fr);
  background: var(--surface); border-top: 1px solid var(--border);
}
.tabbar button {
  appearance: none; border: none; background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; font-size: 11px; color: var(--text-muted); padding: 0;
}
.tabbar button.active { color: var(--accent); }
.tab-badge {
  position: absolute; transform: translate(14px, -10px);
  background: var(--danger); color: #fff; border-radius: 10px;
  font-size: 10px; padding: 1px 6px; min-width: 16px; text-align: center;
}
.checkbox {
  width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  flex: 0 0 auto;
}
.checkbox.done { background: var(--accent); border-color: var(--accent); color: #fff; }
.prio-high { border-left: 3px solid var(--danger); }
.prio-medium { border-left: 3px solid #f5a623; }
.prio-low { border-left: 3px solid var(--accent); }
.row { display: flex; align-items: center; gap: 12px; }
.grow { flex: 1 1 auto; min-width: 0; }
.title-done { text-decoration: line-through; color: var(--text-muted); }
```

- [ ] **Step 2: `frontend/src/telegram.ts`**
```ts
type TG = typeof window.Telegram.WebApp;

export function tg(): TG | undefined {
  return window.Telegram?.WebApp;
}

// Подхватываем тему Telegram в CSS-переменные (свет/тьма от клиента).
export function applyTelegramTheme(): void {
  const w = tg();
  if (!w) return;
  const p = w.themeParams ?? {};
  const root = document.documentElement.style;
  if (p.bg_color) root.setProperty("--bg", p.bg_color);
  if (p.secondary_bg_color) root.setProperty("--surface", p.secondary_bg_color);
  if (p.text_color) root.setProperty("--text", p.text_color);
  if (p.hint_color) root.setProperty("--text-muted", p.hint_color);
  if (p.button_color) root.setProperty("--accent", p.button_color);
  if (p.button_text_color) root.setProperty("--accent-contrast", p.button_text_color);
  w.ready();
  w.expand?.();
}
```

- [ ] **Step 3: `frontend/src/types.ts`**
```ts
export type Priority = "none" | "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";

export interface Task {
  id: number;
  title: string;
  project_id: number | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  is_inbox: boolean;
}

export interface InboxItem {
  id: number;
  kind: string;
  source: string;
  raw_content: string;
  status: string;
}
```

- [ ] **Step 4: REPLACE `frontend/src/api.ts`**
```ts
import { tg } from "./telegram";
import type { InboxItem, Priority, Project, Task } from "./types";

function initData(): string {
  return tg()?.initData ?? "";
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData(),
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export const getMe = () => req<{ id: number; first_name: string | null }>("/api/me");
export const getProjects = () => req<Project[]>("/api/projects");
export const getTasks = (scope = "all", projectId?: number) =>
  req<Task[]>(`/api/tasks?scope=${scope}${projectId ? `&project_id=${projectId}` : ""}`);
export const createTask = (title: string, opts: Partial<Pick<Task, "project_id" | "priority" | "due_date">> = {}) =>
  req<Task>("/api/tasks", { method: "POST", body: JSON.stringify({ title, ...opts }) });
export const patchTask = (id: number, patch: { status?: string; priority?: Priority; project_id?: number }) =>
  req<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const getInbox = () => req<InboxItem[]>("/api/inbox");
export const triageInbox = (id: number, projectId: number, title: string, priority: Priority = "none") =>
  req<Task>(`/api/inbox/${id}/triage`, {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, title, priority }),
  });
```

- [ ] **Step 5: MOD `frontend/src/main.tsx`** — добавить первой строкой импорт стилей: `import "./theme.css";` (перед остальными импортами).

- [ ] **Step 6: Проверка сборки**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend"
npm run build
```
Expected: tsc + vite build без ошибок, dist обновлён. (App.tsx из Phase 0 пока использует старый getMe — он остаётся валидным, т.к. getMe экспортируется. Если App.tsx ломается из-за изменений api.ts, не трогать его в этой задаче — getMe сигнатура сохранена.)

- [ ] **Step 7: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/frontend/src/theme.css planner-v2/frontend/src/telegram.ts planner-v2/frontend/src/types.ts planner-v2/frontend/src/api.ts planner-v2/frontend/src/main.tsx
git commit -m "feat(planner-v2): mini app design tokens, theme, types, API client"
```

---

## Task 2: Компоненты + экраны + shell

**Files:** Create components/{BottomTabs,TaskItem,AddTaskBar,Empty}.tsx, screens/{Today,Tasks,Inbox,Calendar,Goals}.tsx; REPLACE App.tsx.

- [ ] **Step 1: `frontend/src/components/Empty.tsx`**
```tsx
export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 28 }}>
      <div className="muted" style={{ marginBottom: action ? 14 : 0 }}>{text}</div>
      {action}
    </div>
  );
}
```

- [ ] **Step 2: `frontend/src/components/TaskItem.tsx`**
```tsx
import type { Task } from "../types";

export function TaskItem({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  const done = task.status === "done";
  const prioClass =
    task.priority === "high" ? "prio-high" : task.priority === "medium" ? "prio-medium" : task.priority === "low" ? "prio-low" : "";
  return (
    <div className={`card row ${prioClass}`}>
      <div
        className={`checkbox ${done ? "done" : ""}`}
        onClick={() => onToggle(task)}
        role="button"
        aria-label="toggle done"
      >
        {done ? "v" : ""}
      </div>
      <div className="grow">
        <div className={done ? "title-done" : ""}>{task.title}</div>
        {(task.due_date || task.due_time) && (
          <div className="muted" style={{ fontSize: 13 }}>
            {task.due_date ?? ""} {task.due_time ?? ""}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `frontend/src/components/AddTaskBar.tsx`**
```tsx
import { useState } from "react";

export function AddTaskBar({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  function submit() {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV("");
  }
  return (
    <div className="row" style={{ gap: 8, marginBottom: 16 }}>
      <input
        className="input grow"
        placeholder="Новая задача..."
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button className="btn" onClick={submit}>Добавить</button>
    </div>
  );
}
```

- [ ] **Step 4: `frontend/src/components/BottomTabs.tsx`**
```tsx
export type TabKey = "today" | "calendar" | "tasks" | "goals" | "projects";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "calendar", label: "Календарь" },
  { key: "tasks", label: "Задачи" },
  { key: "goals", label: "Цели" },
  { key: "projects", label: "Проекты" },
];

export function BottomTabs({
  active,
  onChange,
  inboxCount,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  inboxCount: number;
}) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button key={t.key} className={active === t.key ? "active" : ""} onClick={() => onChange(t.key)}>
          <span>{t.label}</span>
          {t.key === "today" && inboxCount > 0 && <span className="tab-badge">{inboxCount}</span>}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: `frontend/src/screens/Today.tsx`**
```tsx
import { useEffect, useState } from "react";
import { AddTaskBar } from "../components/AddTaskBar";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { createTask, getTasks, patchTask } from "../api";
import type { Task } from "../types";

export function Today({ onInbox }: { onInbox: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setTasks(await getTasks("today"));
    } catch (e) {
      setErr(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(title: string) {
    const today = new Date().toISOString().slice(0, 10);
    await createTask(title, { due_date: today });
    await load();
  }
  async function toggle(t: Task) {
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    await load();
  }

  return (
    <div className="screen">
      <h1>Сегодня</h1>
      <button className="btn-ghost" onClick={onInbox} style={{ marginBottom: 12 }}>Разобрать Inbox</button>
      <AddTaskBar onAdd={add} />
      {err && <div className="card">Ошибка: {err}</div>}
      {!err && tasks.length === 0 && <Empty text="На сегодня пусто. Добавь задачу выше." />}
      <div className="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `frontend/src/screens/Tasks.tsx`**
```tsx
import { useEffect, useState } from "react";
import { AddTaskBar } from "../components/AddTaskBar";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { createTask, getTasks, patchTask } from "../api";
import type { Task } from "../types";

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  async function load() {
    setTasks(await getTasks("all"));
  }
  useEffect(() => {
    load();
  }, []);
  async function add(title: string) {
    await createTask(title);
    await load();
  }
  async function toggle(t: Task) {
    await patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
    await load();
  }
  return (
    <div className="screen">
      <h1>Задачи</h1>
      <AddTaskBar onAdd={add} />
      {tasks.length === 0 && <Empty text="Список пуст." />}
      <div className="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `frontend/src/screens/Inbox.tsx`**
```tsx
import { useEffect, useState } from "react";
import { Empty } from "../components/Empty";
import { getInbox, getProjects, triageInbox } from "../api";
import type { InboxItem, Project } from "../types";

export function Inbox({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"all" | "manual" | "session">("all");

  async function load() {
    const [i, p] = await Promise.all([getInbox(), getProjects()]);
    setItems(i);
    setProjects(p);
  }
  useEffect(() => {
    load();
  }, []);

  const shown = items.filter((i) => filter === "all" || i.source === filter);

  async function triage(item: InboxItem, projectId: number) {
    const title = item.raw_content || "(без названия)";
    await triageInbox(item.id, projectId, title);
    await load();
    onChange();
  }

  return (
    <div className="screen">
      <h1>Inbox</h1>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        {(["all", "manual", "session"] as const).map((f) => (
          <button
            key={f}
            className={filter === f ? "btn" : "btn btn-ghost"}
            style={{ padding: "8px 12px", minHeight: 36 }}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Все" : f === "manual" ? "Мои" : "Из сессий"}
          </button>
        ))}
      </div>
      {shown.length === 0 && <Empty text="Inbox пуст. Кидай мысли боту в Telegram." />}
      <div className="list">
        {shown.map((it) => (
          <div key={it.id} className="card">
            <div style={{ marginBottom: 8 }}>{it.raw_content || `(${it.kind})`}</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {it.source === "session" ? "из сессий" : "мои"} - {it.kind}
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {projects
                .filter((p) => !p.is_inbox)
                .map((p) => (
                  <button
                    key={p.id}
                    className="btn btn-ghost"
                    style={{ padding: "6px 10px", minHeight: 32, border: "1px solid var(--border)" }}
                    onClick={() => triage(it, p.id)}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: `frontend/src/screens/Calendar.tsx` и `frontend/src/screens/Goals.tsx`** (заглушки)
```tsx
import { Empty } from "../components/Empty";

export function Calendar() {
  return (
    <div className="screen">
      <h1>Календарь</h1>
      <Empty text="Календарь с расписанием появится в следующей фазе." />
    </div>
  );
}
```
```tsx
import { Empty } from "../components/Empty";

export function Goals() {
  return (
    <div className="screen">
      <h1>Цели</h1>
      <Empty text="Цели и привычки появятся в следующей фазе." />
    </div>
  );
}
```

- [ ] **Step 9: REPLACE `frontend/src/App.tsx`**
```tsx
import { useEffect, useState } from "react";
import { BottomTabs, type TabKey } from "./components/BottomTabs";
import { Calendar } from "./screens/Calendar";
import { Goals } from "./screens/Goals";
import { Inbox } from "./screens/Inbox";
import { Tasks } from "./screens/Tasks";
import { Today } from "./screens/Today";
import { getInbox } from "./api";
import { applyTelegramTheme } from "./telegram";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [showInbox, setShowInbox] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  async function refreshInbox() {
    try {
      setInboxCount((await getInbox()).length);
    } catch {
      setInboxCount(0);
    }
  }
  useEffect(() => {
    applyTelegramTheme();
    refreshInbox();
  }, []);

  let screen: React.ReactNode;
  if (showInbox) screen = <Inbox onChange={refreshInbox} />;
  else if (tab === "today") screen = <Today onInbox={() => setShowInbox(true)} />;
  else if (tab === "calendar") screen = <Calendar />;
  else if (tab === "tasks") screen = <Tasks />;
  else if (tab === "goals") screen = <Goals />;
  else screen = <div className="screen"><h1>Проекты</h1><div className="muted">Скоро.</div></div>;

  return (
    <div className="app">
      {showInbox && (
        <div className="screen" style={{ paddingBottom: 0 }}>
          <button className="btn-ghost" onClick={() => setShowInbox(false)}>{"< Назад"}</button>
        </div>
      )}
      {screen}
      <BottomTabs
        active={tab}
        onChange={(k) => {
          setShowInbox(false);
          setTab(k);
        }}
        inboxCount={inboxCount}
      />
    </div>
  );
}
```

- [ ] **Step 10: Сборка**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend"
npm run build
```
Expected: tsc + vite build без ошибок. Если tsc ругается на типы Telegram themeParams/expand — допустимо уточнить типы через `@types/telegram-web-app`; если конкретного поля нет в типах, использовать необязательную цепочку и приведение через `as` минимально, отметить в отчёте.

- [ ] **Step 11: Commit**
```bash
cd "/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner"
git add planner-v2/frontend/src/components planner-v2/frontend/src/screens planner-v2/frontend/src/App.tsx
git commit -m "feat(planner-v2): mini app shell + Today/Tasks/Inbox screens"
```

---

## Definition of Done (Phase 2)
- [ ] `npm run build` (tsc + vite) собирается без ошибок; dist обновляется.
- [ ] 5 нижних табов; активный подсвечен; бейдж Inbox на "Сегодня".
- [ ] Сегодня: список задач на сегодня, добавление, отметка done.
- [ ] Задачи: все задачи, добавление, done.
- [ ] Inbox: список + фильтры Мои/Из сессий + триаж в проект кнопкой.
- [ ] Календарь, Цели, Проекты — заглушки.
- [ ] Тема подхватывается из Telegram (CSS-переменные).

## NOT in scope (Phase 2)
- Drag в календаре, виды Эйзенхауэра, теги UI, подзадачи UI -> позже.
- Цели/привычки/заметки экраны -> Phase 3.
- AI floating-кнопка/чат -> Phase 4.
- Юнит-тесты фронта (логика тонкая, бэк покрыт) -> по желанию позже (vitest).

## Self-Review
- Покрытие спеки: раздел 7 (5 табов, Inbox-фильтры Мои/Из сессий, тема, состояния empty) реализован в функциональном объёме. Календарь/Цели — заглушки по фазовому плану.
- Плейсхолдеры: только осознанные заглушки-экраны (Календарь/Цели/Проекты) с текстом про следующую фазу.
- Согласованность: TabKey, типы Task/Project/InboxItem, сигнатуры api совпадают между api.ts, компонентами и экранами.
