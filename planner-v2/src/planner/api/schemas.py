from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    project_id: int | None = None
    priority: str = "none"
    due_date: date | None = None
    due_time: time | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    project_id: int | None
    priority: str
    status: str
    due_date: date | None
    due_time: time | None

    model_config = {"from_attributes": True}


class TaskPatch(BaseModel):
    status: str | None = None
    priority: str | None = None
    project_id: int | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    is_inbox: bool
    parent_id: int | None = None
    open_count: int = 0

    model_config = {"from_attributes": True}


class CountsOut(BaseModel):
    all: int
    today: int
    tomorrow: int
    next7: int
    inbox: int


class ProjectCreate(BaseModel):
    name: str
    slug: str
    color: str | None = None


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
