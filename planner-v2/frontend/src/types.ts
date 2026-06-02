export type Priority = "none" | "low" | "medium" | "high";
// Волна 2: + "wont_do" (Won't Do — закрыта без выполнения). done_at ставится и для done, и для wont_do.
export type TaskStatus = "todo" | "in_progress" | "done" | "wont_do" | "archived";

export interface Tag { id: number; name: string; color?: string | null; }

// Волна 2 §1: лёгкий пункт чеклиста (НЕ задача). Двигает task.progress.
export interface CheckItem {
  id: number;
  task_id: number;
  title: string;
  done: boolean;
  order_index: number;
}

// Волна 2 §1: мульти-напоминание. relative → offset_minutes (за N мин до due_time);
// absolute → at_time (для all-day задач).
export type ReminderKind = "relative" | "absolute";
export interface Reminder {
  id?: number;
  task_id?: number;
  kind: ReminderKind;
  offset_minutes?: number | null;
  at_time?: string | null; // "HH:MM[:SS]"
}
// Вход для PUT /tasks/{id}/reminders — полная замена набора (без id/task_id).
export interface ReminderInput {
  kind: ReminderKind;
  offset_minutes?: number | null;
  at_time?: string | null;
}

// Волна 2 §4: структурный повтор.
export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceBase = "due" | "completion" | "dates";
export type RecurrenceEndType = "never" | "date" | "count";
export interface RecurrenceEnd {
  type: RecurrenceEndType;
  value: string | number | null; // date(ISO) для "date", N для "count", null для "never"
}
export interface RecurrenceJson {
  freq: RecurrenceFreq;
  interval: number;
  weekdays?: number[] | null;        // weekly, 0=Пн..6=Вс
  monthday?: number | null;          // monthly
  base: RecurrenceBase;
  specific_dates?: string[] | null;  // base=dates (ISO)
  end: RecurrenceEnd;
}

export interface Task {
  id: number; title: string; project_id: number | null;
  priority: Priority; status: TaskStatus;
  due_date: string | null; due_time: string | null; end_time: string | null;
  recurrence?: string | null; reminder_at?: string | null;
  recurrence_json?: RecurrenceJson | null;
  progress?: number;          // 0-100, двигается чеклистом
  pinned?: boolean;
  description?: string | null; parent_task_id?: number | null; tags?: Tag[];
}

// Волна 2 §2: GET /tasks/{id} — расширенная задача с вложенными коллекциями.
export interface TaskDetail extends Task {
  checkitems: CheckItem[];
  reminders: Reminder[];
  subtasks: Task[];
}

export interface Project {
  id: number; name: string; slug: string; is_inbox: boolean;
  parent_id: number | null; open_count: number;
  color?: string | null; icon?: string | null;
  pinned: boolean; order_index: number;
}
export interface Counts { all: number; today: number; tomorrow: number; next7: number; inbox: number; }

export type SmartKey = "all" | "today" | "tomorrow" | "next7" | "week" | "inbox";
export type ActiveList =
  | { kind: "smart"; key: SmartKey; title: string }
  | { kind: "project"; id: number; title: string };

export interface InboxItem { id: number; kind: string; source: string; raw_content: string; status: string; }
