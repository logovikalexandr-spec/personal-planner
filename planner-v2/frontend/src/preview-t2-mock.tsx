import "./theme.css";
import { createRoot } from "react-dom/client";
import { Calendar } from "./screens/Calendar";
import type { Milestone, Project, Task } from "./types";

// ── Полноэкранный preview «Календарь» (3 вида) для гейта верности T2 ──
// Стаб fetch (stateful) покрывает Неделя/Месяц/Лента + состояния.
// URL: (нет)=happy неделя · ?view=month · ?view=agenda · ?state=empty · ?state=error
// Часы морозит тест (page.clock) — даты сидов считаются от new Date() при загрузке.

const params = new URLSearchParams(location.search);
const empty = params.get("state") === "empty";
const error = params.get("state") === "error";
const startView = params.get("view"); // month|agenda → переключим после маунта

const pad = (n: number) => `${n}`.padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const NOW = new Date();
const startOfWeek = (d: Date) => { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; };
const MON = startOfWeek(NOW);
const day = (offset: number) => { const d = new Date(MON); d.setDate(d.getDate() + offset); return iso(d); }; // 0=Пн..6=Вс
const monthDay = (n: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), n));

// hex-allowlist (палитра проектов — данные, не токены темы)
const PROJECTS: Project[] = [
  { id: 1, name: "ZIMA", slug: "zima", is_inbox: false, parent_id: null, open_count: 3, color: "#3FB68B", icon: null, pinned: false, order_index: 0 },
  { id: 2, name: "Здоровье", slug: "health", is_inbox: false, parent_id: null, open_count: 2, color: "#5B8DEF", icon: null, pinned: false, order_index: 1 },
  { id: 3, name: "planner", slug: "plan", is_inbox: false, parent_id: null, open_count: 4, color: "#9B6BE0", icon: null, pinned: false, order_index: 2 },
  { id: 4, name: "Финансы", slug: "fin", is_inbox: false, parent_id: null, open_count: 1, color: "#C9A24B", icon: null, pinned: false, order_index: 3 },
  { id: 9, name: "Входящие", slug: "inbox", is_inbox: true, parent_id: null, open_count: 0, color: null, icon: null, pinned: false, order_index: 9 },
];

const SEED: Task[] = empty ? [] : [
  // НЕДЕЛЯ — таймблоки
  { id: 1, title: "Звонок покупателю", status: "todo", priority: "high", project_id: 1, due_date: day(0), due_time: "09:30:00", end_time: "10:30:00", stage_label: "этап 4" } as Task,
  { id: 2, title: "Сборка в.2", status: "todo", priority: "medium", project_id: 3, due_date: day(0), due_time: "13:00:00", end_time: "14:30:00" } as Task,
  { id: 3, title: "Добавки", status: "todo", priority: "low", project_id: 2, due_date: day(1), due_time: "12:00:00", end_time: "12:45:00" } as Task,
  { id: 4, title: "Анализы", status: "todo", priority: "high", project_id: 2, due_date: day(2), due_time: "11:00:00", end_time: "12:00:00" } as Task,
  // каскад-наложение (G2) на Чт
  { id: 5, title: "Планёрка", status: "todo", priority: "low", project_id: 3, due_date: day(3), due_time: "15:00:00", end_time: "16:00:00" } as Task,
  { id: 6, title: "Звонок", status: "todo", priority: "high", project_id: 1, due_date: day(3), due_time: "15:30:00", end_time: "16:30:00" } as Task,
  // C1 — всё-день (дата без времени)
  { id: 7, title: "Договор", status: "todo", priority: "high", project_id: 4, due_date: day(0), due_time: null, end_time: null } as Task,
  // месяц-разброс + agenda
  { id: 10, title: "Созвон ZIMA", status: "todo", priority: "medium", project_id: 1, due_date: day(0), due_time: "11:00:00", end_time: "11:30:00" } as Task,
  { id: 11, title: "Договор клиенту", status: "todo", priority: "high", project_id: 4, due_date: day(0), due_time: "17:00:00", end_time: "18:00:00" } as Task,
  { id: 12, title: "Сдать анализы", status: "todo", priority: "high", project_id: 2, due_date: day(1), due_time: null, end_time: null } as Task,
  { id: 13, title: "Юр.пакет ZIMA", status: "todo", priority: "low", project_id: 1, due_date: day(3), due_time: null, end_time: null, stage_label: "этап 4" } as Task,
];

// недатированные (лоток) + просрочка
const UNDATED: Task[] = empty ? [] : [
  { id: 20, title: "Прочитать договор аренды", status: "todo", priority: "none", project_id: 4, due_date: null, due_time: null } as Task,
  { id: 21, title: "Идея: лендинг", status: "todo", priority: "low", project_id: 3, due_date: null, due_time: null } as Task,
  { id: 22, title: "Заказать витамины", status: "todo", priority: "none", project_id: 2, due_date: null, due_time: null } as Task,
  { id: 23, title: "Позвонить бухгалтеру", status: "todo", priority: "medium", project_id: 4, due_date: null, due_time: null } as Task,
];
const OVERDUE: Task[] = empty ? [] : [
  { id: 30, title: "Записаться на МРТ", status: "todo", priority: "high", project_id: 2, due_date: day(-3), due_time: null, end_time: null } as Task,
  { id: 31, title: "Свести счёт Revolut", status: "todo", priority: "medium", project_id: 4, due_date: day(-2), due_time: null, end_time: null } as Task,
];
const MILESTONES: Milestone[] = empty ? [] : [
  { id: 100, project_id: 2, name: "Анализы", milestone_date: monthDay(15), status: "future" },
  { id: 101, project_id: 2, name: "Протокол", milestone_date: monthDay(22), status: "future" },
  { id: 102, project_id: 3, name: "v2 запуск", milestone_date: monthDay(28), status: "future" },
  { id: 103, project_id: 1, name: "Юр.готовность ZIMA", milestone_date: day(3), status: "current" },
];

let store = [...SEED];
const inWin = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
const fail = () => Promise.resolve(new Response("err", { status: 500 }));

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  const method = (init?.method ?? "GET").toUpperCase();
  const u = new URL(url, location.origin);
  const q = u.searchParams;

  if (error && (u.pathname.includes("/api/tasks") || u.pathname.includes("/api/milestones"))) return fail();

  if (u.pathname.endsWith("/api/projects")) return json(PROJECTS);
  if (u.pathname.endsWith("/api/milestones")) {
    const from = q.get("from")!, to = q.get("to")!;
    return json(MILESTONES.filter((m) => m.milestone_date >= from && m.milestone_date <= to));
  }
  if (u.pathname.match(/\/api\/tasks\/\d+$/) && method === "GET") {
    const id = Number(u.pathname.match(/\/api\/tasks\/(\d+)$/)![1]);
    const t = [...store, ...UNDATED, ...OVERDUE].find((x) => x.id === id);
    return json({ ...t, checkitems: [], reminders: [], subtasks: [] });
  }
  if (u.pathname.match(/\/api\/tasks\/\d+$/) && method === "PATCH") {
    const id = Number(u.pathname.match(/\/api\/tasks\/(\d+)$/)![1]);
    const patch = JSON.parse(String(init?.body ?? "{}")) as Partial<Task>;
    store = store.map((t) => (t.id === id ? { ...t, ...patch } : t));
    return json(store.find((t) => t.id === id) ?? { id, ...patch });
  }
  if (u.pathname.endsWith("/api/tasks")) {
    const scope = q.get("scope");
    if (scope === "overdue") return json(OVERDUE);
    if (scope === "all") return json([...store, ...UNDATED]);
    const from = q.get("from"), to = q.get("to");
    if (from && to) return json(store.filter((t) => inWin(t.due_date, from, to)));
    return json(store);
  }
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

function Harness() {
  return (
    <div style={{ width: 390, height: 844, background: "var(--bg)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
      <Calendar />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);

// переключение вида по URL (после первого рендера — клик по сегменту)
if (startView === "month" || startView === "agenda") {
  requestAnimationFrame(() => {
    const btn = document.querySelector(`[data-testid="seg-${startView}"]`) as HTMLButtonElement | null;
    btn?.click();
  });
}
