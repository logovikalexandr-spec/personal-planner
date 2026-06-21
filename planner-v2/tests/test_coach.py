from contextlib import asynccontextmanager
from datetime import date

import pytest


@pytest.mark.asyncio
async def test_notify_owner_sends(monkeypatch):
    sent = {}

    class FakeSession:
        async def close(self):
            sent["closed"] = True

    class FakeBot:
        session = FakeSession()

        def __init__(self, token):
            sent["token"] = token

        async def send_message(self, chat_id, text):
            sent["chat_id"] = chat_id
            sent["text"] = text

    import planner.bot.utils as u
    monkeypatch.setattr(u, "Bot", FakeBot)
    await u.notify_owner("привет")
    assert sent["text"] == "привет"
    assert sent["chat_id"] == 555


@pytest.mark.asyncio
async def test_analyze_session_writes_note_and_pushes(db_session, monkeypatch):
    from planner.services import coach
    from planner.services import workouts as svc

    ex = await svc.create_exercise(db_session, {"name": "Жим", "muscle_group": "chest",
                                                "default_rep_low": 8, "default_rep_high": 12})
    ws = await svc.create_session(db_session, {"project_id": 1, "date": date(2026, 6, 22)})
    await svc.replace_sets(db_session, ws.id, [
        {"exercise_id": ex.id, "set_index": 0, "weight": 50, "reps": 12, "rpe": 7},
    ])
    await svc.complete_session(db_session, ws.id, "норм шло", 60)
    await db_session.commit()

    pushed = {}

    async def fake_push(text):
        pushed["text"] = text

    async def fake_llm(prompt):
        return "Разбор: жим добил, +2.5 кг."

    @asynccontextmanager
    async def fake_scope():
        yield db_session

    monkeypatch.setattr(coach, "notify_owner", fake_push)
    monkeypatch.setattr(coach, "call_llm", fake_llm)
    monkeypatch.setattr(coach, "_session_scope", fake_scope)

    await coach.analyze_session(ws.id)
    refreshed = await svc.get_session(db_session, ws.id)
    assert refreshed.coach_note and "жим" in refreshed.coach_note.lower()
    assert "text" in pushed
