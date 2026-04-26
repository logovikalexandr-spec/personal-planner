from pathlib import Path
from planner_bot.repo_layout import (
    inbox_path, archive_inbox_path, project_subfolder, task_path,
    slugify, all_skeleton_dirs,
)


def test_slugify_cyrillic():
    assert slugify("Как работает PostgreSQL replication")[:30] \
        == "kak-rabotaet-postgresql-replic"


def test_inbox_path_format():
    p = inbox_path(Path("/repo"), "2026-04-26T14:32:00", "PostgreSQL replication")
    assert str(p) == "/repo/_inbox/2026-04-26-1432-postgresql-replication.md"


def test_project_subfolder():
    p = project_subfolder(Path("/repo"), "projects/work/ctok", "research")
    assert str(p) == "/repo/projects/work/ctok/research"


def test_task_path():
    p = task_path(Path("/repo"), "2026-04-26T14:35:00", "Дописать prompt для Ctok bot")
    assert str(p) == "/repo/tasks/2026-04/2026-04-26-1435-dopisat-prompt-dlya-ctok-bot.md"


def test_archive_inbox_path():
    p = archive_inbox_path(Path("/repo"), "2026-03")
    assert str(p) == "/repo/_archive/inbox/2026-03"


def test_skeleton_dirs_includes_all_projects():
    dirs = all_skeleton_dirs()
    assert "projects/personal/sasha/research" in dirs
    assert "projects/personal/seryozha/files" in dirs
    assert "projects/learning/notes" in dirs
    assert "projects/work/ctok/inbox" in dirs
    assert "projects/work/zima/research" in dirs
    assert "_inbox" in dirs
    assert "_archive/inbox" in dirs
    assert "_archive/tasks" in dirs
    assert "_meta/context_notes_history" in dirs
    assert "_meta/monthly_reports" in dirs
    assert "tasks" in dirs
