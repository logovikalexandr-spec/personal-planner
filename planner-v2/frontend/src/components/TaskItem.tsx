import type { Task } from "../types";

export function TaskItem({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  const done = task.status === "done";
  const prioClass =
    task.priority === "high" ? "prio-high" : task.priority === "medium" ? "prio-medium" : task.priority === "low" ? "prio-low" : "";
  return (
    <div className={`card row ${prioClass}`}>
      <div
        className={`checkbox ${done ? "done" : ""}`}
        onClick={() => onToggle(task)}
        role="button"
        aria-label="toggle done"
      >
        {done ? "v" : ""}
      </div>
      <div className="grow">
        <div className={done ? "title-done" : ""}>{task.title}</div>
        {(task.due_date || task.due_time) && (
          <div className="muted mono" style={{ fontSize: 13 }}>
            {task.due_date ?? ""} {task.due_time ?? ""}
          </div>
        )}
      </div>
    </div>
  );
}
