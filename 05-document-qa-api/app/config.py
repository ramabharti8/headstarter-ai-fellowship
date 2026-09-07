"""Runtime configuration, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["openai", "groq", "gemini", "fake"]

# Per-provider defaults: (chat model, embedding model). "local" means embeddings
# run on-device via fastembed (no API, no key) — Groq has no embeddings endpoint.
_CHAT_DEFAULTS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    # Groq rotates its hosted models; gpt-oss-20b is fast and free. Larger
    # option: "openai/gpt-oss-120b". Check https://console.groq.com/docs/models
    "groq": "openai/gpt-oss-20b",
    "gemini": "gemini-2.0-flash",
}
_EMBED_DEFAULTS: dict[str, str] = {
    "openai": "text-embedding-3-small",
    "groq": "local",
    "gemini": "models/text-embedding-004",
}
_LOCAL_EMBED_MODEL = "BAAI/bge-small-en-v1.5"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="QA_", extra="ignore")

    # --- AI provider ---
    # "auto" picks the first provider that has a key: openai -> groq -> gemini,
    # falling back to "fake" (deterministic, offline) when none is set.
    provider: Literal["auto", "openai", "groq", "gemini", "fake"] = "auto"

    openai_api_key: str | None = Field(default=None)
    groq_api_key: str | None = Field(default=None)
    google_api_key: str | None = Field(default=None)

    # Override the per-provider default models if set.
    chat_model: str | None = None
    embedding_model: str | None = None

    # Back-compat: QA_FAKE_AI=1 forces the offline provider.
    fake_ai: bool = False

    # --- Storage ---
    data_dir: Path = Path("data")

    # --- Ingestion / retrieval knobs ---
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_k: int = 6  # chunks fed to the model; raise for broad questions
    max_answer_tokens: int = 2000  # ceiling on generated answer / summary length
    snippet_chars: int = 500  # length of each source excerpt in the response
    summary_max_chunks: int = 40  # /summarize caps work here to fit free-tier limits
    max_upload_mb: int = 25

    # --- API ---
    cors_origins: str = "*"

    # --- Abuse protection (applied only when QA_API_KEY is NOT set) ---
    rate_limit_per_min: int = 20  # requests per client IP per minute; 0 disables
    uploads_per_day_per_ip: int = 10  # 0 disables
    max_documents: int = 30  # total kept; oldest auto-pruned on new upload. 0 = ∞
    trust_forwarded: bool = True  # read client IP from X-Forwarded-For

    # Access control. Leave unset for local/demo (no auth). When set, every
    # endpoint except /health and the static UI requires this key via an
    # "Authorization: Bearer <key>" or "X-API-Key: <key>" header.
    api_key: str | None = None
    # Serve /docs, /redoc and /openapi.json. Turn off for a public deployment.
    docs_enabled: bool = True

    @field_validator(
        "openai_api_key",
        "groq_api_key",
        "google_api_key",
        "chat_model",
        "embedding_model",
        "api_key",
        mode="before",
    )
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        # An empty or whitespace-only env var ("QA_GROQ_API_KEY=") means "unset".
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @property
    def auth_required(self) -> bool:
        return bool(self.api_key)

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
    def resolved_provider(self) -> Provider:
        if self.fake_ai:
            return "fake"
        if self.provider != "auto":
            return self.provider
        if self.openai_api_key:
            return "openai"
        if self.groq_api_key:
            return "groq"
        if self.google_api_key:
            return "gemini"
        return "fake"

    @property
    def is_fake(self) -> bool:
        return self.resolved_provider == "fake"

    @property
    def ai_enabled(self) -> bool:
        # The service always answers; "fake" just means no external model.
        return True

    @property
    def active_chat_model(self) -> str:
        p = self.resolved_provider
        return self.chat_model or _CHAT_DEFAULTS.get(p, "")

    @property
    def active_embedding_model(self) -> str:
        p = self.resolved_provider
        return self.embedding_model or _EMBED_DEFAULTS.get(p, "")

    @property
    def local_embedding_model(self) -> str:
        return _LOCAL_EMBED_MODEL

    def api_key_for(self, provider: Provider) -> str | None:
        return {
            "openai": self.openai_api_key,
            "groq": self.groq_api_key,
            "gemini": self.google_api_key,
            "fake": None,
        }.get(provider)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.index_dir.mkdir(parents=True, exist_ok=True)
    return settings
