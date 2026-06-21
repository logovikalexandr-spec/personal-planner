from datetime import date, timedelta

import pytest

from planner.services import tracking as svc


# ── чистая логика ─────────────────────────────────────────────────────────── #
def test_is_done_check():
    assert svc.habit_is_done("check", 1, None) is True
    assert svc.habit_is_done("check", 0, None) is False


def test_is_done_count():
    assert svc.habit_is_done("count", 8, 8) is True
    assert svc.habit_is_done("count", 5, 8) is False
    assert svc.habit_is_done("count", 0.5, None) is True  # target нет → любой >0


def test_heat_level_gradient():
    assert svc.habit_heat_level("count", 0, 8) == 0
    assert svc.habit_heat_level("count", 2, 8) == 1   # 0.25*4=1
    assert svc.habit_heat_level("count", 4, 8) == 2   # 0.5*4=2
    assert svc.habit_heat_level("count", 8, 8) == 4
    assert svc.habit_heat_level("count", 100, 8) == 4  # clamp
    assert svc.habit_heat_level("check", 1, None) == 4
    assert svc.habit_heat_level("check", 0, None) == 0


# ── чистый стрик под расписание ───────────────────────────────────────────── #
def test_streak_daily_pure():
    today = date(2026, 6, 12)
    done = {today - timedelta(days=i) for i in range(3)}  # сегодня..-2
    assert svc.compute_streak_pure(done, today, "daily", None, None) == 3
    # сегодня не отмечено → дневной стрик 0
    assert svc.compute_streak_pure(done - {today}, today, "daily", None, None) == 0


def test_streak_by_days_skips_offdays():
    today = date(2026, 6, 12)  # пятница
    sched = [0, 2, 4]  # Пн/Ср/Пт
    done = {date(2026, 6, 12), date(2026, 6, 10), date(2026, 6, 8)}  # Пт/Ср/Пн
    # выходные/Вт/Чт вне графика — серию не рвут
    assert svc.compute_streak_pure(done, today, "by_days", sched, None) == 3


def test_streak_by_days_today_grace():
    today = date(2026, 6, 12)  # пятница, плановый, ещё НЕ отмечен
    sched = [0, 2, 4]
    done = {date(2026, 6, 10), date(2026, 6, 8)}  # Ср/Пн
    assert svc.compute_streak_pure(done, today, "by_days", sched, None) == 2


def test_streak_by_days_breaks_on_missed_plan_day():
    today = date(2026, 6, 12)
    sched = [0, 2, 4]
    # Ср 10 пропущен → серия = только Пт сегодня
    done = {date(2026, 6, 12), date(2026, 6, 8)}
    assert svc.compute_streak_pure(done, today, "by_days", sched, None) == 1


def test_streak_weekly_n_counts_weeks():
    today = date(2026, 6, 12)  # неделя 08–14
    done = {
        date(2026, 6, 8), date(2026, 6, 10), date(2026, 6, 12),   # тек. неделя = 3
        date(2026, 6, 1), date(2026, 6, 3), date(2026, 6, 5),     # пред. неделя = 3
    }
    assert svc.compute_streak_pure(done, today, "weekly_n", None, 3) == 2


def test_streak_weekly_n_current_week_grace():
    today = date(2026, 6, 12)
    done = {
        date(2026, 6, 12),                                        # тек. неделя = 1 (<3, недобор)
        date(2026, 6, 1), date(2026, 6, 3), date(2026, 6, 5),     # пред. = 3
    }
    # недобор текущей недели не рвёт серию, но и не считается
    assert svc.compute_streak_pure(done, today, "weekly_n", None, 3) == 1


# ── БД ────────────────────────────────────────────────────────────────────── #
@pytest.mark.asyncio
async def test_create_and_list_habit(db_session):
    h = await svc.create_habit(db_session, {"name": "Зарядка", "mark_type": "check"})
    assert h.id is not None
    assert h.order_index == 0
    lst = await svc.list_habits(db_session)
    assert [x.name for x in lst] == ["Зарядка"]


@pytest.mark.asyncio
async def test_toggle_habit_set_and_unset(db_session):
    h = await svc.create_habit(db_session, {"name": "Медит", "mark_type": "check"})
    today = date(2026, 6, 11)
    assert await svc.toggle_habit(db_session, h.id, today) is True
    assert await svc.toggle_habit(db_session, h.id, today) is False  # откат


@pytest.mark.asyncio
async def test_add_value_sums(db_session):
    h = await svc.create_habit(db_session, {"name": "Вода", "mark_type": "count", "target": 2.0})
    today = date(2026, 6, 11)
    assert await svc.add_habit_value(db_session, h.id, today, 0.5) == 0.5
    assert await svc.add_habit_value(db_session, h.id, today, 0.5) == 1.0  # сумма
    assert await svc.add_habit_value(db_session, h.id, today, -2.0) == 0.0  # не ниже 0


@pytest.mark.asyncio
async def test_backfill_set_value(db_session):
    h = await svc.create_habit(db_session, {"name": "Чтение", "mark_type": "check"})
    d = date(2026, 6, 9)
    await svc.set_habit_value(db_session, h.id, d, 1)
    e = await svc._get_entry(db_session, h.id, d)
    assert e.value == 1
    await svc.set_habit_value(db_session, h.id, d, 0)  # сброс = удаление
    assert await svc._get_entry(db_session, h.id, d) is None


@pytest.mark.asyncio
async def test_compute_streak(db_session):
    h = await svc.create_habit(db_session, {"name": "Бег", "mark_type": "check"})
    today = date(2026, 6, 11)
    for i in range(3):  # сегодня, вчера, позавчера
        await svc.toggle_habit(db_session, h.id, today - timedelta(days=i))
    streak = await svc.compute_streak(db_session, h, today)
    assert streak == 3
    assert h.record_streak == 3
    # пропуск: 4 дня назад отметим, разрыв на 3 дня назад → стрик всё ещё 3
    await svc.toggle_habit(db_session, h.id, today - timedelta(days=4))
    assert await svc.compute_streak(db_session, h, today) == 3


@pytest.mark.asyncio
async def test_metric_replace_and_list(db_session):
    m = await svc.create_metric(db_session, {"name": "Вес", "unit": "кг", "good_direction": "down"})
    d = date(2026, 6, 11)
    await svc.set_metric_value(db_session, m.id, d, 78.4)
    await svc.set_metric_value(db_session, m.id, d, 78.2)  # ЗАМЕНА того же дня
    entries = await svc.list_metric_entries(db_session, m.id)
    assert len(entries) == 1
    assert entries[0].value == 78.2


@pytest.mark.asyncio
async def test_week_retro(db_session):
    h = await svc.create_habit(db_session, {"name": "Зарядка", "mark_type": "check"})
    monday = date(2026, 6, 8)  # пн
    for i in range(3):
        await svc.toggle_habit(db_session, h.id, monday + timedelta(days=i))
    r = await svc.week_review(db_session, monday, date(2026, 6, 14))
    assert r["habits"]["count"] == 1
    assert r["habits"]["done_days"] == 3
    assert r["habits"]["total_days"] == 7
    assert r["tasks"]["done"] == 0  # задач нет
