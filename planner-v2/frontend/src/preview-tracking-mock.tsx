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
const RETRO = { week_start: "2026-06-08", week_end: "2026-06-14", habits: 3, done_days: 14, total_days: 21 };

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  if (url.includes("/api/habits")) return json(HABITS);
  if (url.includes("/api/metrics")) return json(METRICS);
  if (url.includes("/api/tracking/retro")) return json(RETRO);
  return orig(input as RequestInfo);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390, height: 844, position: "relative", background: "var(--bg)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 90 }}>
      <Tracking />
    </div>
    <BottomTabs active="tracking" onChange={() => {}} inboxCount={0} />
  </div>,
);
