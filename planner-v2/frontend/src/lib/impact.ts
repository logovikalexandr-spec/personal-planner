import type { Task } from "../types";

export const IMPACT_THRESHOLD = 30;

/** Токен вклада виден только у заметных задач (>=порог), привязанных к проекту/цели.
 *  Быт/инбокс/мелочь без impact или без привязки — токена нет (список не пухнет). */
export function shouldShowImpact(task: Task): boolean {
  if (task.impact == null) return false;
  if (task.impact < IMPACT_THRESHOLD) return false;
  return task.project_id != null || task.stage_id != null;
}
