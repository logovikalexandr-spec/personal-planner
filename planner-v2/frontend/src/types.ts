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
  due_date: string | null; due_time: string | null; end_date: string | null; end_time: string | null;
  recurrence?: string | null; reminder_at?: string | null;
  recurrence_json?: RecurrenceJson | null;
  progress?: number;          // 0-100, двигается чеклистом
  pinned?: boolean;
  stage_id?: number | null;   // Форк 0: привязка к этапу проекта (метка на таймлайне T1)
  stage_label?: string | null;   // «этап N» (с бэка)
  stage_status?: string | null;  // done|current|future|late — цвет метки
  impact?: number | null;     // вклад в успех 0-100, пишет Claude (ZERO-AFK); токен в мете
  description?: string | null; parent_task_id?: number | null; tags?: Tag[];
}

// Форк 0: этап/веха проекта. Зеркало StageOut. order_index → «этап N» (N=order_index+1).
export type StageStatus = "done" | "current" | "future" | "late";
export interface Stage {
  id: number; project_id: number; name: string; order_index: number;
  start_date: string | null; end_date: string | null;
  status: StageStatus; progress: number;
  is_milestone: boolean; milestone_date: string | null;
  depends_on_ids: number[];
}

// Волна 2 §2: GET /tasks/{id} — расширенная задача с вложенными коллекциями.
export interface TaskDetail extends Task {
  checkitems: CheckItem[];
  reminders: Reminder[];
  subtasks: Task[];
}

// Форк 0: AI-заметка проекта-цели. Пишет human-in-loop Claude через PUT /ai (ZERO-AFK).
export type AiNoteType = "accelerate" | "risk" | "info";
export interface AiNote { date: string; type: AiNoteType; text: string; }

export interface Project {
  id: number; name: string; slug: string; is_inbox: boolean;
  parent_id: number | null; open_count: number;
  color?: string | null; icon?: string | null;
  pinned: boolean; order_index: number;
  // Форк 0 AI-слой (зеркало ProjectOut): success_probability/target_date/ai_notes пишет Claude.
  success_probability?: number | null;
  target_date?: string | null;       // ISO date
  ai_notes?: AiNote[] | null;
  weeks_left?: number | null;         // computed бэком из target_date
}
export interface Counts { all: number; today: number; tomorrow: number; next7: number; inbox: number; }

export type SmartKey = "all" | "today" | "tomorrow" | "next7" | "week" | "inbox";
export type ActiveList =
  | { kind: "smart"; key: SmartKey; title: string }
  | { kind: "project"; id: number; title: string };

export interface InboxItem { id: number; kind: string; source: string; raw_content: string; status: string; }

// Форк B: веха для календаря (проекция Stage). Цвет флажка = цвет проекта.
export interface Milestone {
  id: number;
  project_id: number;
  name: string;
  milestone_date: string; // ISO date
  status: string;
}

// Форк B: три ракурса одного таба «Календарь».
export type CalendarView = "week" | "month" | "agenda";

// ── Форк E: привычки + метрики (зеркало HabitOut/MetricOut бэка) ──
export interface HabitOut {
  id: number;
  name: string;
  color: string;
  mark_type: "check" | "count";
  target?: number | null;
  unit?: string | null;
  step?: number | null;
  schedule_kind: string;
  schedule_n?: number | null;
  schedule_days?: number[] | null;
  goal_date?: string | null;
  goal_total?: number | null;
  record_streak: number;
  archived: boolean;
  order_index: number;
  today_value: number;
  done_today: boolean;
  streak: number;
  week: boolean[];   // 7 дней пн..вс по зачёту
  heat7: number[];   // градиент 0-4 за 7 дней
}

export interface MetricEntryOut { entry_date: string; value: number; }
export interface MetricOut {
  id: number;
  name: string;
  unit?: string | null;
  good_direction: "up" | "down";
  color: string;
  archived: boolean;
  order_index: number;
  latest?: number | null;
  delta?: number | null;
  entries: MetricEntryOut[];
}

export interface HabitInput {
  name: string;
  color?: string;
  mark_type?: "check" | "count";
  target?: number | null;
  unit?: string | null;
  step?: number | null;
}
export interface MetricInput {
  name: string;
  unit?: string | null;
  good_direction?: "up" | "down";
  color?: string;
}
