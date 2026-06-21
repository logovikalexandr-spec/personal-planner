import type { Project, Task } from "../types";
import { flatten } from "./projectTree";

// ЕДИНЫЙ источник сортировки/порядка задач (смарт-списки, all-day Today и т.п.).
// Дублировать по экранам нельзя — иначе порядок «криво» расходится между видами.

export const PRIO_RANK: Record<Task["priority"], number> = { high: 3, medium: 2, low: 1, none: 0 };

/** Сорт внутри группы: приоритет ↓, дата ↑ (старше сверху), время ↑, id (стабильный тайбрейк). */
export function cmpSmartTask(a: Task, b: Task): number {
  const pr = PRIO_RANK[b.priority] - PRIO_RANK[a.priority];
  if (pr) return pr;
  const da = a.due_date ?? "9999-99-99", db = b.due_date ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.due_time ?? "99:99", tb = b.due_time ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id - b.id;
}

/** Ранг проекта = порядок обхода дерева как в шторке (pinned → order_index → name, родитель перед детьми). */
export function projectRankMap(byId: Map<number, Project>): Map<number, number> {
  const all = [...byId.values()].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.order_index - b.order_index || a.name.localeCompare(b.name),
  );
  const rank = new Map<number, number>();
  flatten(all).forEach((p, i) => rank.set(p.id, i));
  return rank;
}

/** Плоский сорт «как развёрнутый смарт-список»: проект (порядок шторки) → cmpSmartTask.
 *  Задачи без проекта — в конец. Для плоских списков (all-day чипы), где группы не рисуются. */
export function cmpTaskGrouped(rank: Map<number, number>): (a: Task, b: Task) => number {
  return (a, b) => {
    const ra = a.project_id != null ? (rank.get(a.project_id) ?? 1e9) : 1e9;
    const rb = b.project_id != null ? (rank.get(b.project_id) ?? 1e9) : 1e9;
    if (ra !== rb) return ra - rb;
    return cmpSmartTask(a, b);
  };
}
