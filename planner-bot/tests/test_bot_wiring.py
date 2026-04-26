from unittest.mock import patch

from planner_bot.bot import build_application
from planner_bot.config import Settings


def _set_env(monkeypatch):
    for k, v in {
        "TG_BOT_TOKEN": "x", "ANTHROPIC_API_KEY": "x",
        "OPENAI_API_KEY": "x", "NOCODB_URL": "http://x",
        "NOCODB_TOKEN": "x", "GIT_REPO_PATH": "/tmp/x",
        "ADMIN_CHAT_ID": "1",
    }.items():
        monkeypatch.setenv(k, v)


def test_app_registers_start_command(monkeypatch):
    _set_env(monkeypatch)
    settings = Settings()
    with patch("planner_bot.bot.NocoDBClient"), \
         patch("planner_bot.bot.AnthropicLLM"), \
         patch("planner_bot.bot.anthropic.AsyncAnthropic"):
        app = build_application(settings)
    cmd_names = set()
    for h_list in app.handlers.values():
        for h in h_list:
            if h.__class__.__name__ == "CommandHandler":
                for c in h.commands:
                    cmd_names.add(c)
    assert "start" in cmd_names


def test_app_registers_callback_handlers(monkeypatch):
    _set_env(monkeypatch)
    settings = Settings()
    with patch("planner_bot.bot.NocoDBClient"), \
         patch("planner_bot.bot.AnthropicLLM"), \
         patch("planner_bot.bot.anthropic.AsyncAnthropic"):
        app = build_application(settings)
    patterns = set()
    for h_list in app.handlers.values():
        for h in h_list:
            if h.__class__.__name__ == "CallbackQueryHandler":
                patterns.add(h.pattern.pattern)
    assert any("process:" in p for p in patterns)
    assert any("clarify:" in p for p in patterns)
    assert any("archive:" in p for p in patterns)


def test_app_wires_bot_data_keys(monkeypatch):
    _set_env(monkeypatch)
    settings = Settings()
    with patch("planner_bot.bot.NocoDBClient"), \
         patch("planner_bot.bot.AnthropicLLM"), \
         patch("planner_bot.bot.anthropic.AsyncAnthropic"):
        app = build_application(settings)
    expected_keys = {"users_repo", "projects_repo", "inbox_repo",
                     "tasks_repo", "actions_repo",
                     "classify_inbox", "process_inbox",
                     "extract_clarification",
                     "git_safe_commit", "repo_path"}
    assert expected_keys.issubset(app.bot_data.keys())
