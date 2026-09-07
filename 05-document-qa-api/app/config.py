"""Runtime configuration, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="QA_", extra="ignore")

    # --- AI provider ---
    openai_api_key: str | None = Field(default=None)
    chat_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    # When true, no network calls are made: deterministic fake embeddings + a
    # stub answerer are used. Lets the test suite and local demos run with no key.
    fake_ai: bool = False

    # --- Storage ---
    data_dir: Path = Path("data")

    # --- Ingestion / retrieval knobs ---
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_k: int = 4
    max_upload_mb: int = 25

    # --- API ---
    cors_origins: str = "*"

    @property
    def index_dir(self) -> Path:
        return self.data_dir / "faiss"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "documents.db"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        return self.fake_ai or bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.index_dir.mkdir(parents=True, exist_ok=True)
    return settings
