"""nutrition skeleton: nutrition_target / meal_template_item / meal_log

Revision ID: e1f2a3b4c5d6
Revises: b0c1d2e3f4a5
Create Date: 2026-06-29 12:00:00.000000

"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "b0c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nutrition_target",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("kcal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("protein", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fat", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("carb", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", name="uq_nutrition_target_project"),
    )
    op.create_table(
        "meal_template_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("time", sa.String(length=8), nullable=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("kcal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("protein", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fat", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("carb", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_meal_template_item_project_id", "meal_template_item", ["project_id"])
    op.create_table(
        "meal_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("time", sa.String(length=8), nullable=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="planned"),
        sa.Column("kcal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("protein", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fat", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("carb", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_meal_log_project_date", "meal_log", ["project_id", "date"])


def downgrade() -> None:
    op.drop_table("meal_log")
    op.drop_table("meal_template_item")
    op.drop_table("nutrition_target")
