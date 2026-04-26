"""NocoDB table creation. Run once per fresh project.

Uses NocoDB v2 metadata API. Tables are created if absent;
existing tables are left untouched.
"""

from __future__ import annotations

import os
import sys
import httpx


def _ss(title: str, options: list[str]) -> dict:
    """Build a SingleSelect column with options in NocoDB v2 format."""
    return {
        "title": title,
        "uidt": "SingleSelect",
        "colOptions": {"options": [{"title": o} for o in options]},
    }


TABLE_DEFINITIONS: dict[str, dict] = {
    "Users": {
        "columns": [
            {"title": "telegram_id", "uidt": "Number"},
            {"title": "name", "uidt": "SingleLineText"},
            _ss("role", ["sasha", "seryozha"]),
            {"title": "timezone", "uidt": "SingleLineText"},
            {"title": "created_at", "uidt": "DateTime"},
        ],
    },
    "Projects": {
        "columns": [
            {"title": "slug", "uidt": "SingleLineText"},
            _ss("category", ["personal", "learning", "work"]),
            {"title": "name", "uidt": "SingleLineText"},
            {"title": "description", "uidt": "LongText"},
            {"title": "context_notes", "uidt": "LongText"},
            {"title": "context_notes_compact", "uidt": "LongText"},
            _ss("visibility", ["private", "shared"]),
            _ss("owner_role", ["sasha", "seryozha"]),
            {"title": "folder_path", "uidt": "SingleLineText"},
            {"title": "color", "uidt": "SingleLineText"},
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "archived", "uidt": "Checkbox"},
        ],
    },
    "Inbox": {
        "columns": [
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "author_id", "uidt": "Number"},
            _ss("source_type", ["url", "text", "voice", "photo", "file", "forward"]),
            {"title": "raw_content", "uidt": "LongText"},
            {"title": "title", "uidt": "SingleLineText"},
            {"title": "summary", "uidt": "LongText"},
            {"title": "caption", "uidt": "LongText"},
            _ss("status", ["new", "thinking", "proposed", "processed", "archived"]),
            {"title": "project_id", "uidt": "Number"},
            {"title": "target_path", "uidt": "SingleLineText"},
            {"title": "action_taken", "uidt": "LongText"},
            {"title": "processed_at", "uidt": "DateTime"},
            {"title": "file_path_repo", "uidt": "SingleLineText"},
            {"title": "attachment_url", "uidt": "SingleLineText"},
            {"title": "transcript", "uidt": "LongText"},
            {"title": "confidence", "uidt": "Decimal"},
        ],
    },
    "Tasks": {
        "columns": [
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "author_id", "uidt": "Number"},
            {"title": "title", "uidt": "SingleLineText"},
            {"title": "description", "uidt": "LongText"},
            {"title": "project_id", "uidt": "Number"},
            _ss("quadrant", ["Q1", "Q2", "Q3", "Q4"]),
            {"title": "due_date", "uidt": "Date"},
            {"title": "due_time", "uidt": "Time"},
            _ss("status", ["todo", "in_progress", "done", "archived"]),
            {"title": "done_at", "uidt": "DateTime"},
            {"title": "inbox_id", "uidt": "Number"},
            {"title": "source_text", "uidt": "LongText"},
            {"title": "gcal_event_id", "uidt": "SingleLineText"},
            {"title": "file_path_repo", "uidt": "SingleLineText"},
        ],
    },
    "Actions": {
        "columns": [
            {"title": "created_at", "uidt": "DateTime"},
            {"title": "inbox_id", "uidt": "Number"},
            {"title": "task_id", "uidt": "Number"},
            {"title": "author_id", "uidt": "Number"},
            _ss("action_type", ["propose_project", "process", "move",
                                "summarize", "transcribe", "clarify", "compact"]),
            {"title": "llm_input", "uidt": "LongText"},
            {"title": "llm_output", "uidt": "LongText"},
            {"title": "llm_model", "uidt": "SingleLineText"},
            {"title": "tokens_in", "uidt": "Number"},
            {"title": "tokens_out", "uidt": "Number"},
            {"title": "cost_usd", "uidt": "Decimal"},
            {"title": "user_decision", "uidt": "LongText"},
        ],
    },
}


def main() -> int:
    base = os.environ["NOCODB_URL"].rstrip("/")
    token = os.environ["NOCODB_TOKEN"]
    base_id = os.environ["NOCODB_BASE_ID"]
    headers = {"xc-token": token}
    with httpx.Client(base_url=base, headers=headers, timeout=30.0) as c:
        existing = c.get(f"/meta/bases/{base_id}/tables").json().get("list", [])
        existing_titles = {t["title"] for t in existing}
        for title, spec in TABLE_DEFINITIONS.items():
            if title in existing_titles:
                print(f"skip: {title} exists")
                continue
            payload = {"title": title, "columns": spec["columns"]}
            resp = c.post(f"/meta/bases/{base_id}/tables", json=payload)
            if resp.is_error:
                print(f"ERROR {title}: {resp.text}")
                return 1
            print(f"created: {title} (id={resp.json().get('id')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
