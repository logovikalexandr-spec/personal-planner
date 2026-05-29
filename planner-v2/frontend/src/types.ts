export type Priority = "none" | "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";

export interface Task {
  id: number; title: string; project_id: number | null;
  priority: Priority; status: TaskStatus; due_date: string | null; due_time: string | null;
}
export interface Project {
  id: number; name: string; slug: string; is_inbox: boolean;
  parent_id: number | null; open_count: number; color?: string | null;
}
export interface Counts { all: number; today: number; tomorrow: number; next7: number; inbox: number; }

export type SmartKey = "all" | "today" | "tomorrow" | "next7" | "week" | "inbox";
export type ActiveList =
  | { kind: "smart"; key: SmartKey; title: string }
  | { kind: "project"; id: number; title: string };

export interface InboxItem { id: number; kind: string; source: string; raw_content: string; status: string; }
