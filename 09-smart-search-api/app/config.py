"""Runtime configuration, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["openai", "gemini", "fastembed", "fake"]

# Embedding dimension per provider — fixed at the model, not configurable.
# The index is bound to whichever one built it (see Store._check_dim).
DIMS: dict[str, int] = {
    "openai": 1536,  # text-embedding-3-small
    "gemini": 768,  # gemini-embedding-001, truncated via output_dimensionality
    "fastembed": 384,  # BAAI/bge-small-en-v1.5, local ONNX, no API key
    "fake": 64,  # deterministic hashed bag-of-words, tests/CI only
}

_MODEL_NAMES: dict[str, str] = {
    "openai": "text-embedding-3-small",
    # google deprecated text-embedding-004 in favour of gemini-embedding-001;
    # its native output is 3072-dim but supports MRL truncation to 768 via
    # output_dimensionality, which is what GeminiEmbedder requests.
    "gemini": "models/gemini-embedding-001",
    "fastembed": "BAAI/bge-small-en-v1.5",
    "fake": "fake-hash-64",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SS_", extra="ignore")

    # --- Embedding provider ---
    # "auto" picks the first provider with a key: openai -> gemini, falling
    # back to "fastembed" — a real, local, ONNX embedding model that needs no
    # API key at all (only "fake" needs an explicit opt-in, for tests/CI).
    provider: Literal["auto", "openai", "gemini", "fastembed", "fake"] = "auto"

    openai_api_key: str | None = None
    gemini_api_key: str | None = None

    # Back-compat / test switch: SS_FAKE_EMBED=1 forces the offline provider.
    fake_embed: bool = False

    # --- Storage ---
    data_dir: str = "./data"  # FAISS index + document/metadata store on disk
    collection: str = "documents"  # namespaces the on-disk files

    # --- Search / index knobs ---
    default_top_k: int = 5
    max_top_k: int = 50
    max_documents: int = 50_000  # hard cap on index size
    max_doc_chars: int = 8_000  # a single document longer than this is truncated
    max_batch_size: int = 256  # reject a bigger /index request (422)
    embed_batch_size: int = 64  # provider-call chunk size for large /index requests

    # --- API ---
    cors_origins: str = "*"

    # --- Abuse protection (applied only when SS_API_KEY is NOT set) ---
    rate_limit_per_min: int = 60
    trust_forwarded: bool = True

    api_key: str | None = None
    docs_enabled: bool = True

    @field_validator("openai_api_key", "gemini_api_key", "api_key", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @property
    def auth_required(self) -> bool:
        return bool(self.api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_provider(self) -> Provider:
        if self.fake_embed:
            return "fake"
        if self.provider != "auto":
            return self.provider
        if self.openai_api_key:
            return "openai"
        if self.gemini_api_key:
            return "gemini"
        return "fastembed"

    @property
    def is_fake(self) -> bool:
        return self.resolved_provider == "fake"

    @property
    def embedding_dim(self) -> int:
        return DIMS[self.resolved_provider]

    @property
    def embedding_model(self) -> str:
        return _MODEL_NAMES[self.resolved_provider]


@lru_cache
def get_settings() -> Settings:
    return Settings()
