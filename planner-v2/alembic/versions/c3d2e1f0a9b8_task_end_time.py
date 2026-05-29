"""task end_time

Revision ID: c3d2e1f0a9b8
Revises: b2f1a0c4d5e6
Create Date: 2026-05-29 12:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d2e1f0a9b8"
down_revision: Union[str, Sequence[str], None] = "b2f1a0c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("task", sa.Column("end_time", sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column("task", "end_time")
