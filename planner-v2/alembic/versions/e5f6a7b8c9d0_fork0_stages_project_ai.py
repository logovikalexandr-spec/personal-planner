"""fork0 foundation: stage + stage_dependency, project AI fields, task.stage_id

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-10 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- project AI columns (human-in-loop, бэк LLM не зовёт) -------------- #
    op.add_column("project", sa.Column("success_probability", sa.Integer(), nullable=True))
    op.add_column("project", sa.Column("target_date", sa.Date(), nullable=True))
    op.add_column("project", sa.Column("ai_notes", sa.JSON(), nullable=True))

    # --- stage ------------------------------------------------------------ #
    op.create_table(
        "stage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("project.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="future"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_milestone", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("milestone_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_stage_project_id", "stage", ["project_id"])

    # --- stage_dependency (критпуть) -------------------------------------- #
    op.create_table(
        "stage_dependency",
        sa.Column(
            "from_stage_id",
            sa.Integer(),
            sa.ForeignKey("stage.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "to_stage_id",
            sa.Integer(),
            sa.ForeignKey("stage.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # --- task.stage_id ---------------------------------------------------- #
    op.add_column(
        "task",
        sa.Column(
            "stage_id",
            sa.Integer(),
            sa.ForeignKey("stage.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_task_stage_id", "task", ["stage_id"])


def downgrade() -> None:
    op.drop_index("ix_task_stage_id", table_name="task")
    op.drop_column("task", "stage_id")
    op.drop_table("stage_dependency")
    op.drop_index("ix_stage_project_id", table_name="stage")
    op.drop_table("stage")
    op.drop_column("project", "ai_notes")
    op.drop_column("project", "target_date")
    op.drop_column("project", "success_probability")
