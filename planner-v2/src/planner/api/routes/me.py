from typing import Annotated

from fastapi import APIRouter, Depends

from planner.api.auth import TelegramUser, require_owner

router = APIRouter()


@router.get("/api/me")
async def me(user: Annotated[TelegramUser, Depends(require_owner)]) -> dict:
    return {"id": user.id, "first_name": user.first_name, "username": user.username}
