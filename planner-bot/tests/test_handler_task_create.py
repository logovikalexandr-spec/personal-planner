import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.tasks_commands import create_task_with_args
from tests.fakes.tg_fake import FakeContext


@pytest.mark.asyncio
async def test_create_task_inserts_row_and_writes_file(tmp_path):
    user = {"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}
    tasks_repo = MagicMock()
    tasks_repo.create = AsyncMock(return_value={"Id": 17})
    tasks_repo.update = AsyncMock()
    projects_repo = MagicMock()
    projects_repo.get_by_slug = AsyncMock(return_value={
        "Id": 9, "slug": "ctok", "visibility": "private",
        "owner_role": "sasha"})
    actions_repo = MagicMock(); actions_repo.log = AsyncMock()

    ctx = FakeContext()
    (tmp_path / "tasks").mkdir()
    ctx.bot_data.update({
        "tasks_repo": tasks_repo, "projects_repo": projects_repo,
        "actions_repo": actions_repo,
        "git_safe_commit": MagicMock(), "repo_path": tmp_path,
    })

    out = await create_task_with_args(
        user=user,
        title="Дописать prompt", description="",
        project_slug="ctok", quadrant="Q1",
        due_date="2026-04-28", due_time="14:00",
        source_text="завтра 14:00 дописать prompt",
        context=ctx,
    )
    assert out["Id"] == 17
    tasks_repo.create.assert_awaited()
    fields = tasks_repo.create.call_args.args[0]
    assert fields["quadrant"] == "Q1"
    assert fields["due_date"] == "2026-04-28"
    assert fields["project_id"] == 9
