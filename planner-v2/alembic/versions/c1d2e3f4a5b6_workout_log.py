"""workout_log: exercise/template/template_exercise/session/set_log

Revision ID: c1d2e3f4a5b6
Revises: b9c0d1e2f3a4
Create Date: 2026-06-22 10:00:00.000000

"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exercise",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("muscle_group", sa.String(length=40), nullable=False, server_default="other"),
        sa.Column("equipment", sa.String(length=40), nullable=True),
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_rep_low", sa.Integer(), nullable=True),
        sa.Column("default_rep_high", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=300), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "workout_template",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_workout_template_project_id", "workout_template", ["project_id"])
    op.create_table(
        "template_exercise",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_sets", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("rep_low", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("rep_high", sa.Integer(), nullable=False, server_default="12"),
        sa.Column("coach_target_weight", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["template_id"], ["workout_template.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercise.id"]),
    )
    op.create_index("ix_template_exercise_template_id", "template_exercise", ["template_id"])
    op.create_table(
        "workout_session",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("stage_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("review_note", sa.String(length=2000), nullable=True),
        sa.Column("coach_note", sa.String(length=4000), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["workout_template.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stage_id"], ["stage.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_workout_session_project_id", "workout_session", ["project_id"])
    op.create_table(
        "set_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("set_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0"),
        sa.Column("reps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rpe", sa.Float(), nullable=True),
        sa.Column("is_warmup", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["workout_session.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercise.id"]),
    )
    op.create_index("ix_set_log_session_id", "set_log", ["session_id"])


def downgrade() -> None:
    op.drop_table("set_log")
    op.drop_table("workout_session")
    op.drop_table("template_exercise")
    op.drop_table("workout_template")
    op.drop_table("exercise")
