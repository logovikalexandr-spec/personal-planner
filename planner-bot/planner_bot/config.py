from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    tg_bot_token: str = Field(alias="TG_BOT_TOKEN")
    anthropic_api_key: str = Field(alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field(alias="OPENAI_API_KEY")
    nocodb_url: str = Field(alias="NOCODB_URL")
    nocodb_token: str = Field(alias="NOCODB_TOKEN")
    git_repo_path: Path = Field(alias="GIT_REPO_PATH")
    git_remote: str = Field(default="origin", alias="GIT_REMOTE")
    git_user_email: str = Field(default="bot@personal-planner", alias="GIT_USER_EMAIL")
    git_user_name: str = Field(default="planner-bot", alias="GIT_USER_NAME")
    admin_chat_id: int = Field(alias="ADMIN_CHAT_ID")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    default_timezone: str = Field(default="Europe/Prague", alias="DEFAULT_TIMEZONE")
