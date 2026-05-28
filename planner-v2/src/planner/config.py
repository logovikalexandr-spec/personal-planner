from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telegram_bot_token: str
    owner_telegram_id: int
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    mini_app_initdata_max_age_sec: int = 86400
    mini_app_dist_dir: str = "frontend/dist"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
