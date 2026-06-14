"""task end_date (multi-day span)

Revision ID: b9c0d1e2f3a4
Revises: a7b8c9d0e1f2
Create Date: 2026-06-14 20:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # nullable: старые задачи остаются одно-дневными (end_date=null → конец в due_date)
    op.add_column("task", sa.Column("end_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("task", "end_date")
