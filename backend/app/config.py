from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 1440
    database_url: str = "sqlite:///./clinic.db"

    use_mock_llm: bool = True
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    use_mock_email: bool = True
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from: str = "clinic@example.com"

    use_mock_calendar: bool = True
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/calendar/oauth2callback"

    reminder_poll_seconds: int = 60


settings = Settings()
