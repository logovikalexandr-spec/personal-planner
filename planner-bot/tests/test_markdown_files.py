from datetime import datetime
from pathlib import Path

from planner_bot.markdown_files import write_inbox_md, render_inbox_frontmatter


def test_render_frontmatter_minimal():
    fm = render_inbox_frontmatter({
        "Id": 42, "author_name": "sasha",
        "source_type": "url", "raw_content": "https://x",
        "title": "X", "summary": "s",
        "created_at": "2026-04-26T14:32:00",
        "status": "new", "project_slug": None,
    })
    assert "inbox_id: 42" in fm
    assert "author: sasha" in fm
    assert "source: url" in fm
    assert "url: https://x" in fm
    assert "status: new" in fm
    assert "project: null" in fm


def test_write_inbox_md_creates_file(tmp_path: Path):
    repo = tmp_path
    (repo / "_inbox").mkdir()
    p = write_inbox_md(repo, {
        "Id": 42, "author_name": "sasha", "source_type": "text",
        "raw_content": "купить молоко", "title": "Купить молоко",
        "summary": "Заметка", "created_at": "2026-04-26T14:32:00",
        "status": "new", "project_slug": None,
    })
    assert p.exists()
    text = p.read_text()
    assert "# Купить молоко" in text
    assert "inbox_id: 42" in text
