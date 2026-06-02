from datetime import date, time

import pytest

from planner.db.models import CheckItem, Project, Reminder
from planner.services import tasks as svc


async def _inbox(db):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db.add(inbox)
    await db.flush()
    return inbox


# --- recompute_progress ---------------------------------------------------- #

@pytest.mark.asyncio
async def test_recompute_progress_from_checkitems(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="task")
    await svc.add_checkitem(db_session, t.id, title="a")
    await svc.add_checkitem(db_session, t.id, title="b")
    await svc.add_checkitem(db_session, t.id, title="c")
    assert t.progress == 0
    items = (await db_session.execute(
        CheckItem.__table__.select().where(CheckItem.task_id == t.id)
    )).all()
    first_id = items[0].id
    await svc.update_checkitem(db_session, first_id, done=True)
    # 1/3 -> 33
    assert t.progress == 33
    second_id = items[1].id
    await svc.update_checkitem(db_session, second_id, done=True)
    assert t.progress == 67  # round(2/3*100)


@pytest.mark.asyncio
async def test_progress_manual_kept_when_no_checkitems(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="task")
    t.progress = 50
    await db_session.flush()
    await svc.recompute_progress(db_session, t)
    assert t.progress == 50  # no checkitems -> untouched


@pytest.mark.asyncio
async def test_delete_checkitem_recomputes(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="task")
    i1 = await svc.add_checkitem(db_session, t.id, title="a")
    i2 = await svc.add_checkitem(db_session, t.id, title="b")
    await svc.update_checkitem(db_session, i1.id, done=True)
    assert t.progress == 50
    await svc.delete_checkitem(db_session, i2.id)
    # now 1/1 done -> 100
    assert t.progress == 100


@pytest.mark.asyncio
async def test_add_checkitem_order_increments(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="task")
    i1 = await svc.add_checkitem(db_session, t.id, title="a")
    i2 = await svc.add_checkitem(db_session, t.id, title="b")
    assert i1.order_index == 0
    assert i2.order_index == 1


# --- complete_task --------------------------------------------------------- #

@pytest.mark.asyncio
async def test_complete_task_no_recurrence(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="one-off", due_date=date(2026, 6, 2))
    closed, nxt = await svc.complete_task(db_session, t.id)
    assert closed.status == "done"
    assert closed.done_at is not None
    assert nxt is None


@pytest.mark.asyncio
async def test_complete_task_with_recurrence_generates_next(db_session):
    await _inbox(db_session)
    rec = {"freq": "daily", "interval": 1, "base": "due", "end": {"type": "never"}}
    t = await svc.create_task(
        db_session, title="daily", due_date=date(2026, 6, 2), recurrence_json=rec
    )
    closed, nxt = await svc.complete_task(db_session, t.id)
    assert closed.status == "done"
    assert nxt is not None
    assert nxt.status == "todo"
    assert nxt.due_date == date(2026, 6, 3)
    assert nxt.title == "daily"
    assert nxt.progress == 0


@pytest.mark.asyncio
async def test_complete_recurrence_base_completion(db_session):
    await _inbox(db_session)
    rec = {"freq": "daily", "interval": 1, "base": "completion", "end": {"type": "never"}}
    # due far in past; base=completion -> next is from today
    t = await svc.create_task(
        db_session, title="x", due_date=date(2020, 1, 1), recurrence_json=rec
    )
    _, nxt = await svc.complete_task(db_session, t.id)
    assert nxt is not None
    assert nxt.due_date == date.today().fromordinal(date.today().toordinal() + 1)


@pytest.mark.asyncio
async def test_complete_recurrence_count_decrements_and_stops(db_session):
    await _inbox(db_session)
    rec = {"freq": "daily", "interval": 1, "base": "due", "end": {"type": "count", "value": 1}}
    t = await svc.create_task(
        db_session, title="x", due_date=date(2026, 6, 2), recurrence_json=rec
    )
    _, nxt = await svc.complete_task(db_session, t.id)
    assert nxt is not None
    # new instance has count decremented to 0
    assert nxt.recurrence_json["end"]["value"] == 0
    # completing it again should NOT generate (count exhausted)
    _, nxt2 = await svc.complete_task(db_session, nxt.id)
    assert nxt2 is None


@pytest.mark.asyncio
async def test_complete_recurrence_end_date_stops(db_session):
    await _inbox(db_session)
    rec = {"freq": "daily", "base": "due", "end": {"type": "date", "value": "2026-06-02"}}
    t = await svc.create_task(
        db_session, title="x", due_date=date(2026, 6, 2), recurrence_json=rec
    )
    _, nxt = await svc.complete_task(db_session, t.id)
    assert nxt is None  # next would be 2026-06-03 > end date


# --- reminders ------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_replace_reminders(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="x")
    await svc.replace_reminders(
        db_session,
        t.id,
        [
            {"kind": "relative", "offset_minutes": 30, "at_time": None},
            {"kind": "absolute", "offset_minutes": None, "at_time": time(9, 0)},
        ],
    )
    rows = (await db_session.execute(
        Reminder.__table__.select().where(Reminder.task_id == t.id)
    )).all()
    assert len(rows) == 2
    # replacing again with a single reminder wipes the old set
    await svc.replace_reminders(
        db_session, t.id, [{"kind": "relative", "offset_minutes": 1440, "at_time": None}]
    )
    rows = (await db_session.execute(
        Reminder.__table__.select().where(Reminder.task_id == t.id)
    )).all()
    assert len(rows) == 1
    assert rows[0].offset_minutes == 1440


@pytest.mark.asyncio
async def test_replace_reminders_empty_clears(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="x")
    await svc.replace_reminders(
        db_session, t.id, [{"kind": "relative", "offset_minutes": 30, "at_time": None}]
    )
    await svc.replace_reminders(db_session, t.id, [])
    rows = (await db_session.execute(
        Reminder.__table__.select().where(Reminder.task_id == t.id)
    )).all()
    assert rows == []


# --- wont_do --------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_set_status_wont_do_sets_done_at(db_session):
    await _inbox(db_session)
    t = await svc.create_task(db_session, title="x")
    await svc.set_status(db_session, t.id, "wont_do")
    assert t.status == "wont_do"
    assert t.done_at is not None
