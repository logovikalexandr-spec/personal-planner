from scripts.create_nocodb_tables import TABLE_DEFINITIONS


def test_inbox_table_columns():
    inbox = TABLE_DEFINITIONS["Inbox"]
    names = {c["title"] for c in inbox["columns"]}
    expected = {"created_at", "author_id", "source_type", "raw_content",
                "title", "summary", "caption", "status", "project_id",
                "target_path", "action_taken", "processed_at",
                "file_path_repo", "attachment_url", "transcript", "confidence"}
    assert expected.issubset(names)


def test_tasks_table_has_quadrant():
    tasks = TABLE_DEFINITIONS["Tasks"]
    quad = next(c for c in tasks["columns"] if c["title"] == "quadrant")
    opts = {o["title"] for o in quad["colOptions"]["options"]}
    assert opts == {"Q1", "Q2", "Q3", "Q4"}


def test_actions_table_present():
    assert "Actions" in TABLE_DEFINITIONS


def test_projects_table_columns():
    proj = TABLE_DEFINITIONS["Projects"]
    names = {c["title"] for c in proj["columns"]}
    assert {"slug", "category", "visibility", "owner_role",
            "context_notes", "context_notes_compact",
            "folder_path", "archived"}.issubset(names)
