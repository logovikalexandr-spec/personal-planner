from planner.config import Settings


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:abc")
    monkeypatch.setenv("OWNER_TELEGRAM_ID", "555")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    s = Settings()
    assert s.telegram_bot_token == "123:abc"
    assert s.owner_telegram_id == 555
    assert s.mini_app_initdata_max_age_sec == 86400  # дефолт
