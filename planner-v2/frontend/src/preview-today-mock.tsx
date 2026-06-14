import "./theme.css";
import { createRoot } from "react-dom/client";
import { DayTimeline } from "./components/DayTimeline";
import type { Project, Task } from "./types";

// Превью реального таймлайна с задачами «как в мокапе»: метка этапа + токен вклада %.
const projects: Project[] = [
  { id: 1, name: "ZIMA", color: "#3FB68B" } as Project,
  { id: 2, name: "Здоровье", color: "#5B8DEF" } as Project,
];
const byId = new Map(projects.map((p) => [p.id, p]));

const fullTasks: Task[] = [
  {
    id: 1, title: "Созвон с командой ZIMA", status: "todo", priority: "medium",
    project_id: 1, due_time: "09:00:00", end_time: "10:00:00",
    stage_id: 3, stage_label: "этап 3", stage_status: "current", impact: 80,
  } as Task,
  {
    id: 2, title: "Анализы — сдать кровь", status: "todo", priority: "high",
    project_id: 2, due_time: "11:00:00", end_time: "11:30:00",
    stage_id: 1, stage_label: "этап 1", stage_status: "late", impact: 45,
  } as Task,
];

// Состояние для гейта: ?state=empty → пустой таймлайн; иначе happy-path.
const state = new URLSearchParams(location.search).get("state");
const tasks: Task[] = state === "empty" ? [] : fullTasks;

createRoot(document.getElementById("root")!).render(
  <div data-testid="screen-today" data-state={state ?? "happy"} style={{ width: 390, height: 844, background: "var(--bg)", overflow: "auto" }}>
    <DayTimeline tasks={tasks} byId={byId} isToday onToggle={() => {}} />
  </div>,
);
