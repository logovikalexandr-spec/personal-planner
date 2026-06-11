from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel


class TagOut(BaseModel):
    id: int
    name: str
    color: str | None = None

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TaskCreate(BaseModel):
    title: str
    project_id: int | None = None
    priority: str = "none"
    due_date: date | None = None
    due_time: time | None = None
    end_time: time | None = None
    description: str | None = None
    reminder_at: datetime | None = None
    recurrence: str | None = None
    parent_task_id: int | None = None
    tag_ids: list[int] | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    project_id: int | None
    priority: str
    status: str
    due_date: date | None
    due_time: time | None
    end_time: time | None = None
    recurrence: str | None = None
    reminder_at: datetime | None = None
    description: str | None = None
    parent_task_id: int | None = None
    progress: int = 0
    pinned: bool = False
    stage_id: int | None = None
    stage_label: str | None = None      # «этап N» (вычисляется из Stage.order_index)
    stage_status: str | None = None     # done|current|future|late — цвет метки
    impact: int | None = None
    tags: list[TagOut] = []

    model_config = {"from_attributes": True}


class TaskPatch(BaseModel):
    title: str | None = None
    status: str | None = None
    priority: str | None = None
    project_id: int | None = None
    due_date: date | None = None
    due_time: time | None = None
    end_time: time | None = None
    description: str | None = None
    reminder_at: datetime | None = None
    recurrence: str | None = None
    recurrence_json: RecurrenceJson | None = None
    progress: int | None = None
    pinned: bool | None = None
    parent_task_id: int | None = None
    stage_id: int | None = None
    impact: int | None = None
    tag_ids: list[int] | None = None


class RecurrenceEnd(BaseModel):
    type: str = "never"  # never | date | count
    value: str | int | None = None


class RecurrenceJson(BaseModel):
    freq: str  # daily | weekly | monthly | yearly
    interval: int = 1
    weekdays: list[int] | None = None  # 0=Mon..6=Sun, for weekly
    monthday: int | None = None  # for monthly
    base: str = "due"  # due | completion | dates
    specific_dates: list[str] | None = None  # ISO dates, for base=dates
    end: RecurrenceEnd = RecurrenceEnd()


class CheckItemIn(BaseModel):
    title: str
    done: bool | None = None
    order_index: int | None = None


class CheckItemPatch(BaseModel):
    title: str | None = None
    done: bool | None = None
    order_index: int | None = None


class CheckItemOut(BaseModel):
    id: int
    task_id: int
    title: str
    done: bool
    order_index: int

    model_config = {"from_attributes": True}


class ReminderIn(BaseModel):
    kind: str  # relative | absolute
    offset_minutes: int | None = None
    at_time: time | None = None


class RemindersPut(BaseModel):
    reminders: list[ReminderIn] = []


class ReminderOut(BaseModel):
    id: int
    task_id: int
    kind: str
    offset_minutes: int | None = None
    at_time: time | None = None

    model_config = {"from_attributes": True}


class TaskDetailOut(TaskOut):
    progress: int = 0
    pinned: bool = False
    recurrence_json: RecurrenceJson | None = None
    checkitems: list[CheckItemOut] = []
    reminders: list[ReminderOut] = []
    subtasks: list[TaskOut] = []


class TaskPatchResult(BaseModel):
    task: TaskDetailOut
    next_task: TaskDetailOut | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    is_inbox: bool
    parent_id: int | None = None
    color: str | None = None
    icon: str | None = None
    pinned: bool = False
    order_index: int = 0
    open_count: int = 0
    # AI-слой (заполняет human-in-loop Claude, бэк LLM не зовёт)
    success_probability: int | None = None
    target_date: date | None = None
    ai_notes: list[AiNote] | None = None
    weeks_left: int | None = None  # computed из target_date

    model_config = {"from_attributes": True}


class AiNote(BaseModel):
    date: date
    type: str  # accelerate | risk | info
    text: str


class ProjectAiUpdate(BaseModel):
    """Write-API human-in-loop: PUT /api/projects/{id}/ai."""

    success_probability: int | None = None
    target_date: date | None = None
    ai_notes: list[AiNote] | None = None


class StageCreate(BaseModel):
    project_id: int
    name: str
    order_index: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str = "future"  # done | current | future | late
    progress: int = 0
    is_milestone: bool = False
    milestone_date: date | None = None
    depends_on_ids: list[int] | None = None


class StagePatch(BaseModel):
    name: str | None = None
    order_index: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None
    progress: int | None = None
    is_milestone: bool | None = None
    milestone_date: date | None = None
    depends_on_ids: list[int] | None = None


class StageOut(BaseModel):
    id: int
    project_id: int
    name: str
    order_index: int
    start_date: date | None = None
    end_date: date | None = None
    status: str
    progress: int
    is_milestone: bool
    milestone_date: date | None = None
    depends_on_ids: list[int] = []

    model_config = {"from_attributes": True}


class MilestoneOut(BaseModel):
    """Веха для календаря: лёгкая проекция Stage (флажок цвета проекта)."""
    id: int
    project_id: int
    name: str
    milestone_date: date
    status: str

    model_config = {"from_attributes": True}


class ProjectPatch(BaseModel):
    name: str | None = None
    parent_id: int | None = None
    color: str | None = None
    icon: str | None = None
    pinned: bool | None = None
    order_index: int | None = None


class ProjectOrderItem(BaseModel):
    id: int
    parent_id: int | None = None
    order_index: int


class CountsOut(BaseModel):
    all: int
    today: int
    tomorrow: int
    next7: int
    inbox: int


class ProjectCreate(BaseModel):
    name: str
    parent_id: int | None = None
    color: str | None = None
    icon: str | None = None
    slug: str | None = None


class InboxOut(BaseModel):
    id: int
    kind: str
    source: str
    raw_content: str
    status: str

    model_config = {"from_attributes": True}


class TriageIn(BaseModel):
    project_id: int
    title: str
    priority: str = "none"
    due_date: date | None = None


# ── Форк E: привычки + метрики ─────────────────────────────────────────────── #
class HabitCreate(BaseModel):
    name: str
    color: str = "#5B8DEF"
    mark_type: str = "check"
    target: float | None = None
    unit: str | None = None
    step: float | None = None
    schedule_kind: str = "daily"
    schedule_n: int | None = None
    schedule_days: list[int] | None = None
    goal_date: date | None = None
    goal_total: int | None = None


class HabitPatch(BaseModel):
    name: str | None = None
    color: str | None = None
    mark_type: str | None = None
    target: float | None = None
    unit: str | None = None
    step: float | None = None
    schedule_kind: str | None = None
    schedule_n: int | None = None
    schedule_days: list[int] | None = None
    goal_date: date | None = None
    goal_total: int | None = None
    archived: bool | None = None
    order_index: int | None = None


class HabitOut(BaseModel):
    id: int
    name: str
    color: str
    mark_type: str
    target: float | None = None
    unit: str | None = None
    step: float | None = None
    schedule_kind: str
    schedule_n: int | None = None
    schedule_days: list[int] | None = None
    goal_date: date | None = None
    goal_total: int | None = None
    record_streak: int
    archived: bool
    order_index: int
    # computed (на дату запроса)
    today_value: float = 0
    done_today: bool = False
    streak: int = 0
    week: list[bool] = []       # 7 дней по зачёту (пн..вс окна)
    heat7: list[int] = []       # градиент-уровни 0-4 за 7 дней


class HabitEntryIn(BaseModel):
    date: date
    delta: float | None = None   # для add (count)
    value: float | None = None   # для backfill (абсолютное)


class MetricCreate(BaseModel):
    name: str
    unit: str | None = None
    good_direction: str = "up"
    color: str = "#3FB68B"


class MetricEntryOut(BaseModel):
    entry_date: date
    value: float
    model_config = {"from_attributes": True}


class MetricOut(BaseModel):
    id: int
    name: str
    unit: str | None = None
    good_direction: str
    color: str
    archived: bool
    order_index: int
    latest: float | None = None
    delta: float | None = None       # latest - предыдущий
    entries: list[MetricEntryOut] = []


class MetricMeasureIn(BaseModel):
    date: date
    value: float
