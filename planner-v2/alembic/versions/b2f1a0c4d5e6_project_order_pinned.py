"""project order_index + pinned

Revision ID: b2f1a0c4d5e6
Revises: 10c027ad36ef
Create Date: 2026-05-29 11:40:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2f1a0c4d5e6"
down_revision: Union[str, Sequence[str], None] = "10c027ad36ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project",
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "project",
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )
    # backfill: per-parent ordering by name (existing seeded rows)
    op.execute(
        """
        UPDATE project p
        SET order_index = sub.rn - 1
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY parent_id ORDER BY name
                   ) AS rn
            FROM project
        ) sub
        WHERE p.id = sub.id
        """
    )


def downgrade() -> None:
    op.drop_column("project", "order_index")
    op.drop_column("project", "pinned")
