import type { Project } from "../types";

/** Цвет проекта с наследованием от родителя (до 8 уровней вверх). null = нет цвета. */
export function resolveColor(projectId: number | null | undefined, byId: Map<number, Project>): string | null {
  let cur = projectId != null ? byId.get(projectId) : undefined;
  let g = 0;
  while (cur && g++ < 8) {
    if (cur.color) return cur.color;
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

/** Цвет приоритета (канта блока недели/строки). null = без полосы (приоритет none). */
export function priorityColor(p: string): string | null {
  if (p === "high") return "var(--danger)";
  if (p === "medium") return "var(--warning)";
  if (p === "low") return "var(--accent)";
  return null;
}

/** rgba-тинт из hex-цвета проекта (для подложки блока/бейджа). */
export function tint(hex: string | null, alpha = 0.14): string {
  if (!hex) return "rgba(255,255,255,0.04)";
  const h = hex.replace("#", "");
  if (h.length !== 6) return "rgba(255,255,255,0.04)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
