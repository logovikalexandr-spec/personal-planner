from datetime import date

import pytest

from planner.services.workouts import epley_1rm, is_pr, suggest_progression


def test_workout_tables_created(db_engine):
    from planner.db.models import (
        Exercise, SetLog, TemplateExercise, WorkoutSession, WorkoutTemplate,
    )
    names = {Exercise.__tablename__, WorkoutTemplate.__tablename__,
             TemplateExercise.__tablename__, WorkoutSession.__tablename__, SetLog.__tablename__}
    assert names == {"exercise", "workout_template", "template_exercise", "workout_session", "set_log"}


def test_epley_1rm():
    assert round(epley_1rm(100, 1), 1) == 100.0
    assert round(epley_1rm(75, 8), 1) == 95.0


def test_progression_up():
    sets = [{"weight": 50, "reps": 12, "rpe": 7}, {"weight": 50, "reps": 12, "rpe": 8}]
    out = suggest_progression(sets, 8, 12)
    assert out["action"] == "up" and out["delta"] >= 2.5


def test_progression_hold_high_rpe():
    sets = [{"weight": 50, "reps": 12, "rpe": 10}, {"weight": 50, "reps": 12, "rpe": 10}]
    assert suggest_progression(sets, 8, 12)["action"] == "hold"


def test_progression_hold_below_top():
    sets = [{"weight": 50, "reps": 9, "rpe": 8}, {"weight": 50, "reps": 8, "rpe": 8}]
    assert suggest_progression(sets, 8, 12)["action"] == "hold"


def test_progression_down():
    sets = [{"weight": 50, "reps": 6, "rpe": 10}, {"weight": 50, "reps": 5, "rpe": 10}]
    assert suggest_progression(sets, 8, 12)["action"] == "down"


def test_progression_up_no_rpe():
    sets = [{"weight": 20, "reps": 15, "rpe": None}] * 3
    assert suggest_progression(sets, 12, 15)["action"] == "up"


def test_is_pr():
    assert is_pr(96.0, 95.0) is True
    assert is_pr(95.0, 95.0) is False
    assert is_pr(50.0, None) is True


@pytest.mark.asyncio
async def test_exercise_and_session_flow(db_session):
    from planner.services import workouts as svc
    ex = await svc.create_exercise(db_session, {"name": "Жим лёжа", "muscle_group": "chest"})
    await db_session.commit()
    ws = await svc.create_session(db_session, {"project_id": 1, "date": date(2026, 6, 22)})
    await svc.replace_sets(db_session, ws.id, [
        {"exercise_id": ex.id, "set_index": 0, "weight": 75, "reps": 8, "rpe": 8},
        {"exercise_id": ex.id, "set_index": 1, "weight": 75, "reps": 6, "rpe": 9},
    ])
    await db_session.commit()
    assert len(ws.sets) == 2
    hist = await svc.exercise_history(db_session, ex.id)
    assert hist[0]["best_set"]["weight"] == 75
    assert hist[0]["top_1rm"] > 75
    last = await svc.last_sets(db_session, ex.id)
    assert len(last) == 2 and last[0]["weight"] == 75
