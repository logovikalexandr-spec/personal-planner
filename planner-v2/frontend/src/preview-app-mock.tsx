import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { Project, Task } from "./types";

// ── Весь App с мок-сетью (для аудита дрейфа: все экраны/табы рендерятся с данными) ──
// Не зависит от бэкенда/Telegram. Открой /app/preview-app-mock.html, ходи по табам.

const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
const TODAY = localISO();

// Telegram-стаб (tg() безопасен и так, но тема/initData нужны кое-где)
(window as unknown as { Telegram: unknown }).Telegram = {
  WebApp: {
    initData: "", initDataUnsafe: { user: { id: 1, first_name: "Test" } },
    colorScheme: "dark", themeParams: {}, isExpanded: true,
    viewportHeight: 844, viewportStableHeight: 844,
    ready() {}, expand() {}, close() {}, onEvent() {}, offEvent() {},
    MainButton: { show() {}, hide() {}, setText() {}, onClick() {}, offClick() {} },
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
    showConfirm(_m: string, cb: (v: boolean) => void) { cb && cb(true); },
    showAlert(_m: string, cb: () => void) { cb && cb(); },
    setHeaderColor() {}, setBackgroundColor() {},
  },
};

const PROJECTS: Project[] = [
  { id: 1, name: "ZIMA", slug: "zima", is_inbox: false, parent_id: null, open_count: 3, color: "#3FB68B", icon: null, pinned: true, order_index: 0 },
  { id: 2, name: "Здоровье", slug: "health", is_inbox: false, parent_id: null, open_count: 2, color: "#5B8DEF", icon: null, pinned: false, order_index: 1 },
  { id: 3, name: "Финансы", slug: "fin", is_inbox: false, parent_id: null, open_count: 1, color: "#E0B341", icon: null, pinned: false, order_index: 2 },
  { id: 4, name: "Духовность", slug: "spirit", is_inbox: false, parent_id: null, open_count: 9, color: "#9B6BE0", icon: "🕉️", pinned: false, order_index: 3 },
  { id: 5, name: "Внутренняя работа", slug: "inner", is_inbox: false, parent_id: 4, open_count: 8, color: "#4FB477", icon: "🧩", pinned: false, order_index: 0 },
  { id: 99, name: "Входящие", slug: "inbox", is_inbox: true, parent_id: null, open_count: 1, color: null, icon: null, pinned: false, order_index: 99 },
];

const DAY_TASKS: Task[] = [
  { id: 1, title: "Созвон с командой ZIMA", status: "todo", priority: "medium", project_id: 1, due_date: TODAY, due_time: "09:00:00", end_time: "10:00:00", stage_label: "этап 3", stage_status: "current", impact: 80 } as Task,
  { id: 2, title: "Анализы — сдать кровь", status: "todo", priority: "high", project_id: 2, due_date: TODAY, due_time: "11:00:00", end_time: "11:30:00", stage_label: "этап 1", stage_status: "late", impact: 45 } as Task,
  { id: 3, title: "Оплатить аренду", status: "todo", priority: "high", project_id: 1, due_date: TODAY, due_time: null, end_time: null } as Task,
  { id: 4, title: "Позвонить маме", status: "todo", priority: "none", project_id: 2, due_date: TODAY, due_time: null, end_time: null } as Task,
  { id: 5, title: "Встреча (отменена)", status: "wont_do", priority: "low", project_id: 1, due_date: TODAY, due_time: "13:00:00", end_time: "14:00:00" } as Task,
];
const OVERDUE: Task[] = [
  { id: 90, title: "Просроченный отчёт", status: "todo", priority: "high", project_id: 3, due_date: "2026-06-01", due_time: null, end_date: null, end_time: null, days_late: 9 } as Task,
];
const HEAT: Record<string, "g" | "y" | "r"> = {
  [TODAY]: "g", "2026-06-04": "r", "2026-06-09": "y", "2026-06-11": "g", "2026-06-12": "r", "2026-06-18": "r",
};

// Этапы проектов (Форк 0) — для Гант (T3) + Цели (T4) в app-навигации.
const STAGES: Record<number, unknown[]> = {
  1: [
    { id: 11, project_id: 1, name: "Подготовка", order_index: 0, start_date: "2026-06-01", end_date: "2026-06-15", status: "done", progress: 100, is_milestone: false, milestone_date: null, depends_on_ids: [] },
    { id: 12, project_id: 1, name: "Переговоры", order_index: 1, start_date: "2026-06-15", end_date: "2026-07-10", status: "current", progress: 60, is_milestone: false, milestone_date: null, depends_on_ids: [11] },
    { id: 13, project_id: 1, name: "Сделка", order_index: 2, start_date: "2026-07-10", end_date: "2026-08-15", status: "future", progress: 0, is_milestone: true, milestone_date: "2026-08-15", depends_on_ids: [12] },
  ],
  2: [
    { id: 21, project_id: 2, name: "Анализы", order_index: 0, start_date: "2026-06-05", end_date: "2026-06-22", status: "late", progress: 30, is_milestone: false, milestone_date: "2026-06-22", depends_on_ids: [] },
  ],
  3: [],
};

const HABITS = [
  { id: 1, name: "Зарядка + валик", color: "#5B8DEF", mark_type: "check", target: null, unit: null, step: null, done_today: true, streak: 12, week: [true, true, true, true, true, false, false], week_done: 5, today_value: 1, heat_level: 4, heat7: [4, 4, 3, 4, 4, 0, 0] },
  { id: 2, name: "Вода 2л", color: "#3FB68B", mark_type: "count", target: 2, unit: "л", step: 0.5, done_today: false, streak: 4, week: [true, true, true, false, true, false, false], week_done: 4, today_value: 1, heat_level: 2, heat7: [2, 3, 2, 0, 2, 0, 0] },
];
const METRICS = [
  { id: 1, name: "Вес", unit: "кг", good_direction: "down", color: "#3FB68B", archived: false, order_index: 0, last_value: 78, last_date: TODAY, week_delta: -0.5 },
  { id: 2, name: "Сон", unit: "ч", good_direction: "up", color: "#5B8DEF", archived: false, order_index: 1, last_value: 7, last_date: TODAY, week_delta: 0.3 },
];
const RETRO = {
  week_start: "2026-06-08", week_end: TODAY,
  tasks: { done: 12, planned: 18, impact_sum: 240, by_project: [{ project_id: 1, name: "ZIMA", color: "#3FB68B", done: 5, total: 7 }], overdue: [], top_task: { title: "Созвон ZIMA", impact: 80, project: "ZIMA" } },
  habits: { done_days: 5, total_days: 7, count: 2, items: HABITS.map((h) => ({ id: h.id, name: h.name, color: h.color, week: h.week, week_done: h.week_done, streak: h.streak, tag: null })) },
};
const INBOX = [
  { id: 1, kind: "note", source: "manual", raw_content: "Купить подарок маме", status: "pending" },
  { id: 2, kind: "note", source: "session", raw_content: "Идея: автосводка недели в боте", status: "pending" },
];

const json = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  const m = (init?.method ?? "GET").toUpperCase();
  if (url.includes("/api/me")) return json({ id: 1, first_name: "Test" });
  if (url.includes("/api/projects")) return json(PROJECTS);
  if (url.includes("/api/counts")) return json({ all: 42, inbox: INBOX.length, today: DAY_TASKS.length + OVERDUE.length, tomorrow: 0, next7: DAY_TASKS.length, overdue: OVERDUE.length });
  if (url.includes("/api/tags")) return json([]);
  if (url.includes("/api/tasks/density")) return json(HEAT);
  if (url.includes("/api/stages")) {
    const pid = Number(new URL(url, "http://x").searchParams.get("project_id"));
    return json(STAGES[pid] ?? []);
  }
  if (url.includes("/api/milestones")) return json([]);
  if (url.includes("/api/inbox")) return json(INBOX);
  if (url.includes("/api/habits")) return json(HABITS);
  if (url.includes("/api/metrics")) return json(METRICS);
  if (url.includes("/api/tracking/retro")) return json(RETRO);
  // detail: GET /api/tasks/{id} → один объект TaskDetailOut (вложенные массивы).
  // КРИТИЧНО: ДО общего /api/tasks, иначе catch-all вернёт массив → DETAIL.map краш.
  const detailMatch = url.match(/\/api\/tasks\/(\d+)(\?|$)/);
  if (detailMatch && m === "GET") {
    const id = Number(detailMatch[1]);
    const base = [...DAY_TASKS, ...OVERDUE].find((t) => t.id === id) ?? DAY_TASKS[0];
    return json({
      ...base,
      description: "Купить абонемент в бассейн на 3 месяца, уточнить расписание дорожек, взять справку от врача, не забыть шапочку и очки, проверить акции на сайте, сравнить с соседним клубом, спросить про заморозку абонемента.",
      checkitems: [
        { id: 501, task_id: id, title: "Шапочка", done: true, order_index: 0 },
        { id: 502, task_id: id, title: "Очки", done: false, order_index: 1 },
      ],
      reminders: [],
      subtasks: [
        { id: 601, title: "Купить абонемент", status: "todo", priority: "medium", project_id: base.project_id, due_date: TODAY, due_time: null },
        { id: 602, title: "Взять справку у врача", status: "todo", priority: "low", project_id: base.project_id, due_date: null, due_time: null },
      ],
      tags: [],
    });
  }
  if (url.includes("/api/tasks")) {
    if (url.includes("scope=overdue")) return json(OVERDUE);
    if (url.includes("on_date=") || url.includes("from=") || url.includes("scope=")) return json(DAY_TASKS);
    return json(DAY_TASKS);
  }
  if (m !== "GET") return json({ ok: true }); // мутации — заглушка
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>,
);
