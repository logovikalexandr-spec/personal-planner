"""fork E: habit + habit_entry + metric + metric_entry (привычки/метрики, ZERO-AFK)

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-06-11 22:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "habit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#5B8DEF"),
        sa.Column("mark_type", sa.String(length=10), nullable=False, server_default="check"),
        sa.Column("target", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("step", sa.Float(), nullable=True),
        sa.Column("schedule_kind", sa.String(length=15), nullable=False, server_default="daily"),
        sa.Column("schedule_n", sa.Integer(), nullable=True),
        sa.Column("schedule_days", sa.JSON(), nullable=True),
        sa.Column("goal_date", sa.Date(), nullable=True),
        sa.Column("goal_total", sa.Integer(), nullable=True),
        sa.Column("record_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "habit_entry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("habit_id", sa.Integer(), sa.ForeignKey("habit.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False, server_default="0"),
        sa.UniqueConstraint("habit_id", "entry_date", name="uq_habit_entry_day"),
    )
    op.create_table(
        "metric",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("good_direction", sa.String(length=4), nullable=False, server_default="up"),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#3FB68B"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "metric_entry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("metric_id", sa.Integer(), sa.ForeignKey("metric.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False, server_default="0"),
        sa.UniqueConstraint("metric_id", "entry_date", name="uq_metric_entry_day"),
    )


def downgrade() -> None:
    op.drop_table("metric_entry")
    op.drop_table("metric")
    op.drop_table("habit_entry")
    op.drop_table("habit")
