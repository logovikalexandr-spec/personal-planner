from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from planner.config import get_settings
from planner.db.session import get_session

__all__ = ["get_db", "get_settings"]


async def get_db() -> AsyncIterator[AsyncSession]:
    async for s in get_session():
        yield s
