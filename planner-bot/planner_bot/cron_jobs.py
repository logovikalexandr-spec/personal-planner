from __future__ import annotations

from datetime import date, time
from zoneinfo import ZoneInfo

from telegram.ext import Application


async def morning_digest_for_user(*, bot, user, shared_authors,
                                  inbox_repo, tasks_repo, today: date):
    inbox_items = await inbox_repo.list_unprocessed_for_user(
        author_id=user["Id"], shared_authors=shared_authors,
    )
    q1_today = await tasks_repo.list_q1_today(
        author_id=user["Id"], today=today.isoformat(),
    )
    active = await tasks_repo.list_for_user_active(user["Id"])
    q2_count = sum(1 for t in active if t.get("quadrant") == "Q2")
    out = [f"Доброе утро, {user['name']} 👋"]
    if q1_today:
        out.append("\n🔥 Q1 на сегодня:")
        for t in q1_today:
            tm = (t.get("due_time") or "").strip()
            prefix = f"{tm} " if tm else ""
            out.append(f"  • {prefix}#{t['Id']} {t['title']}")
    else:
        out.append("\n🔥 Q1: пусто.")
    if q2_count:
        out.append(f"\n📌 Q2 на этой неделе — {q2_count} задач (/week)")
    if inbox_items:
        out.append(f"\n📥 Inbox: {len(inbox_items)} необработанных")
        for i in inbox_items[:5]:
            out.append(f"  #{i['Id']} {i['title']}")
    await bot.send_message(chat_id=user["telegram_id"],
                           text="\n".join(out))


async def _morning_job_callback(context):
    users_repo = context.application.bot_data["users_repo"]
    inbox_repo = context.application.bot_data["inbox_repo"]
    tasks_repo = context.application.bot_data["tasks_repo"]
    all_users = await users_repo.list_all()
    today = date.today()
    for u in all_users:
        if not u.get("telegram_id"):
            continue
        shared = [x["Id"] for x in all_users if x["Id"] != u["Id"]]
        await morning_digest_for_user(
            bot=context.bot, user=u, shared_authors=shared,
            inbox_repo=inbox_repo, tasks_repo=tasks_repo, today=today,
        )


async def evening_q1_for_user(*, bot, user, tasks_repo, today: date):
    rows = await tasks_repo.list_q1_today(author_id=user["Id"],
                                          today=today.isoformat())
    if not rows:
        return
    out = ["Вечерняя проверка 🌆\n\nQ1 на сегодня (статус todo):"]
    for t in rows:
        out.append(f"  ⏳ #{t['Id']} {t['title']}")
    await bot.send_message(chat_id=user["telegram_id"],
                           text="\n".join(out))


async def _evening_q1_callback(context):
    users_repo = context.application.bot_data["users_repo"]
    tasks_repo = context.application.bot_data["tasks_repo"]
    today = date.today()
    for u in await users_repo.list_all():
        if not u.get("telegram_id"):
            continue
        await evening_q1_for_user(bot=context.bot, user=u,
                                  tasks_repo=tasks_repo, today=today)


def register_cron_jobs(app: Application) -> None:
    settings = app.bot_data["settings"]
    tz = ZoneInfo(settings.default_timezone)
    app.job_queue.run_daily(
        _morning_job_callback,
        time=time(hour=8, minute=0, tzinfo=tz),
        name="morning_digest",
    )
    app.job_queue.run_daily(
        _evening_q1_callback,
        time=time(hour=19, minute=0, tzinfo=tz),
        name="evening_q1",
    )
