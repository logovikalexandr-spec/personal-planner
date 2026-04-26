from pathlib import Path
from planner_bot.markdown_files import write_task_md


def test_task_md_layout(tmp_path: Path):
    task = {
        "Id": 17, "author": "sasha", "project": "ctok",
        "quadrant": "Q1", "due": "2026-04-28", "due_time": "14:00",
        "status": "todo", "created": "2026-04-26T14:35:00",
        "title": "Дописать prompt для Ctok bot",
        "description": "контекст: ...",
    }
    p = write_task_md(tmp_path, task)
    assert p.exists()
    text = p.read_text()
    assert "task_id: 17" in text
    assert "quadrant: Q1" in text
    assert "Дописать prompt" in text
