"""habit.purpose — текст смысла/цели привычки (nullable)

Revision ID: b0c1d2e3f4a5
Revises: d2e3f4a5b6c7
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("habit", sa.Column("purpose", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("habit", "purpose")
