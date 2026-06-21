import { authHeaders } from "./lib/auth";
import { clientToday } from "./lib/clientDate";
import type {
  AiNote, CheckItem, Counts, HabitInput, HabitOut, InboxItem, MetricInput, MetricOut,
  Milestone, Priority, Project, RecurrenceJson,
  Reminder, ReminderInput, Stage, Tag, Task, TaskDetail,
} from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

async function reqVoid(path: string, init?: RequestInit): Promise<void> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
}

export type ProjectInput = { parent_id?: number | null; color?: string | null; icon?: string | null };

export const getMe = () => req<{ id: number; first_name: string | null }>("/api/me");
export const getProjects = () => req<Project[]>("/api/projects");
export const createProject = (name: string, opts: ProjectInput = {}) =>
  req<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, ...opts }) });
export const patchProject = (
  id: number,
  patch: Partial<{ name: string; parent_id: number | null; color: string | null; icon: string | null; pinned: boolean; order_index: number }>,
) => req<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteProject = (id: number) => reqVoid(`/api/projects/${id}`, { method: "DELETE" });
export const reorderProjects = (items: { id: number; parent_id: number | null; order_index: number }[]) =>
  reqVoid("/api/projects/order", { method: "PUT", body: JSON.stringify(items) });
// Форк 0: AI-слой проекта-цели — пишет human-in-loop Claude (ZERO-AFK, бэк LLM не зовёт).
export type ProjectAiInput = {
  success_probability?: number | null;
  target_date?: string | null;
  ai_notes?: AiNote[] | null;
};
export const updateProjectAI = (id: number, ai: ProjectAiInput) =>
  req<Project>(`/api/projects/${id}/ai`, { method: "PUT", body: JSON.stringify(ai) });
// Форк 0: этапы проекта (T4 полоски, T4d этапы, Гант). status done|current|future|late.
export const getStages = (projectId: number) =>
  req<Stage[]>(`/api/stages?project_id=${projectId}`);
export const getCounts = () => req<Counts>(`/api/counts?today=${clientToday()}`);
export const getTasks = (scope = "all", projectId?: number, includeChildren = false) =>
  req<Task[]>(
    `/api/tasks?scope=${scope}&today=${clientToday()}` +
      (projectId ? `&project_id=${projectId}` : "") +
      (includeChildren ? `&include_children=true` : ""),
  );
export const getDayTasks = (date: string) => req<Task[]>(`/api/tasks?on_date=${date}`);
// T1·B датапикер: тепло-нагрузка дней окна {iso: 'g'|'y'|'r'} (heat B2).
export const getDensity = (from: string, to: string) =>
  req<Record<string, "g" | "y" | "r">>(`/api/tasks/density?from=${from}&to=${to}`);
// Форк B (календарь): задачи в окне дат [from,to] включительно (с done, без archived).
export const getTasksRange = (from: string, to: string) =>
  req<Task[]>(`/api/tasks?from=${from}&to=${to}`);
// Форк B: вехи (Stage.is_milestone) в окне по всем проектам — флажки календаря.
export const getMilestones = (from: string, to: string) =>
  req<Milestone[]>(`/api/milestones?from=${from}&to=${to}`);
export const getSubtasks = (parentId: number) => req<Task[]>(`/api/tasks?parent_task_id=${parentId}`);

export interface TaskInput {
  project_id?: number | null;
  priority?: Priority;
  due_date?: string | null;
  due_time?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  description?: string | null;
  reminder_at?: string | null;
  recurrence?: string | null;
  parent_task_id?: number | null;
  tag_ids?: number[];
}

export const createTask = (title: string, opts: TaskInput = {}) =>
  req<Task>("/api/tasks", { method: "POST", body: JSON.stringify({ title, ...opts }) });

// Волна 2 §2: PATCH принимает любое подмножество, включая структурный повтор / pinned / progress / title.
export type TaskPatchInput = Partial<
  { status: string; title: string; pinned: boolean; progress: number; recurrence_json: RecurrenceJson | null } & TaskInput
>;
export const patchTask = (id: number, patch: TaskPatchInput) =>
  req<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

// Волна 2 §2: GET /tasks/{id} → TaskDetail (checkitems + reminders + subtasks + progress).
export const getTaskDetail = (id: number) => req<TaskDetail>(`/api/tasks/${id}`);

// Волна 2 §2: при status:'done' + recurrence_json сервис генерирует следующий экземпляр → {task, next_task?}.
export const completeTask = (id: number) =>
  req<{ task: Task; next_task?: Task | null }>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
  });

export const deleteTask = (id: number) => reqVoid(`/api/tasks/${id}`, { method: "DELETE" });

// Волна 2 §2: CheckItems CRUD.
export const createCheckItem = (taskId: number, title: string) =>
  req<CheckItem>(`/api/tasks/${taskId}/checkitems`, { method: "POST", body: JSON.stringify({ title }) });
export const patchCheckItem = (
  id: number,
  patch: Partial<{ title: string; done: boolean; order_index: number }>,
) => req<CheckItem>(`/api/checkitems/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteCheckItem = (id: number) => reqVoid(`/api/checkitems/${id}`, { method: "DELETE" });

// Волна 2 §2: PUT заменяет весь набор напоминаний задачи, возвращает Reminder[].
export const putReminders = (taskId: number, reminders: ReminderInput[]) =>
  req<Reminder[]>(`/api/tasks/${taskId}/reminders`, {
    method: "PUT",
    body: JSON.stringify({ reminders }),
  });

export const getTags = () => req<Tag[]>("/api/tags");
export const createTag = (name: string, color?: string | null) =>
  req<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name, color }) });
export const getInbox = () => req<InboxItem[]>("/api/inbox");
export const triageInbox = (id: number, projectId: number, title: string, priority: Priority = "none") =>
  req<Task>(`/api/inbox/${id}/triage`, { method: "POST", body: JSON.stringify({ project_id: projectId, title, priority }) });

// ── Форк E: привычки + метрики ──
export const getHabits = (on?: string) =>
  req<HabitOut[]>(`/api/habits${on ? `?on=${on}` : ""}`);
export const createHabit = (data: HabitInput) =>
  req<HabitOut>("/api/habits", { method: "POST", body: JSON.stringify(data) });
export const deleteHabit = (id: number) => reqVoid(`/api/habits/${id}`, { method: "DELETE" });
export const patchHabit = (id: number, patch: Partial<HabitInput> & { color?: string; archived?: boolean }) =>
  req<HabitOut>(`/api/habits/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const toggleHabit = (id: number, date: string) =>
  req<HabitOut>(`/api/habits/${id}/toggle`, { method: "POST", body: JSON.stringify({ date }) });
export const addHabit = (id: number, date: string, delta: number) =>
  req<HabitOut>(`/api/habits/${id}/add`, { method: "POST", body: JSON.stringify({ date, delta }) });
export const backfillHabit = (id: number, date: string, value: number) =>
  req<HabitOut>(`/api/habits/${id}/backfill`, { method: "POST", body: JSON.stringify({ date, value }) });

// История привычки для деталь-экрана: % за 30 дней + дни месяца с уровнем зачёта (0-4).
export interface HabitHistoryOut {
  month: string;                                   // YYYY-MM
  pct30: number;                                   // 0..1 — доля зачётов за 30 дней
  days: { date: string; level: number }[];         // дни месяца с зачётом (level 1-4)
}
export const getHabitHistory = (id: number, month: string) =>
  req<HabitHistoryOut>(`/api/habits/${id}/history?month=${month}`);

export const getMetrics = () => req<MetricOut[]>("/api/metrics");
export const createMetric = (data: MetricInput) =>
  req<MetricOut>("/api/metrics", { method: "POST", body: JSON.stringify(data) });
export const deleteMetric = (id: number) => reqVoid(`/api/metrics/${id}`, { method: "DELETE" });
export const measureMetric = (id: number, date: string, value: number) =>
  req<MetricOut>(`/api/metrics/${id}/measure`, { method: "POST", body: JSON.stringify({ date, value }) });
export const patchMetric = (id: number, patch: Partial<MetricInput>) =>
  req<MetricOut>(`/api/metrics/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteMetricEntry = (id: number, date: string) =>
  req<MetricOut>(`/api/metrics/${id}/entries?date=${date}`, { method: "DELETE" });

export interface RetroProjectRow { project_id: number | null; name: string; color: string; done: number; total: number; }
export type RetroOverdue = Task & { project: string | null; color: string | null; days_late: number; };
export interface RetroHabitRow { id: number; name: string; color: string; week: boolean[]; week_done: number; streak: number; tag: string | null; }
export interface RetroOut {
  week_start: string; week_end: string;
  tasks: {
    done: number; planned: number; impact_sum: number;
    by_project: RetroProjectRow[]; overdue: RetroOverdue[];
    top_task: { title: string; impact: number; project: string | null } | null;
  };
  habits: { done_days: number; total_days: number; count: number; items: RetroHabitRow[]; };
}
export const getRetro = (weekStart?: string) =>
  req<RetroOut>(`/api/tracking/retro${weekStart ? `?week_start=${weekStart}` : ""}`);

// ── Workout-лог (Волна 1) ───────────────────────────────────────────────────
export type ApiTemplateEx = { id: number; exercise_id: number; order_index: number; target_sets: number; rep_low: number; rep_high: number; coach_target_weight: number | null };
export type ApiTemplate = { id: number; project_id: number; name: string; order_index: number; exercises: ApiTemplateEx[] };
export type ApiExercise = { id: number; name: string; muscle_group: string; default_rep_low: number | null; default_rep_high: number | null; order_index: number };
export type ApiSet = { id?: number; exercise_id: number; set_index: number; weight: number; reps: number; rpe: number | null; is_warmup: boolean; done: boolean; note: string | null };
export type ApiSession = { id: number; project_id: number; template_id: number | null; stage_id: number | null; date: string; review_note: string | null; coach_note: string | null; duration_minutes: number | null; completed: boolean; sets: ApiSet[] };
export type ApiHistPoint = { date: string; top_1rm: number; best_set: { weight: number; reps: number }; total_volume: number };

export const wGetExercises = () => req<ApiExercise[]>("/api/exercises");
export const wGetTemplates = (pid: number) => req<ApiTemplate[]>(`/api/projects/${pid}/workout-templates`);
export const wGetWorkouts = (pid: number) => req<ApiSession[]>(`/api/projects/${pid}/workouts`);
export const wCreateWorkout = (pid: number, date: string, templateId?: number | null) =>
  req<ApiSession>("/api/workouts", { method: "POST", body: JSON.stringify({ project_id: pid, date, template_id: templateId ?? null }) });
export const wPutSets = (sid: number, sets: Partial<ApiSet>[]) =>
  req<ApiSession>(`/api/workouts/${sid}/sets`, { method: "PUT", body: JSON.stringify({ sets }) });
export const wComplete = (sid: number, reviewNote?: string, durationMinutes?: number) =>
  req<ApiSession>(`/api/workouts/${sid}/complete`, { method: "POST", body: JSON.stringify({ review_note: reviewNote ?? null, duration_minutes: durationMinutes ?? null }) });
export const wCancel = (sid: number) => reqVoid(`/api/workouts/${sid}`, { method: "DELETE" });
export const wHistory = (exId: number) => req<ApiHistPoint[]>(`/api/exercises/${exId}/history`);
export const wLastSets = (exId: number) => req<{ weight: number; reps: number; rpe: number | null }[]>(`/api/exercises/${exId}/last-sets`);
