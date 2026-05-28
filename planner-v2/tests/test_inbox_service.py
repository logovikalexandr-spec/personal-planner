import pytest

from planner.services import inbox as svc


@pytest.mark.asyncio
async def test_capture_text(db_session):
    item = await svc.capture(db_session, kind="text", raw_content="купить молоко")
    assert item.id is not None
    assert item.status == "new"
    assert item.kind == "text"


@pytest.mark.asyncio
async def test_capture_link_with_attachment(db_session):
    item = await svc.capture(
        db_session, kind="link", raw_content="https://habr.com/x",
        attachment={"kind": "link", "url_or_fileid": "https://habr.com/x"},
    )
    assert item.kind == "link"
    assert len(await svc.list_new(db_session)) == 1
