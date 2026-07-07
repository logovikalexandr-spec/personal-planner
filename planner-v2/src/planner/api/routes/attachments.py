from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from planner.api.auth import InitDataError, TelegramUser, require_owner, verify_init_data
from planner.api.deps import get_db
from planner.api.schemas import AttachmentOut
from planner.config import Settings, get_settings
from planner.db.models import Task
from planner.services import attachments as att_svc

router = APIRouter()


def _auth_media(settings: Settings, token: str | None, init: str | None) -> None:
    """Авторизация для <img>: токен в query (PWA) или initData в query (Telegram).

    <img src> не умеет слать заголовки, поэтому токен идёт параметром URL.
    """
    import hmac

    if settings.pwa_token and token and hmac.compare_digest(token, settings.pwa_token):
        return
    if init:
        try:
            verify_init_data(
                init,
                bot_token=settings.telegram_bot_token,
                owner_id=settings.owner_telegram_id,
                max_age_sec=settings.mini_app_initdata_max_age_sec,
            )
            return
        except InitDataError:
            pass
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "auth required")


@router.get("/api/attachments/{att_id}/file")
async def get_file(
    att_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    token: str | None = Query(None),
    init: str | None = Query(None),
):
    _auth_media(settings, token, init)
    att = await att_svc.get(db, att_id)
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "attachment not found")
    try:
        data, content_type = await att_svc.resolve_bytes(settings, att)
    except Exception as exc:  # noqa: BLE001 — отдать 404 вместо 500 при битом file_id/файле
        raise HTTPException(status.HTTP_404_NOT_FOUND, "attachment unavailable") from exc
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post("/api/tasks/{task_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(
    task_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: UploadFile = File(...),
):
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "task not found")
    content = await file.read()
    att = await att_svc.create_upload(
        db, settings, task_id=task_id, filename=file.filename or "upload.bin", content=content,
    )
    await db.commit()
    await db.refresh(att)
    return att


@router.delete("/api/attachments/{att_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    att_id: int,
    _: Annotated[TelegramUser, Depends(require_owner)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    att = await att_svc.get(db, att_id)
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "attachment not found")
    await att_svc.delete(db, settings, att)
    await db.commit()
