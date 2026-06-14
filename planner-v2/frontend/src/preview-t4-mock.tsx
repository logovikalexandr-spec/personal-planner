import "./theme.css";
import { createRoot } from "react-dom/client";
import { Goals } from "./screens/Goals";
import type { AiNote, Project, Stage, Task } from "./types";

// ── Полноэкранный preview «Цели» (Goals) для гейта верности v2 ──
// Стаб fetch покрывает A1 пульс + A2-A8 карточки/кнопка + состояния.
// Сид совпадает с мокапом база-проекта-v3/pages/T4-celi.html (3 проекта · 2 в графике · 1 отстаёт).
// Параметры URL:
//   (нет)         happy — 3 цели
//   ?state=empty  нет целей (пустой стаб)
//   ?state=error  /api/projects падает (error-стаб + Повторить)

const params = new URLSearchParams(location.search);
const variant = params.get("state"); // empty | error | null

const stage = (
  id: number, project_id: number, name: string, status: Stage["status"], is_milestone = false,
): Stage => ({
  id, project_id, name, order_index: id, start_date: null, end_date: null,
  status, progress: status === "done" ? 100 : status === "current" ? 40 : 0,
  is_milestone, milestone_date: null, depends_on_ids: [],
});

const note = (date: string, type: AiNote["type"], text: string): AiNote => ({ date, type, text });

// hex-allowlist: цвета проектов (палитра-данные, не дизайн-токены)
const PROJECTS: Project[] = [
  {
    id: 1, name: "Продать студию ZIMA", slug: "zima", is_inbox: false, parent_id: null,
    open_count: 6, color: "#3FB68B", icon: null, pinned: false, order_index: 0,
    success_probability: 72, target_date: "2026-08-15", weeks_left: 9,
    ai_notes: [note("2026-06-14", "accelerate", "Ускорить: параллелить юр.проверку — выигрыш ~2 недели")],
  },
  {
    id: 2, name: "Закрыть протокол здоровья", slug: "health", is_inbox: false, parent_id: null,
    open_count: 5, color: "#5B8DEF", icon: null, pinned: false, order_index: 1,
    success_probability: 64, target_date: "2026-06-22", weeks_left: 1,
    ai_notes: [note("2026-06-14", "risk", "Отстаёшь: анализы не сданы — блокируют этап 2. Сдать до 15.06")],
  },
  {
    id: 3, name: "Запустить personal-planner v2", slug: "planner", is_inbox: false, parent_id: null,
    open_count: 8, color: "#9B6BE0", icon: null, pinned: false, order_index: 2,
    success_probability: 85, target_date: "2026-06-30", weeks_left: 2,
    ai_notes: [],
  },
];

const STAGES: Record<number, Stage[]> = {
  1: [
    stage(11, 1, "Оценка студии", "done"),
    stage(12, 1, "Подготовка пакета", "done"),
    stage(13, 1, "Переговоры с покупателем", "current", true),
    stage(14, 1, "Due diligence", "future"),
    stage(15, 1, "Сделка", "future", true),
  ],
  2: [
    stage(21, 2, "Базовые анализы", "done"),
    stage(22, 2, "Сдать расширенные анализы", "late", true),
    stage(23, 2, "Протокол добавок", "future"),
    stage(24, 2, "Контроль через месяц", "future"),
    stage(25, 2, "Закрепление", "future"),
  ],
  3: [
    stage(31, 3, "Фундамент: модель + петля", "current", true),
    stage(32, 3, "Экраны по мокапам", "future"),
    stage(33, 3, "Гант + Цели", "future"),
    stage(34, 3, "Привычки/метрики", "future"),
    stage(35, 3, "Полировка", "future"),
    stage(36, 3, "Релиз", "future", true),
  ],
};

const today = new Date();
const localISO = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
const TODAY = localISO(today);

// сегодня: 5 задач по целям (пульс A1 small). Неделя: 18 задач, 12 done.
const mk = (id: number, project_id: number, status: Task["status"], due_date: string): Task =>
  ({ id, title: `Задача ${id}`, status, priority: "none", project_id, due_date, due_time: null, end_time: null } as Task);

const DAY_TASKS: Task[] = [
  mk(101, 1, "todo", TODAY), mk(102, 1, "todo", TODAY), mk(103, 2, "todo", TODAY),
  mk(104, 3, "todo", TODAY), mk(105, 3, "todo", TODAY),
];
const RANGE_TASKS: Task[] = Array.from({ length: 18 }, (_, i) =>
  mk(200 + i, [1, 2, 3][i % 3], i < 12 ? "done" : "todo", TODAY));

const json = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
const boom = () => Promise.resolve(new Response("err", { status: 500 }));

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);

  if (url.includes("/api/projects")) {
    if (variant === "error") return boom();
    if (variant === "empty") return json([]);
    return json(PROJECTS);
  }
  if (url.includes("/api/stages")) {
    const pid = Number(new URL(url, "http://x").searchParams.get("project_id"));
    return json(STAGES[pid] ?? []);
  }
  if (url.includes("/api/tasks") && url.includes("on_date=")) return json(DAY_TASKS);
  if (url.includes("/api/tasks") && url.includes("from=")) return json(RANGE_TASKS);
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <div
    data-testid="screen-goals-host"
    style={{ width: 390, height: 844, background: "var(--bg)", overflow: "auto", position: "relative" }}
  >
    <Goals />
  </div>,
);
