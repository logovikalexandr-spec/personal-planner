from __future__ import annotations

from sqlalchemy import delete, select, update

from planner.db.models import Project, Stage, StageDependency, Task

_VALID_STATUS = {"done", "current", "future", "late"}
_STAGE_FIELDS = {
    "name", "order_index", "start_date", "end_date",
    "status", "progress", "is_milestone", "milestone_date",
}


async def _next_order_index(session, project_id: int) -> int:
    rows = await session.execute(
        select(Stage.order_index).where(Stage.project_id == project_id)
    )
    vals = [v for (v,) in rows]
    return (max(vals) + 1) if vals else 0


async def _set_dependencies(session, stage_id: int, depends_on_ids: list[int]) -> None:
    await session.execute(
        delete(StageDependency).where(StageDependency.to_stage_id == stage_id)
    )
    for dep_id in dict.fromkeys(depends_on_ids):  # dedup, keep order
        if dep_id == stage_id:
            continue  # нет самозависимости
        session.add(StageDependency(from_stage_id=dep_id, to_stage_id=stage_id))


async def depends_on_ids(session, stage_id: int) -> list[int]:
    rows = await session.execute(
        select(StageDependency.from_stage_id)
        .where(StageDependency.to_stage_id == stage_id)
        .order_by(StageDependency.from_stage_id)
    )
    return [v for (v,) in rows]


async def list_stages(session, project_id: int) -> list[Stage]:
    rows = await session.execute(
        select(Stage)
        .where(Stage.project_id == project_id)
        .order_by(Stage.order_index, Stage.id)
    )
    return list(rows.scalars().all())


async def list_milestones(session, from_date, to_date) -> list[Stage]:
    """Все вехи (is_milestone) с milestone_date в окне [from,to] по ВСЕМ проектам.

    Календарь рисует флажки одним запросом, не обходя проекты по одному.
    """
    rows = await session.execute(
        select(Stage)
        .where(Stage.is_milestone.is_(True))
        .where(Stage.milestone_date.is_not(None))
        .where(Stage.milestone_date >= from_date)
        .where(Stage.milestone_date <= to_date)
        .order_by(Stage.milestone_date, Stage.id)
    )
    return list(rows.scalars().all())


async def create_stage(session, data: dict) -> Stage:
    project_id = data["project_id"]
    if await session.get(Project, project_id) is None:
        raise ValueError("project not found")
    status = data.get("status") or "future"
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    order_index = data.get("order_index")
    if order_index is None:
        order_index = await _next_order_index(session, project_id)
    stage = Stage(
        project_id=project_id,
        name=data["name"],
        order_index=order_index,
        start_date=data.get("start_date"),
        end_date=data.get("end_date"),
        status=status,
        progress=data.get("progress") or 0,
        is_milestone=bool(data.get("is_milestone")),
        milestone_date=data.get("milestone_date"),
    )
    session.add(stage)
    await session.flush()
    deps = data.get("depends_on_ids")
    if deps:
        await _set_dependencies(session, stage.id, deps)
        await session.flush()
    return stage


async def update_stage(session, stage_id: int, changes: dict) -> Stage:
    stage = await session.get(Stage, stage_id)
    if stage is None:
        raise ValueError("stage not found")
    if "status" in changes and changes["status"] is not None:
        if changes["status"] not in _VALID_STATUS:
            raise ValueError(f"invalid status: {changes['status']}")
    for key, value in changes.items():
        if key in _STAGE_FIELDS:
            setattr(stage, key, value)
    if "depends_on_ids" in changes and changes["depends_on_ids"] is not None:
        await _set_dependencies(session, stage_id, changes["depends_on_ids"])
    await session.flush()
    return stage


async def delete_stage(session, stage_id: int) -> None:
    stage = await session.get(Stage, stage_id)
    if stage is None:
        raise ValueError("stage not found")
    # портируемая зачистка ссылок (SQLite в тестах не форсит FK ondelete)
    await session.execute(
        update(Task).where(Task.stage_id == stage_id).values(stage_id=None)
    )
    await session.execute(
        delete(StageDependency).where(
            (StageDependency.from_stage_id == stage_id)
            | (StageDependency.to_stage_id == stage_id)
        )
    )
    await session.delete(stage)
    await session.flush()


async def update_project_ai(session, project_id: int, changes: dict) -> Project:
    proj = await session.get(Project, project_id)
    if proj is None:
        raise ValueError("project not found")
    sp = changes.get("success_probability")
    if sp is not None and not (0 <= sp <= 100):
        raise ValueError("success_probability must be 0..100")
    if "success_probability" in changes:
        new_sp = changes["success_probability"]
        # сдвигаем prev → текущее перед записью нового, чтобы карточка показала тренд ▲/▼
        if new_sp != proj.success_probability and proj.success_probability is not None:
            proj.success_probability_prev = proj.success_probability
        proj.success_probability = new_sp
    if "target_date" in changes:
        proj.target_date = changes["target_date"]
    if "ai_notes" in changes:
        proj.ai_notes = changes["ai_notes"]
    await session.flush()
    return proj
