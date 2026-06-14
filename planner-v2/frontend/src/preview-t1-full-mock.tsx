import "./theme.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Today } from "./screens/Today";
import { Fab } from "./components/Fab";
import type { Project, Task } from "./types";

// ── Полноэкранный preview «Сегодня» (Today + хром) для гейта верности v2 ──
// Стаб fetch (stateful) → покрывает A1-A5 + draft-создание + persist после refresh.
// Параметры URL:
//   (нет)         happy — свежий сид каждый раз (детерминированно для baseline)
//   ?state=empty  пустой день
//   ?persist=1    стор в localStorage (мутации переживают reload — для persist-теста)

const params = new URLSearchParams(location.search);
const empty = params.get("state") === "empty";
const persist = params.get("persist") === "1";

const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
const TODAY = localISO();

const PROJECTS: Project[] = [
  { id: 1, name: "ZIMA", slug: "zima", is_inbox: false, parent_id: null, open_count: 3, color: "#3FB68B", icon: null, pinned: false, order_index: 0 },
  { id: 2, name: "Здоровье", slug: "health", is_inbox: false, parent_id: null, open_count: 2, color: "#5B8DEF", icon: null, pinned: false, order_index: 1 },
];

const seed = (): Task[] => [
  { id: 1, title: "Созвон с командой ZIMA", status: "todo", priority: "medium", project_id: 1, due_date: TODAY, due_time: "09:00:00", end_time: "10:00:00", stage_id: 3, stage_label: "этап 3", stage_status: "current", impact: 80 } as Task,
  { id: 2, title: "Анализы — сдать кровь", status: "todo", priority: "high", project_id: 2, due_date: TODAY, due_time: "11:00:00", end_time: "11:30:00", stage_id: 1, stage_label: "этап 1", stage_status: "late", impact: 45 } as Task,
  // all-day ×3 → «+1 ещё» (тест разворота A5)
  { id: 3, title: "Оплатить аренду", status: "todo", priority: "high", project_id: 1, due_date: TODAY, due_time: null, end_time: null } as Task,
  { id: 4, title: "Позвонить маме", status: "todo", priority: "none", project_id: 2, due_date: TODAY, due_time: null, end_time: null } as Task,
  { id: 5, title: "Забрать посылку", status: "todo", priority: "low", project_id: null, due_date: TODAY, due_time: null, end_time: null } as Task,
];

const OVERDUE: Task[] = [
  { id: 90, title: "Просрочка: отчёт", status: "todo", priority: "high", project_id: 1, due_date: "2026-06-01", due_time: null, end_time: null } as Task,
];

// ── stateful стор ──
const KEY = "preview-t1-store";
let store: Task[];
if (empty) store = [];
else if (persist) {
  const saved = localStorage.getItem(KEY);
  store = saved ? (JSON.parse(saved) as Task[]) : seed();
} else store = seed();
const save = () => { if (persist) localStorage.setItem(KEY, JSON.stringify(store)); };
let nextId = Math.max(0, ...store.map((t) => t.id)) + 1;

const json = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  const method = (init?.method ?? "GET").toUpperCase();

  if (url.includes("/api/projects")) return json(PROJECTS);
  if (url.includes("/api/tasks/density")) return json({});
  if (url.includes("/api/tasks") && url.includes("scope=overdue")) return json(OVERDUE);
  if (url.includes("/api/tasks") && url.includes("on_date=")) return json(store.filter((t) => t.due_date === TODAY));

  if (url.match(/\/api\/tasks\/\d+$/) && method === "PATCH") {
    const id = Number(url.match(/\/api\/tasks\/(\d+)$/)![1]);
    const patch = JSON.parse(String(init?.body ?? "{}")) as Partial<Task>;
    store = store.map((t) => (t.id === id ? { ...t, ...patch } : t));
    save();
    return json(store.find((t) => t.id === id));
  }
  if (url.match(/\/api\/tasks$/) && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}")) as Partial<Task>;
    const t = { id: nextId++, status: "todo", priority: "none", project_id: null, due_date: TODAY, due_time: null, end_time: null, ...body } as Task;
    store = [...store, t];
    save();
    return json(t);
  }
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

// ── рендер ──
function Harness() {
  const [drawer, setDrawer] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <div data-testid="screen-today-full" data-drawer={drawer ? "open" : "closed"} data-opened={opened ?? ""}
      style={{ width: 390, height: 844, background: "var(--bg)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
      <Today
        reloadKey={0}
        view="timeline"
        onViewChange={() => {}}
        onOpenInbox={() => {}}
        onQuickAdd={() => {}}
        inboxCount={0}
        onOpenDrawer={() => setDrawer(true)}
        onOpenTask={(t) => setOpened(t.id)}
      />
      {/* FAB зеркалит App: secondary-пилюля «Список» (контракт A7·D) на таб «Задачи»/timeline */}
      <Fab onAdd={() => {}} secondary={{ label: "Список", onClick: () => {} }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
