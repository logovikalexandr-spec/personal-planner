from unittest.mock import patch
from planner_bot.bot import build_application
from planner_bot.config import Settings


def test_post_init_registers_jobs(monkeypatch):
    for k, v in {
        "TG_BOT_TOKEN": "x", "ANTHROPIC_API_KEY": "x",
        "OPENAI_API_KEY": "x", "NOCODB_URL": "http://x",
        "NOCODB_TOKEN": "x", "GIT_REPO_PATH": "/tmp/x",
        "ADMIN_CHAT_ID": "1",
    }.items():
        monkeypatch.setenv(k, v)
    settings = Settings()
    with patch("planner_bot.bot.NocoDBClient"), \
         patch("planner_bot.bot.AnthropicLLM"), \
         patch("planner_bot.bot.WhisperClient"):
        app = build_application(settings)
    job_names = {j.name for j in app.job_queue.jobs()}
    assert {"morning_digest", "evening_q1", "due_warner"}.issubset(job_names)
