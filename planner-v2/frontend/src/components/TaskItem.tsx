import type { Task } from "../types";

export function TaskItem({ task, onToggle, color }: { task: Task; onToggle: (t: Task) => void; color?: string | null }) {
  const done = task.status === "done";
  // Единый источник канта: приоритет важнее цвета проекта (визуал-спека §4, решение CEO #4).
  // Если priority !== "none" → класс .prio-* (box-shadow inset), цвет проекта НЕ рисуем.
  // Иначе, если есть цвет проекта → inline borderLeft. Никогда не оба сразу.
  const prio =
    task.priority === "high" ? "prio-high"
    : task.priority === "medium" ? "prio-medium"
    : task.priority === "low" ? "prio-low"
    : "";
  const showProjectKant = prio === "" && !!color;
  return (
    <div
      className={`task-row ${prio}`}
      style={showProjectKant ? { borderLeft: `3px solid ${color}`, paddingLeft: "calc(var(--s4) - 3px)" } : undefined}
    >
      <div className={`checkbox ${done ? "done" : ""}`} onClick={() => onToggle(task)} role="button" aria-label="done">
        {done ? "✓" : ""}
      </div>
      <div className="grow">
        <div className={done ? "title-done" : ""}>{task.title}</div>
        {(task.due_date || task.due_time) && (
          <div className="muted mono" style={{ fontSize: 13, marginTop: 2 }}>
            {task.due_date ?? ""} {task.due_time ?? ""}
          </div>
        )}
      </div>
    </div>
  );
}
