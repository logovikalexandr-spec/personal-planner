from planner_bot.config import Settings


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("TG_BOT_TOKEN", "abc")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k1")
    monkeypatch.setenv("OPENAI_API_KEY", "k2")
    monkeypatch.setenv("NOCODB_URL", "http://x/api/v2")
    monkeypatch.setenv("NOCODB_TOKEN", "t")
    monkeypatch.setenv("NOCODB_TABLE_USERS", "tid_users")
    monkeypatch.setenv("NOCODB_TABLE_PROJECTS", "tid_projects")
    monkeypatch.setenv("NOCODB_TABLE_INBOX", "tid_inbox")
    monkeypatch.setenv("NOCODB_TABLE_TASKS", "tid_tasks")
    monkeypatch.setenv("NOCODB_TABLE_ACTIONS", "tid_actions")
    monkeypatch.setenv("GIT_REPO_PATH", "/tmp/repo")
    monkeypatch.setenv("ADMIN_CHAT_ID", "42")
    s = Settings()
    assert s.tg_bot_token == "abc"
    assert s.admin_chat_id == 42
    assert s.default_timezone == "Europe/Prague"
    assert str(s.git_repo_path) == "/tmp/repo"


def test_settings_missing_required(monkeypatch):
    for k in ("TG_BOT_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
             "NOCODB_URL", "NOCODB_TOKEN", "GIT_REPO_PATH", "ADMIN_CHAT_ID"):
        monkeypatch.delenv(k, raising=False)
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings()
