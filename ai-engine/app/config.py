from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str
    openai_api_key: str | None = None   # Optional — enables Whisper voice transcription
    redis_url: str = "redis://localhost:6379"
    port: int = 8000
    log_level: str = "info"

    # Claude model IDs
    model_question_gen: str = "claude-sonnet-4-6"
    model_evaluator: str = "claude-opus-4-6"
    model_coach: str = "claude-sonnet-4-6"
    model_resume: str = "claude-haiku-4-5-20251001"


settings = Settings()  # type: ignore[call-arg]
