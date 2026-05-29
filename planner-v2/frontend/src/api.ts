import { tg } from "./telegram";
import type { Counts, InboxItem, Priority, Project, Task } from "./types";

function initData(): string { return tg()?.initData ?? ""; }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData(), ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

async function reqVoid(path: string, init?: RequestInit): Promise<void> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData(), ...(init?.headers ?? {}) },
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
export const getCounts = () => req<Counts>("/api/counts");
export const getTasks = (scope = "all", projectId?: number, includeChildren = false) =>
  req<Task[]>(
    `/api/tasks?scope=${scope}` +
      (projectId ? `&project_id=${projectId}` : "") +
      (includeChildren ? `&include_children=true` : ""),
  );
export const createTask = (
  title: string,
  opts: Partial<Pick<Task, "project_id" | "priority" | "due_date">> = {},
) => req<Task>("/api/tasks", { method: "POST", body: JSON.stringify({ title, ...opts }) });
export const patchTask = (id: number, patch: { status?: string; priority?: Priority; project_id?: number }) =>
  req<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const getInbox = () => req<InboxItem[]>("/api/inbox");
export const triageInbox = (id: number, projectId: number, title: string, priority: Priority = "none") =>
  req<Task>(`/api/inbox/${id}/triage`, { method: "POST", body: JSON.stringify({ project_id: projectId, title, priority }) });
