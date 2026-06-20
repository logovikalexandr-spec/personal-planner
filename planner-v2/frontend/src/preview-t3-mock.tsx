import "./theme.css";
import { createRoot } from "react-dom/client";
import { Gantt } from "./screens/Gantt";
import type { Project, Stage, Task } from "./types";

// ── Полноэкранный preview «Гант» (T3) для гейта верности v2 ──
// Стаб fetch (projects + stages/проект + tasks/проект). Покрывает T3a (Все) + T3b (По проекту) + состояния.
// URL: (нет)=happy · ?state=empty (нет проектов) · ?state=nostages · ?state=error
const params = new URLSearchParams(location.search);
const stateParam = params.get("state");

function pr(id: number, name: string, slug: string, color: string, target: string | null): Project {
  return { id, name, slug, is_inbox: false, parent_id: null, open_count: 0, color, icon: null, pinned: false, order_index: id, target_date: target };
}
function st(p: Partial<Stage> & { id: number; project_id: number; name: string; order_index: number }): Stage {
  return {
    id: p.id, project_id: p.project_id, name: p.name, order_index: p.order_index,
    start_date: p.start_date ?? null, end_date: p.end_date ?? null,
    status: p.status ?? "future", progress: p.progress ?? 0,
    is_milestone: p.is_milestone ?? false, milestone_date: p.milestone_date ?? null,
    depends_on_ids: p.depends_on_ids ?? [],
  };
}

// hex-allowlist (preview-фикстура): цвета проектов
const ZIMA = pr(1, "ZIMA", "zima", "#3FB68B", "2026-08-15");
const HEALTH = pr(2, "Здоровье", "health", "#5B8DEF", "2026-06-22");
const PLAN = pr(3, "planner v2", "plan", "#9B6BE0", null);
const NOSTAGES = pr(4, "Продать ZIMA", "zima", "#3FB68B", "2026-08-15");

const STAGES: Record<number, Stage[]> = {
  1: [
    st({ id: 11, project_id: 1, name: "Оценка и упаковка", order_index: 0, status: "done", start_date: "2026-06-01", end_date: "2026-06-05" }),
    st({ id: 12, project_id: 1, name: "Поиск покупателей", order_index: 1, status: "done", start_date: "2026-06-05", end_date: "2026-06-12", depends_on_ids: [11] }),
    st({ id: 13, project_id: 1, name: "Переговоры", order_index: 2, status: "current", progress: 60, start_date: "2026-06-12", end_date: "2026-06-28", depends_on_ids: [12] }),
    st({ id: 14, project_id: 1, name: "Договор + юр.проверка", order_index: 3, status: "future", start_date: "2026-06-28", end_date: "2026-07-20", depends_on_ids: [13] }),
    st({ id: 15, project_id: 1, name: "Передача", order_index: 4, status: "future", start_date: "2026-07-20", end_date: "2026-08-12", depends_on_ids: [14] }),
    st({ id: 16, project_id: 1, name: "Сделка закрыта", order_index: 5, status: "future", is_milestone: true, milestone_date: "2026-08-15" }),
  ],
  2: [
    st({ id: 21, project_id: 2, name: "Базовые анализы", order_index: 0, status: "done", start_date: "2026-06-01", end_date: "2026-06-06" }),
    st({ id: 22, project_id: 2, name: "Протокол", order_index: 1, status: "late", start_date: "2026-06-06", end_date: "2026-06-20", depends_on_ids: [21] }),
    st({ id: 23, project_id: 2, name: "Дедлайн анализов", order_index: 2, status: "future", is_milestone: true, milestone_date: "2026-06-22" }),
  ],
  3: [
    st({ id: 31, project_id: 3, name: "Волна 1", order_index: 0, status: "current", progress: 35, start_date: "2026-06-01", end_date: "2026-06-14" }),
    st({ id: 32, project_id: 3, name: "Волна 2", order_index: 1, status: "future", start_date: "2026-06-20", end_date: "2026-07-05", depends_on_ids: [31] }),
  ],
  4: [],
};

const TASKS: Record<number, Task[]> = {
  1: [
    { id: 101, title: "Подготовить презентацию", status: "done", priority: "medium", project_id: 1, due_date: "2026-06-12", due_time: null, end_date: "2026-06-15", end_time: null, stage_id: 13 } as Task,
    { id: 102, title: "Согласовать цену", status: "todo", priority: "high", project_id: 1, due_date: "2026-06-16", due_time: null, end_date: "2026-06-18", end_time: null, stage_id: 13 } as Task,
    { id: 103, title: "Получить депозит", status: "todo", priority: "medium", project_id: 1, due_date: "2026-06-20", due_time: null, end_date: "2026-06-22", end_time: null, stage_id: 13 } as Task,
  ],
};

function projectsForState(): Project[] {
  if (stateParam === "empty") return [];
  if (stateParam === "nostages") return [NOSTAGES];
  return [ZIMA, HEALTH, PLAN];
}

const json = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
const fail = () => Promise.resolve(new Response("err", { status: 500 }));

const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  if (stateParam === "error" && url.includes("/api/projects")) return fail();
  if (url.includes("/api/projects")) return json(projectsForState());
  if (url.includes("/api/stages")) {
    const pid = Number(new URL(url, location.origin).searchParams.get("project_id"));
    return json(STAGES[pid] ?? []);
  }
  if (url.includes("/api/tasks")) {
    const pid = Number(new URL(url, location.origin).searchParams.get("project_id"));
    return json(TASKS[pid] ?? []);
  }
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <div data-testid="screen-gantt" style={{ width: 390, height: 844, background: "var(--bg)", overflow: "auto", position: "relative" }}>
    <Gantt />
  </div>,
);
