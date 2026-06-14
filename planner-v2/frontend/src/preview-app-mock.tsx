import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
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
  { id: 99, name: "Входящие", slug: "inbox", is_inbox: true, parent_id: null, open_count: 1, color: null, icon: null, pinned: false, order_index: 99 },
];

const DAY_TASKS: Task[] = [
  { id: 1, title: "Созвон с командой ZIMA", status: "todo", priority: "medium", project_id: 1, due_date: TODAY, due_time: "09:00:00", end_time: "10:00:00", stage_label: "этап 3", stage_status: "current", impact: 80 } as Task,
  { id: 2, title: "Анализы — сдать кровь", status: "todo", priority: "high", project_id: 2, due_date: TODAY, due_time: "11:00:00", end_time: "11:30:00", stage_label: "этап 1", stage_status: "late", impact: 45 } as Task,
  { id: 3, title: "Оплатить аренду", status: "todo", priority: "high", project_id: 1, due_date: TODAY, due_time: null, end_time: null } as Task,
  { id: 4, title: "Позвонить маме", status: "todo", priority: "none", project_id: 2, due_date: TODAY, due_time: null, end_time: null } as Task,
];
const OVERDUE: Task[] = [
  { id: 90, title: "Просроченный отчёт", status: "todo", priority: "high", project_id: 3, due_date: "2026-06-01", due_time: null, end_date: null, end_time: null, days_late: 9 } as Task,
];
const HEAT: Record<string, "g" | "y" | "r"> = {
  [TODAY]: "g", "2026-06-04": "r", "2026-06-09": "y", "2026-06-11": "g", "2026-06-12": "r", "2026-06-18": "r",
};

const HABITS = [
  { id: 1, name: "Зарядка + валик", color: "#5B8DEF", mark_type: "check", target: null, unit: null, step: null, done_today: true, streak: 12, week: [true, true, true, true, true, false, false], week_done: 5, today_value: 1, heat_level: 4 },
  { id: 2, name: "Вода 2л", color: "#3FB68B", mark_type: "count", target: 2, unit: "л", step: 0.5, done_today: false, streak: 4, week: [true, true, true, false, true, false, false], week_done: 4, today_value: 1, heat_level: 2 },
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
const INBOX = [{ id: 1, raw_text: "Купить подарок маме", created_at: TODAY, suggested_project_id: 2 }];

const json = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  const m = (init?.method ?? "GET").toUpperCase();
  if (url.includes("/api/me")) return json({ id: 1, first_name: "Test" });
  if (url.includes("/api/projects")) return json(PROJECTS);
  if (url.includes("/api/counts")) return json({ inbox: 1, today: DAY_TASKS.length, overdue: OVERDUE.length });
  if (url.includes("/api/tags")) return json([]);
  if (url.includes("/api/tasks/density")) return json(HEAT);
  if (url.includes("/api/milestones")) return json([]);
  if (url.includes("/api/inbox")) return json(INBOX);
  if (url.includes("/api/habits")) return json(HABITS);
  if (url.includes("/api/metrics")) return json(METRICS);
  if (url.includes("/api/tracking/retro")) return json(RETRO);
  if (url.includes("/api/tasks")) {
    if (url.includes("scope=overdue")) return json(OVERDUE);
    if (url.includes("on_date=") || url.includes("from=") || url.includes("scope=")) return json(DAY_TASKS);
    return json(DAY_TASKS);
  }
  if (m !== "GET") return json({ ok: true }); // мутации — заглушка
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
