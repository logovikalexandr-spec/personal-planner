from __future__ import annotations

from collections import defaultdict, deque
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Integer, func, select

from planner.db.models import CheckItem, InboxItem, Project, Reminder, Tag, Task, TaskTag


class RecurrenceNotImplementedError(Exception):
    """Raised when a recurrence configuration is not yet supported (e.g. specific_dates)."""


async def _inbox_project_id(session) -> int | None:
    row = await session.execute(select(Project.id).where(Project.is_inbox.is_(True)))
    return row.scalar_one_or_none()


async def create_task(session, *, title: str, project_id: int | None = None, **fields) -> Task:
    if project_id is None:
        project_id = await _inbox_project_id(session)
    task = Task(title=title, project_id=project_id, **fields)
    session.add(task)
    await session.flush()
    return task


async def set_task_tags(session, task_id: int, tag_ids: list[int]) -> None:
    """Replace a task's tags with the given ids (ignoring ids that don't exist)."""
    await session.execute(TaskTag.__table__.delete().where(TaskTag.task_id == task_id))
    if tag_ids:
        rows = await session.execute(select(Tag.id).where(Tag.id.in_(tag_ids)))
        valid = [tid for (tid,) in rows]
        for tid in valid:
            session.add(TaskTag(task_id=task_id, tag_id=tid))
    await session.flush()


async def count_open_by_project(session) -> dict[int, int]:
    """Map project_id -> number of open tasks (status todo/in_progress). project_id None excluded."""
    stmt = (
        select(Task.project_id, func.count().label("cnt"))
        .where(Task.status.in_(("todo", "in_progress")))
        .where(Task.project_id.is_not(None))
        .group_by(Task.project_id)
    )
    rows = await session.execute(stmt)
    return {row.project_id: row.cnt for row in rows}


async def descendant_project_ids(session, root_id: int) -> list[int]:
    """root_id plus all descendant project ids (by parent_id), arbitrary depth. Includes root."""
    rows = await session.execute(select(Project.id, Project.parent_id))
    children: dict[int, list[int]] = defaultdict(list)
    all_ids: set[int] = set()
    for pid, par in rows:
        all_ids.add(pid)
        if par is not None:
            children[par].append(pid)

    if root_id not in all_ids:
        return []

    result: list[int] = []
    queue: deque[int] = deque([root_id])
    while queue:
        node = queue.popleft()
        result.append(node)
        for child in children.get(node, []):
            queue.append(child)
    return result


async def list_tasks(
    session,
    *,
    scope: str = "all",
    project_id: int | None = None,
    project_ids: list[int] | None = None,
    on_date: date | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    parent_task_id: int | None = None,
    ref_date: date | None = None,
) -> list[Task]:
    # «сегодня» = дата КЛИЕНТА (ref_date), не сервера: сервер в UTC, клиент в своей TZ →
    # иначе смарт-список «Сегодня» расходится с тем, что у пользователя на устройстве.
    today = ref_date or date.today()
    stmt = select(Task).where(Task.status != "archived")
    if parent_task_id is not None:
        stmt = stmt.where(Task.parent_task_id == parent_task_id)
    if on_date is not None:
        stmt = stmt.where(Task.due_date == on_date)
    elif from_date is not None or to_date is not None:
        # Календарь (неделя/месяц/лента): окно дат, включая границы и done.
        if from_date is not None:
            stmt = stmt.where(Task.due_date >= from_date)
        if to_date is not None:
            stmt = stmt.where(Task.due_date <= to_date)
    elif scope == "today":
        stmt = stmt.where(Task.due_date == today, Task.status != "done")
    elif scope == "week":
        end = today + timedelta(days=7)
        stmt = stmt.where(
            Task.due_date >= today, Task.due_date <= end, Task.status != "done"
        )
    elif scope == "planned":
        stmt = stmt.where(
            Task.due_date.is_not(None), Task.due_date >= today, Task.status != "done"
        )
    elif scope == "overdue":
        stmt = stmt.where(
            Task.due_date.is_not(None),
            Task.due_date < today,
            Task.status.in_(("todo", "in_progress")),
        )
    elif scope == "inbox":
        inbox_id = await _inbox_project_id(session)
        stmt = stmt.where(Task.project_id == inbox_id)
    # project_ids takes precedence over project_id
    if project_ids is not None:
        stmt = stmt.where(Task.project_id.in_(project_ids))
    elif project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    stmt = stmt.order_by(Task.due_date.is_(None), Task.due_date, Task.due_time, Task.order_index)
    rows = await session.execute(stmt)
    return list(rows.scalars().all())


async def smart_list_counts(session, ref_date: date | None = None) -> dict[str, int]:
    """Counts of OPEN tasks for smart lists: all, today, tomorrow, next7, inbox.
    ref_date = дата клиента (его TZ); счётчики обязаны совпадать со смарт-списками."""
    today = ref_date or date.today()
    tomorrow = today + timedelta(days=1)
    next7_end = today + timedelta(days=7)
    inbox_id = await _inbox_project_id(session)

    open_statuses = ("todo", "in_progress")

    # all
    r_all = await session.execute(
        select(func.count()).where(Task.status.in_(open_statuses))
    )
    count_all = r_all.scalar_one()

    # today + просрочка (= что показывает смарт-список «Сегодня»: due_date <= сегодня, не done)
    r_today = await session.execute(
        select(func.count()).where(Task.status.in_(open_statuses), Task.due_date <= today)
    )
    count_today = r_today.scalar_one()

    # tomorrow
    r_tomorrow = await session.execute(
        select(func.count()).where(Task.status.in_(open_statuses), Task.due_date == tomorrow)
    )
    count_tomorrow = r_tomorrow.scalar_one()

    # next7: due_date in [today, today+7]
    r_next7 = await session.execute(
        select(func.count()).where(
            Task.status.in_(open_statuses),
            Task.due_date >= today,
            Task.due_date <= next7_end,
        )
    )
    count_next7 = r_next7.scalar_one()

    # inbox
    if inbox_id is not None:
        r_inbox = await session.execute(
            select(func.count()).where(
                Task.status.in_(open_statuses), Task.project_id == inbox_id
            )
        )
        count_inbox = r_inbox.scalar_one()
    else:
        count_inbox = 0

    return {
        "all": count_all,
        "today": count_today,
        "tomorrow": count_tomorrow,
        "next7": count_next7,
        "inbox": count_inbox,
    }


async def day_density(session, from_date: date, to_date: date) -> dict[str, str]:
    """Тепло-нагрузка дней для датапикера T1·B (heat B2).

    По числу ОТКРЫТЫХ задач дня (todo/in_progress) с due_date в окне:
      g = лёгкий (1–2) · y = средний (3–4) · r = плотный (≥5)
    Красным также помечается прошлый день с открытой важной (priority=high)
    задачей — «висит важное». Дни без открытых задач отсутствуют в ответе.
    Чистый расчёт по БД (ZERO-AFK, без LLM).
    """
    today = date.today()
    open_statuses = ("todo", "in_progress")
    rows = await session.execute(
        select(
            Task.due_date,
            func.count().label("cnt"),
            func.max(func.cast(Task.priority == "high", Integer)).label("has_high"),
        )
        .where(
            Task.status.in_(open_statuses),
            Task.due_date.is_not(None),
            Task.due_date >= from_date,
            Task.due_date <= to_date,
        )
        .group_by(Task.due_date)
    )
    out: dict[str, str] = {}
    for due, cnt, has_high in rows:
        cnt = int(cnt)
        if cnt == 0:
            continue
        overdue_important = due < today and bool(has_high)
        if cnt >= 5 or overdue_important:
            level = "r"
        elif cnt >= 3:
            level = "y"
        else:
            level = "g"
        out[due.isoformat()] = level
    return out


async def set_status(session, task_id: int, status: str) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise ValueError("task not found")
    task.status = status
    # done_at marks the closing moment for both done and wont_do.
    task.done_at = datetime.now(UTC) if status in ("done", "wont_do") else None
    await session.flush()
    return task


async def triage_inbox(session, inbox_id: int, *, project_id: int, title: str, **fields) -> Task:
    item = await session.get(InboxItem, inbox_id)
    if item is None:
        raise ValueError("inbox item not found")
    task = Task(title=title, project_id=project_id, source=item.source, **fields)
    session.add(task)
    item.status = "triaged"
    await session.flush()
    return task


# --------------------------------------------------------------------------- #
# Recurrence engine (§4)
# --------------------------------------------------------------------------- #

def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping the day to the target month's last day."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    # last day of target month
    if month == 12:
        last_day = 31
    else:
        last_day = (date(year, month + 1, 1) - timedelta(days=1)).day
    day = min(d.day, last_day)
    return date(year, month, day)


def next_date(rec: dict, from_date: date) -> date | None:
    """Compute the next occurrence date strictly after `from_date`.

    `rec` is a recurrence_json dict (see §4). `from_date` is the reference
    point: the planned due_date (base=due) or the completion date
    (base=completion). Returns None when the recurrence has ended.
    base=dates is not implemented and raises RecurrenceNotImplementedError.
    """
    if rec is None:
        return None
    freq = rec.get("freq")
    interval = rec.get("interval") or 1
    base = rec.get("base", "due")

    if base == "dates":
        raise RecurrenceNotImplementedError("base=dates (specific_dates) is not supported yet")

    if freq == "daily":
        nxt = from_date + timedelta(days=interval)
    elif freq == "weekly":
        nxt = _next_weekly(rec, from_date, interval)
    elif freq == "monthly":
        nxt = _add_months(from_date, interval)
        monthday = rec.get("monthday")
        if monthday is not None:
            nxt = _clamp_monthday(nxt, monthday)
    elif freq == "yearly":
        nxt = _add_years(from_date, interval)
    else:
        raise RecurrenceNotImplementedError(f"unsupported freq: {freq!r}")

    if not _within_end(rec, nxt):
        return None
    return nxt


def _next_weekly(rec: dict, from_date: date, interval: int) -> date:
    weekdays = rec.get("weekdays")
    if not weekdays:
        # plain weekly = same weekday, interval weeks later
        return from_date + timedelta(weeks=interval)
    selected = sorted(set(weekdays))
    # try remaining selected days within the current week (after from_date)
    for offset in range(1, 7):
        cand = from_date + timedelta(days=offset)
        if cand.weekday() in selected:
            return cand
    # nothing left this week (shouldn't happen since 0..6 covered above for offset<7)
    # fall through: first selected weekday in the week `interval` weeks ahead
    days_to_monday = (7 - from_date.weekday()) % 7 or 7
    next_week_start = from_date + timedelta(days=days_to_monday) + timedelta(weeks=interval - 1)
    first = selected[0]
    return next_week_start + timedelta(days=first)


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # Feb 29 -> Feb 28
        return d.replace(year=d.year + years, day=28)


def _clamp_monthday(d: date, monthday: int) -> date:
    if d.month == 12:
        last_day = 31
    else:
        last_day = (date(d.year, d.month + 1, 1) - timedelta(days=1)).day
    return d.replace(day=min(monthday, last_day))


def _within_end(rec: dict, candidate: date) -> bool:
    end = rec.get("end") or {}
    etype = end.get("type", "never")
    if etype == "never":
        return True
    if etype == "date":
        value = end.get("value")
        if value is None:
            return True
        end_date = value if isinstance(value, date) else date.fromisoformat(str(value))
        return candidate <= end_date
    if etype == "count":
        # Count is interpreted as remaining occurrences; 0 (or less) = exhausted.
        value = end.get("value")
        if value is None:
            return True
        return int(value) > 0
    return True


# --------------------------------------------------------------------------- #
# Progress + completion (§3)
# --------------------------------------------------------------------------- #

async def recompute_progress(session, task: Task) -> int:
    """Recompute task.progress from its checkitems. Manual progress is kept
    untouched when there are no checkitems (total == 0)."""
    rows = await session.execute(
        select(
            func.count().label("total"),
            func.coalesce(func.sum(func.cast(CheckItem.done, Integer)), 0).label("done"),
        ).where(CheckItem.task_id == task.id)
    )
    row = rows.one()
    total = int(row.total)
    if total > 0:
        done = int(row.done)
        task.progress = round(done / total * 100)
    await session.flush()
    return task.progress


def _decrement_count(rec: dict) -> dict:
    """Return a copy of rec with end.count decremented by 1 (if count-based)."""
    import copy

    new = copy.deepcopy(rec)
    end = new.get("end") or {}
    if end.get("type") == "count" and end.get("value") is not None:
        end["value"] = int(end["value"]) - 1
        new["end"] = end
    return new


async def generate_next(session, task: Task) -> Task | None:
    """Close `task` (status=done) and, per its recurrence_json, create the next
    instance with a fresh date and reset checkitems. Returns the new task, or
    None when the recurrence has ended."""
    rec = task.recurrence_json
    base = (rec or {}).get("base", "due")
    if base == "completion":
        ref = date.today()
    else:
        ref = task.due_date or date.today()

    nxt = next_date(rec, ref)

    # close current
    task.status = "done"
    task.done_at = datetime.now(UTC)
    await session.flush()

    if nxt is None:
        return None

    new_rec = _decrement_count(rec)
    new_task = Task(
        title=task.title,
        description=task.description,
        project_id=task.project_id,
        priority=task.priority,
        due_date=nxt,
        due_time=task.due_time,
        end_time=task.end_time,
        recurrence=task.recurrence,
        recurrence_json=new_rec,
        status="todo",
        progress=0,
        pinned=task.pinned,
        parent_task_id=task.parent_task_id,
        source=task.source,
    )
    session.add(new_task)
    await session.flush()
    return new_task


async def complete_task(session, task_id: int) -> tuple[Task, Task | None]:
    """Mark a task done. If it recurs, also generate the next instance.
    Returns (closed_task, next_task_or_None)."""
    task = await session.get(Task, task_id)
    if task is None:
        raise ValueError("task not found")
    if task.recurrence_json:
        nxt = await generate_next(session, task)
        return task, nxt
    task.status = "done"
    task.done_at = datetime.now(UTC)
    await session.flush()
    return task, None


# --------------------------------------------------------------------------- #
# CheckItem CRUD (§3)
# --------------------------------------------------------------------------- #

async def add_checkitem(session, task_id: int, *, title: str) -> CheckItem:
    task = await session.get(Task, task_id)
    if task is None:
        raise ValueError("task not found")
    row = await session.execute(
        select(func.coalesce(func.max(CheckItem.order_index), -1)).where(
            CheckItem.task_id == task_id
        )
    )
    next_order = int(row.scalar_one()) + 1
    item = CheckItem(task_id=task_id, title=title, order_index=next_order)
    session.add(item)
    await session.flush()
    await recompute_progress(session, task)
    return item


async def update_checkitem(
    session, checkitem_id: int, *, title=None, done=None, order_index=None
) -> CheckItem:
    item = await session.get(CheckItem, checkitem_id)
    if item is None:
        raise ValueError("checkitem not found")
    if title is not None:
        item.title = title
    if order_index is not None:
        item.order_index = order_index
    done_changed = done is not None and done != item.done
    if done is not None:
        item.done = done
    await session.flush()
    if done_changed:
        task = await session.get(Task, item.task_id)
        if task is not None:
            await recompute_progress(session, task)
    return item


async def delete_task(session, task_id: int) -> bool:
    """Удалить задачу. Сабтаски (parent_task_id) удаляются вместе с родителем;
    теги (secondary) снимаются явно; checkitems/reminders уходят ORM-каскадом.
    Возвращает False, если задачи нет."""
    task = await session.get(Task, task_id)
    if task is None:
        return False
    children = (
        await session.execute(select(Task).where(Task.parent_task_id == task_id))
    ).scalars().all()
    ids = [task_id, *[c.id for c in children]]
    await session.execute(TaskTag.__table__.delete().where(TaskTag.task_id.in_(ids)))
    for child in children:
        await session.delete(child)
    await session.delete(task)
    await session.flush()
    return True


async def delete_checkitem(session, checkitem_id: int) -> None:
    item = await session.get(CheckItem, checkitem_id)
    if item is None:
        raise ValueError("checkitem not found")
    task_id = item.task_id
    await session.delete(item)
    await session.flush()
    task = await session.get(Task, task_id)
    if task is not None:
        await recompute_progress(session, task)


# --------------------------------------------------------------------------- #
# Reminder CRUD (§3) — full-set replace
# --------------------------------------------------------------------------- #

async def replace_reminders(session, task_id: int, reminders: list[dict]) -> list[Reminder]:
    task = await session.get(Task, task_id)
    if task is None:
        raise ValueError("task not found")
    await session.execute(Reminder.__table__.delete().where(Reminder.task_id == task_id))
    created: list[Reminder] = []
    for r in reminders:
        rem = Reminder(
            task_id=task_id,
            kind=r["kind"],
            offset_minutes=r.get("offset_minutes"),
            at_time=r.get("at_time"),
        )
        session.add(rem)
        created.append(rem)
    await session.flush()
    return created


async def get_task_detail(session, task_id: int) -> Task | None:
    """Load a task with relationships needed for TaskDetail (selectin loads
    tags/checkitems/reminders eagerly)."""
    return await session.get(Task, task_id)


async def list_subtasks(session, parent_task_id: int) -> list[Task]:
    stmt = (
        select(Task)
        .where(Task.parent_task_id == parent_task_id, Task.status != "archived")
        .order_by(Task.order_index, Task.id)
    )
    rows = await session.execute(stmt)
    return list(rows.scalars().all())
