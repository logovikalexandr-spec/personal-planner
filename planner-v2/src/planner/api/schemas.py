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
