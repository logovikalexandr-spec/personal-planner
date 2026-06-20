import "./theme.css";
import { createRoot } from "react-dom/client";
import { Tracking } from "./screens/Tracking";
import { BottomTabs } from "./components/BottomTabs";

// Изолированный mock-preview Форка E: патчим fetch sample-данными (бэк не нужен),
// чтобы визуально сверить рабочий экран с мокапом T5-habits.html. НЕ прод.

const HABITS = [
  { id: 1, name: "Зарядка + валик", color: "#5B8DEF", mark_type: "check", target: null, unit: null, step: null,
    schedule_kind: "daily", schedule_n: null, schedule_days: null, goal_date: null, goal_total: null,
    record_streak: 21, archived: false, order_index: 0, today_value: 1, done_today: true, streak: 12,
    week: [true, true, true, true, true, false, false], heat7: [4, 4, 3, 4, 4, 1, 0] },
  { id: 2, name: "Вода 2л", color: "#3FB68B", mark_type: "count", target: 2, unit: "л", step: 0.5,
    schedule_kind: "daily", schedule_n: null, schedule_days: null, goal_date: null, goal_total: null,
    record_streak: 9, archived: false, order_index: 1, today_value: 1.0, done_today: false, streak: 4,
    week: [true, true, true, false, true, false, false], heat7: [1, 2, 1, 0, 2, 1, 0] },
  { id: 3, name: "Без травы", color: "#9B6BE0", mark_type: "check", target: null, unit: null, step: null,
    schedule_kind: "goal_date", schedule_n: null, schedule_days: null, goal_date: "2026-06-22", goal_total: 16,
    record_streak: 8, archived: false, order_index: 2, today_value: 1, done_today: true, streak: 8,
    week: [true, true, true, true, true, true, true], heat7: [4, 4, 4, 4, 4, 4, 4] },
];
const METRICS = [
  { id: 1, name: "Вес", unit: "кг", good_direction: "down", color: "#3FB68B", archived: false, order_index: 0,
    latest: 78.2, delta: -0.4, entries: [
      { entry_date: "2026-06-11", value: 78.2 }, { entry_date: "2026-06-10", value: 78.6 },
      { entry_date: "2026-06-09", value: 78.4 }, { entry_date: "2026-06-08", value: 78.9 }] },
  { id: 2, name: "Сон", unit: "ч", good_direction: "up", color: "#5B8DEF", archived: false, order_index: 1,
    latest: 6.8, delta: 0.5, entries: [
      { entry_date: "2026-06-11", value: 6.8 }, { entry_date: "2026-06-10", value: 6.3 },
      { entry_date: "2026-06-09", value: 7.1 }, { entry_date: "2026-06-08", value: 6.0 }] },
];
const RETRO = {
  week_start: "2026-06-08", week_end: "2026-06-14",
  tasks: {
    done: 12, planned: 18, impact_sum: 185,
    by_project: [
      { project_id: 1, name: "ZIMA", color: "#3FB68B", done: 5, total: 7 },
      { project_id: 2, name: "Здоровье", color: "#5B8DEF", done: 4, total: 5 },
      { project_id: 3, name: "Финансы", color: "#E0B15B", done: 3, total: 4 },
      { project_id: 4, name: "Планировщик", color: "#9B6BE0", done: 0, total: 2 },
    ],
    overdue: [
      { id: 11, title: "Отправить документы бухгалтеру", status: "todo", priority: "high",
        project_id: 3, due_date: "2026-06-02", due_time: "14:00:00", impact: 55,
        project: "Финансы", color: "#E0B15B", days_late: 9 },
      { id: 12, title: "Записаться к стоматологу", status: "todo", priority: "medium",
        project_id: 2, due_date: "2026-06-03", project: "Здоровье", color: "#5B8DEF", days_late: 8 },
    ],
    top_task: { title: "Согласовать цену", impact: 80, project: "ZIMA" },
  },
  habits: {
    done_days: 14, total_days: 21, count: 3,
    items: [
      { id: 1, name: "Зарядка + валик", color: "#5B8DEF", week: [true, true, true, true, true, false, false], week_done: 5, streak: 12, tag: "рекорд 12" },
      { id: 3, name: "Без травы", color: "#3FB68B", week: [true, true, true, true, true, true, true], week_done: 7, streak: 8, tag: "цель близко" },
      { id: 2, name: "Вода 2л", color: "#3FB68B", week: [true, true, true, false, true, false, false], week_done: 4, streak: 4, tag: "слабое" },
    ],
  },
};

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  const histMatch = url.match(/\/api\/habits\/(\d+)\/history\?month=(\d{4})-(\d{2})/);
  if (histMatch) {
    const year = +histMatch[2], mon = +histMatch[3];
    const now = new Date();
    const isCur = now.getFullYear() === year && now.getMonth() + 1 === mon;
    const last = isCur ? now.getDate() : new Date(year, mon, 0).getDate();
    const days: { date: string; level: number }[] = [];
    for (let d = 1; d <= last; d++) {
      if (d % 7 === 3) continue; // дырки в стрике для наглядности
      days.push({ date: `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`, level: ((d * 3) % 4) + 1 });
    }
    return json({ month: `${year}-${String(mon).padStart(2, "0")}`, pct30: 0.72, days });
  }
  const habitOp = url.match(/\/api\/habits\/(\d+)(\/(toggle|add|backfill))?(\?|$)/);
  if (habitOp) { const h = HABITS.find((x) => x.id === +habitOp[1]); if (h) return json(h); }
  if (url.includes("/api/habits")) return json(HABITS);
  const metricOp = url.match(/\/api\/metrics\/(\d+)(\/measure|\/entries)?/);
  if (metricOp) { const m = METRICS.find((x) => x.id === +metricOp[1]); if (m) return json(m); }
  if (url.includes("/api/metrics")) return json(METRICS);
  if (url.includes("/api/tracking/retro")) return json(RETRO);
  return orig(input as RequestInfo);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
    <div style={{ paddingBottom: 20 }}>
      <Tracking />
    </div>
    <BottomTabs active="tracking" onChange={() => {}} />
  </div>,
);
