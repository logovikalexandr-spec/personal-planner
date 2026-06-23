"""project success_probability_prev (тренд шанса ▲/▼)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-23 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # nullable: пока шанс не пересчитывали — prev=null → стрелка не рисуется
    op.add_column("project", sa.Column("success_probability_prev", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("project", "success_probability_prev")
