import "./theme.css";
import { createRoot } from "react-dom/client";
import { TaskDetail } from "./components/TaskDetail";
import type { Project, TaskDetail as TD } from "./types";

const PROJECTS: Project[] = [
  { id: 13, name: "Курсы", slug: "courses", is_inbox: false, parent_id: null, open_count: 1, color: "#3FB68B", icon: "📚", pinned: false, order_index: 0 },
];
const TASK: TD = {
  id: 28, title: "Тоо", project_id: 13, priority: "high", status: "todo",
  due_date: "2026-06-15", due_time: "08:00:00", end_date: null, end_time: "10:45:00",
  recurrence: null, reminder_at: null, description: null, parent_task_id: null,
  progress: 0, pinned: false, tags: [], checkitems: [], reminders: [], subtasks: [],
} as unknown as TD;

const json = (d: unknown) => Promise.resolve(new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
const orig = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  if (url.includes("/api/projects")) return json(PROJECTS);
  if (url.match(/\/api\/tasks\/\d+$/)) return json(TASK);
  return orig(input as RequestInfo, init);
}) as typeof window.fetch;

createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390, height: 844, background: "var(--bg)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
    <TaskDetail taskId={28} onClose={() => {}} onChanged={() => {}} />
  </div>,
);
