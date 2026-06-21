"""Идемпотентный сид каталога упражнений + 4 шаблонов тренировок для цели.
Порядок шаблонов = реальная очередь чередования Верх→Низ→Верх→Низ.
Данные — из personal-planner/тренер/программа.md.
"""
from __future__ import annotations

from sqlalchemy import select

from planner.db.models import Exercise, TemplateExercise, WorkoutTemplate

# (name, muscle_group, rep_low, rep_high)
CATALOG: list[tuple[str, str, int, int]] = [
    ("Жим штанги лёжа", "chest", 6, 8),
    ("Тяга штанги в наклоне", "back", 6, 8),
    ("Армейский жим", "delts", 8, 10),
    ("Подтягивания с весом", "back", 6, 10),
    ("Вертикальная тяга блока", "back", 10, 12),
    ("Сгибания на бицепс штанга", "biceps", 10, 12),
    ("Разгибания на трицепс", "triceps", 10, 12),
    ("Приседания со штангой", "quads", 6, 8),
    ("Румынская тяга", "hamstrings", 8, 10),
    ("Жим ногами", "quads", 10, 12),
    ("Сгибания ног лёжа", "hamstrings", 10, 12),
    ("Подъём на носки стоя", "calves", 12, 15),
    ("Пресс — упор Паллоф", "core", 12, 12),
    ("Пресс — мёртвый жук", "core", 8, 10),
    ("Жим гантелей на наклонной 30°", "chest", 8, 10),
    ("Подтягивания широким хватом", "back", 8, 10),
    ("Тяга верхнего блока узким хватом", "back", 10, 12),
    ("Горизонтальная тяга блока сидя", "back", 10, 12),
    ("Махи гантелями в стороны", "delts", 12, 15),
    ("Тяга к лицу (Face Pull)", "delts", 12, 15),
    ("Сгибания на бицепс (наклон)", "biceps", 12, 12),
    ("Молотки", "biceps", 12, 12),
    ("Жим ногами (высокая постановка)", "glutes", 8, 10),
    ("Болгарские сплит-приседы", "glutes", 10, 12),
    ("Разгибания ног сидя", "quads", 12, 15),
    ("Сгибания ног сидя", "hamstrings", 12, 15),
    ("Сведение/разведение ног", "glutes", 12, 15),
    ("Подъём на носки сидя", "calves", 15, 20),
]

# порядок ключей = очередь чередования. value = [(exercise_name, target_sets)]
TEMPLATES: dict[str, list[tuple[str, int]]] = {
    "Верх-Сила": [
        ("Жим штанги лёжа", 3), ("Тяга штанги в наклоне", 3), ("Армейский жим", 3),
        ("Подтягивания с весом", 3), ("Вертикальная тяга блока", 3),
        ("Сгибания на бицепс штанга", 3), ("Разгибания на трицепс", 3),
    ],
    "Низ-Квадрицепс": [
        ("Приседания со штангой", 3), ("Румынская тяга", 3), ("Жим ногами", 3),
        ("Сгибания ног лёжа", 3), ("Подъём на носки стоя", 3),
        ("Пресс — упор Паллоф", 3), ("Пресс — мёртвый жук", 3),
    ],
    "Верх-Гипертрофия": [
        ("Жим гантелей на наклонной 30°", 3), ("Подтягивания широким хватом", 3),
        ("Тяга верхнего блока узким хватом", 3), ("Горизонтальная тяга блока сидя", 3),
        ("Махи гантелями в стороны", 4), ("Тяга к лицу (Face Pull)", 4),
        ("Сгибания на бицепс (наклон)", 3), ("Молотки", 3), ("Разгибания на трицепс", 3),
    ],
    "Низ-Задняя цепь": [
        ("Жим ногами (высокая постановка)", 3), ("Болгарские сплит-приседы", 3),
        ("Разгибания ног сидя", 3), ("Сгибания ног сидя", 4),
        ("Сведение/разведение ног", 4), ("Подъём на носки сидя", 4), ("Пресс — упор Паллоф", 3),
    ],
}


async def seed_workout(session, project_id: int) -> None:
    by_name: dict[str, Exercise] = {
        e.name: e for e in (await session.execute(select(Exercise))).scalars()
    }
    for i, (name, mg, lo, hi) in enumerate(CATALOG):
        if name not in by_name:
            ex = Exercise(name=name, muscle_group=mg, default_rep_low=lo, default_rep_high=hi,
                          is_custom=False, order_index=i)
            session.add(ex)
            await session.flush()
            by_name[name] = ex

    have = {
        t.name for t in (await session.execute(
            select(WorkoutTemplate).where(WorkoutTemplate.project_id == project_id))).scalars()
    }
    for ti, (tname, items) in enumerate(TEMPLATES.items()):
        if tname in have:
            continue
        tpl = WorkoutTemplate(project_id=project_id, name=tname, order_index=ti)
        session.add(tpl)
        await session.flush()
        for oi, (exname, sets) in enumerate(items):
            ex = by_name[exname]
            session.add(TemplateExercise(
                template_id=tpl.id, exercise_id=ex.id, order_index=oi, target_sets=sets,
                rep_low=ex.default_rep_low or 8, rep_high=ex.default_rep_high or 12,
            ))
    await session.flush()
