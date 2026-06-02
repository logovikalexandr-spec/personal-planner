"""wave2 task detail: progress/pinned/recurrence_json + check_item + reminder

Revision ID: d4e5f6a7b8c9
Revises: c3d2e1f0a9b8
Create Date: 2026-06-02 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d2e1f0a9b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- task new columns -------------------------------------------------- #
    op.add_column(
        "task",
        sa.Column("recurrence_json", sa.JSON(), nullable=True),
    )
    op.add_column(
        "task",
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "task",
        sa.Column(
            "pinned", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )

    # --- check_item -------------------------------------------------------- #
    op.create_table(
        "check_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("task.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_check_item_task_id", "check_item", ["task_id"])

    # --- reminder ---------------------------------------------------------- #
    op.create_table(
        "reminder",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("task.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("offset_minutes", sa.Integer(), nullable=True),
        sa.Column("at_time", sa.Time(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_reminder_task_id", "reminder", ["task_id"])

    # --- best-effort backfill: task.reminder_at -> reminder rows ----------- #
    # Existing reminder_at is an absolute datetime. We translate it into an
    # absolute reminder using its time-of-day. Non-null only.
    op.execute(
        """
        INSERT INTO reminder (task_id, kind, at_time, created_at)
        SELECT id, 'absolute', CAST(reminder_at AS time), now()
        FROM task
        WHERE reminder_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_reminder_task_id", table_name="reminder")
    op.drop_table("reminder")
    op.drop_index("ix_check_item_task_id", table_name="check_item")
    op.drop_table("check_item")
    op.drop_column("task", "pinned")
    op.drop_column("task", "progress")
    op.drop_column("task", "recurrence_json")
