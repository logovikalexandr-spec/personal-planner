from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Time,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planner.db.base import Base


class Project(Base):
    __tablename__ = "project"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    color: Mapped[str | None] = mapped_column(String(32), default=None)
    icon: Mapped[str | None] = mapped_column(String(32), default=None)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("project.id"), default=None)
    is_inbox: Mapped[bool] = mapped_column(Boolean, default=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # --- AI-слой (заполняет human-in-loop Claude через write-API, бэк LLM не зовёт) ---
    # success_probability: 0..100 вероятность успеха проекта-цели
    success_probability: Mapped[int | None] = mapped_column(Integer, default=None)
    # предыдущее значение шанса — для тренда ▲/▼ на карточке цели (ставится при пересчёте)
    success_probability_prev: Mapped[int | None] = mapped_column(Integer, default=None)
    target_date: Mapped[date | None] = mapped_column(Date, default=None)
    # ai_notes: список {date, type(accelerate|risk|info), text}
    ai_notes: Mapped[list | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Stage(Base):
    """Этап/веха проекта. Основа Ганта, Целей, DETAIL-этапа, INBOX-подсказки."""

    __tablename__ = "stage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    # status ∈ done | current | future | late
    status: Mapped[str] = mapped_column(String(10), default="future")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    is_milestone: Mapped[bool] = mapped_column(Boolean, default=False)
    milestone_date: Mapped[date | None] = mapped_column(Date, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StageDependency(Base):
    """Зависимость этапов для критпути. Ребро from_stage → to_stage:
    to_stage НЕ может начаться, пока from_stage не закрыт (from = предшественник)."""

    __tablename__ = "stage_dependency"

    from_stage_id: Mapped[int] = mapped_column(
        ForeignKey("stage.id", ondelete="CASCADE"), primary_key=True
    )
    to_stage_id: Mapped[int] = mapped_column(
        ForeignKey("stage.id", ondelete="CASCADE"), primary_key=True
    )


class Task(Base):
    __tablename__ = "task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(String, default=None)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("project.id"), default=None)
    priority: Mapped[str] = mapped_column(String(10), default="none")
    due_date: Mapped[date | None] = mapped_column(Date, default=None)
    due_time: Mapped[time | None] = mapped_column(Time, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_time: Mapped[time | None] = mapped_column(Time, default=None)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    recurrence: Mapped[str | None] = mapped_column(String(100), default=None)
    recurrence_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    # status ∈ todo | in_progress | done | wont_do | archived
    status: Mapped[str] = mapped_column(String(15), default="todo")
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="manual")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("task.id"), default=None)
    stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("stage.id", ondelete="SET NULL"), default=None
    )
    impact: Mapped[int | None] = mapped_column(Integer, default=None)  # вклад в успех 0-100, пишет Claude (ZERO-AFK)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tags: Mapped[list[Tag]] = relationship(secondary="task_tag", lazy="selectin")
    checkitems: Mapped[list[CheckItem]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="CheckItem.order_index",
        lazy="selectin",
    )
    reminders: Mapped[list[Reminder]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="Reminder.id",
        lazy="selectin",
    )
    stage: Mapped["Stage | None"] = relationship("Stage", lazy="selectin")

    @property
    def stage_label(self) -> str | None:
        # «этап N», N = order_index + 1 (человеко-номер)
        return f"этап {self.stage.order_index + 1}" if self.stage is not None else None

    @property
    def stage_status(self) -> str | None:
        return self.stage.status if self.stage is not None else None


class CheckItem(Base):
    __tablename__ = "check_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("task.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship(back_populates="checkitems")


class Reminder(Base):
    __tablename__ = "reminder"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("task.id", ondelete="CASCADE"), nullable=False
    )
    # kind ∈ relative | absolute
    kind: Mapped[str] = mapped_column(String(10))
    offset_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    at_time: Mapped[time | None] = mapped_column(Time, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship(back_populates="reminders")


class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    color: Mapped[str | None] = mapped_column(String(32), default=None)


class TaskTag(Base):
    __tablename__ = "task_tag"

    task_id: Mapped[int] = mapped_column(ForeignKey("task.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), primary_key=True)


class InboxItem(Base):
    __tablename__ = "inbox_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    source: Mapped[str] = mapped_column(String(10), default="manual")
    raw_content: Mapped[str] = mapped_column(String, default="")
    parsed_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    status: Mapped[str] = mapped_column(String(12), default="new")
    suggested_project_id: Mapped[int | None] = mapped_column(ForeignKey("project.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Attachment(Base):
    __tablename__ = "attachment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("task.id"), default=None)
    inbox_item_id: Mapped[int | None] = mapped_column(ForeignKey("inbox_item.id"), default=None)
    kind: Mapped[str] = mapped_column(String(10))
    url_or_fileid: Mapped[str] = mapped_column(String)
    meta: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Форк E: Привычки + Метрики (ZERO-AFK: тупой трекер, LLM не зовёт) ──────── #
class Habit(Base):
    """Привычка. mark_type=check (да/нет, value=1) или count (сумма за день vs target)."""
    __tablename__ = "habit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(20), default="#5B8DEF")
    mark_type: Mapped[str] = mapped_column(String(10), default="check")  # check | count
    target: Mapped[float | None] = mapped_column(Float, default=None)    # норма дня для count
    unit: Mapped[str | None] = mapped_column(String(20), default=None)
    step: Mapped[float | None] = mapped_column(Float, default=None)      # шаг ввода (напр. 0.25 л)
    schedule_kind: Mapped[str] = mapped_column(String(15), default="daily")  # daily|weekly_n|by_days|goal_date
    schedule_n: Mapped[int | None] = mapped_column(Integer, default=None)    # N для weekly_n
    schedule_days: Mapped[list | None] = mapped_column(JSON, default=None)   # [0..6] для by_days
    goal_date: Mapped[date | None] = mapped_column(Date, default=None)       # для goal_date
    goal_total: Mapped[int | None] = mapped_column(Integer, default=None)
    record_streak: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    entries: Mapped[list[HabitEntry]] = relationship(
        back_populates="habit", cascade="all, delete-orphan", lazy="selectin"
    )


class HabitEntry(Base):
    """Отметка привычки за день. check: value=1 (есть строка=сделано). count: накопленная СУММА."""
    __tablename__ = "habit_entry"
    __table_args__ = (UniqueConstraint("habit_id", "entry_date", name="uq_habit_entry_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habit.id", ondelete="CASCADE"))
    entry_date: Mapped[date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Float, default=0)
    habit: Mapped[Habit] = relationship(back_populates="entries")


class Metric(Base):
    """Метрика — любое число во времени (вес/сон/настроение). good_direction красит дельту."""
    __tablename__ = "metric"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str | None] = mapped_column(String(20), default=None)
    good_direction: Mapped[str] = mapped_column(String(4), default="up")  # up | down
    color: Mapped[str] = mapped_column(String(20), default="#3FB68B")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    entries: Mapped[list[MetricEntry]] = relationship(
        back_populates="metric", cascade="all, delete-orphan", lazy="selectin"
    )


class MetricEntry(Base):
    """Замер метрики за день. Семантика ЗАМЕНА (upsert по дню, last-wins)."""
    __tablename__ = "metric_entry"
    __table_args__ = (UniqueConstraint("metric_id", "entry_date", name="uq_metric_entry_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    metric_id: Mapped[int] = mapped_column(ForeignKey("metric.id", ondelete="CASCADE"))
    entry_date: Mapped[date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Float, default=0)
    metric: Mapped[Metric] = relationship(back_populates="entries")


# ─── Workout-лог (Волна 1: подраздел Цели «Рекомпозиция») ───────────────────

class Exercise(Base):
    __tablename__ = "exercise"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    muscle_group: Mapped[str] = mapped_column(String(40), default="other")
    equipment: Mapped[str | None] = mapped_column(String(40), default=None)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    default_rep_low: Mapped[int | None] = mapped_column(Integer, default=None)
    default_rep_high: Mapped[int | None] = mapped_column(Integer, default=None)
    notes: Mapped[str | None] = mapped_column(String(300), default=None)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkoutTemplate(Base):
    __tablename__ = "workout_template"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercises: Mapped[list[TemplateExercise]] = relationship(
        back_populates="template", cascade="all, delete-orphan", lazy="selectin",
        order_by="TemplateExercise.order_index",
    )


class TemplateExercise(Base):
    __tablename__ = "template_exercise"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("workout_template.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    rep_low: Mapped[int] = mapped_column(Integer, default=8)
    rep_high: Mapped[int] = mapped_column(Integer, default=12)
    # Q7: тренер сам ставит целевой вес на след. сессию; откат = NULL
    coach_target_weight: Mapped[float | None] = mapped_column(Float, default=None)

    template: Mapped[WorkoutTemplate] = relationship(back_populates="exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"))
    template_id: Mapped[int | None] = mapped_column(ForeignKey("workout_template.id", ondelete="SET NULL"), default=None)
    stage_id: Mapped[int | None] = mapped_column(ForeignKey("stage.id", ondelete="SET NULL"), default=None)
    date: Mapped[date] = mapped_column(Date)
    review_note: Mapped[str | None] = mapped_column(String(2000), default=None)
    coach_note: Mapped[str | None] = mapped_column(String(4000), default=None)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sets: Mapped[list[SetLog]] = relationship(
        back_populates="session", cascade="all, delete-orphan", lazy="selectin",
        order_by="SetLog.set_index",
    )


class SetLog(Base):
    __tablename__ = "set_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_session.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercise.id"))
    set_index: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[float] = mapped_column(Float, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    rpe: Mapped[float | None] = mapped_column(Float, default=None)
    is_warmup: Mapped[bool] = mapped_column(Boolean, default=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(String(300), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
