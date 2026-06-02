from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import TelegramUser, require_owner
from planner.api.deps import get_db
from planner.api.schemas import CheckItemIn, CheckItemOut, CheckItemPatch
from planner.services import tasks as svc

router = APIRouter(prefix="/api")


@router.post(
    "/tasks/{task_id}/checkitems",
    response_model=CheckItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_checkitem(
    task_id: int,
    payload: CheckItemIn,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        item = await svc.add_checkitem(db, task_id, title=payload.title)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/checkitems/{checkitem_id}", response_model=CheckItemOut)
async def patch_checkitem(
    checkitem_id: int,
    payload: CheckItemPatch,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    fields = payload.model_dump(exclude_unset=True)
    try:
        item = await svc.update_checkitem(
            db,
            checkitem_id,
            title=fields.get("title"),
            done=fields.get("done"),
            order_index=fields.get("order_index"),
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/checkitems/{checkitem_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_checkitem(
    checkitem_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        await svc.delete_checkitem(db, checkitem_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
