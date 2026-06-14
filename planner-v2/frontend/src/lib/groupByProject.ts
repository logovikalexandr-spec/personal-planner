import type { Project, Task } from "../types";

export interface ProjectGroup {
  project: Project | null;
  tasks: Task[];
}

/** Группирует задачи по проекту. Проекты — по order_index (затем имя); «без проекта» (null
 *  или неизвестный id) — последней группой. Порядок задач внутри сохраняется. */
export function groupByProject(tasks: Task[], byId: Map<number, Project>): ProjectGroup[] {
  const groups = new Map<number | null, Task[]>();
  for (const t of tasks) {
    const key = t.project_id != null && byId.has(t.project_id) ? t.project_id : null;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }
  const withProject: ProjectGroup[] = [];
  let none: ProjectGroup | null = null;
  for (const [key, list] of groups) {
    if (key == null) none = { project: null, tasks: list };
    else withProject.push({ project: byId.get(key)!, tasks: list });
  }
  withProject.sort((a, b) =>
    (a.project!.order_index - b.project!.order_index) || a.project!.name.localeCompare(b.project!.name));
  return none ? [...withProject, none] : withProject;
}
