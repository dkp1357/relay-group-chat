from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://relay:relaypass@localhost:5432/relay"
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = "dev-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    UPLOAD_DIR: str = "uploads"
    HTTP_BASE: str = "http://localhost:8000"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
