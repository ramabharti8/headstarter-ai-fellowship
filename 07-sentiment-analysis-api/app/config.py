"""Runtime configuration, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Backend = Literal["transformers", "fake"]

_FIELD_DEFAULTS = {
    "model_name": "cardiffnlp/twitter-roberta-base-sentiment-latest",
    "device": "auto",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SENT_", extra="ignore")

    # --- Model ---
    # A 3-class (negative / neutral / positive) sequence-classification model
    # from the Hugging Face Hub. The default is tuned for social-media text.
    model_name: str = "cardiffnlp/twitter-roberta-base-sentiment-latest"

    # "auto" uses the real transformers model when torch + transformers import,
    # otherwise it falls back to the deterministic offline lexicon ("fake").
    # Force one with "transformers" or "fake".
    backend: Literal["auto", "transformers", "fake"] = "auto"

    # Back-compat / CI switch: SENT_FAKE_MODEL=1 forces the offline backend.
    fake_model: bool = False

    # "auto" -> cuda if available, else mps, else cpu. Or pin: "cpu", "cuda".
    device: str = "auto"

    # Longest input (in model tokens) actually scored; longer text is truncated
    # and the response is flagged ``truncated: true``.
    max_length: int = 512

    # --- Request limits ---
    max_text_chars: int = 5_000  # reject a single text longer than this (422)
    max_batch_size: int = 128  # reject a batch with more items than this (422)
    infer_batch_size: int = 32  # forward-pass chunk size inside a batch request
    cache_size: int = 1_024  # in-process LRU result cache; 0 disables

    # --- API ---
    cors_origins: str = "*"
    metrics_enabled: bool = True  # expose GET /metrics (Prometheus text format)

    # --- Abuse protection (applied only when SENT_API_KEY is NOT set) ---
    rate_limit_per_min: int = 60  # requests per client IP per minute; 0 disables
    trust_forwarded: bool = True  # read client IP from X-Forwarded-For

    # Access control. Leave unset for local/demo (no auth). When set, every
    # endpoint except /health and the static UI requires this key via an
    # "Authorization: Bearer <key>" or "X-API-Key: <key>" header.
    api_key: str | None = None
    # Serve /docs, /redoc and /openapi.json. Turn off for a public deployment.
    docs_enabled: bool = True

    @field_validator("api_key", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        # An empty / whitespace-only env var ("SENT_API_KEY=") means "unset".
        if isinstance(v, str):
            return v.strip() or None
        return v

    @field_validator("model_name", "device", mode="before")
    @classmethod
    def _blank_to_default(cls, v: object, info) -> object:
        if isinstance(v, str) and not v.strip():
            return _FIELD_DEFAULTS[info.field_name]
        return v

    @property
    def auth_required(self) -> bool:
        return bool(self.api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_backend(self) -> Backend:
        if self.fake_model or self.backend == "fake":
            return "fake"
        if self.backend == "transformers":
            return "transformers"
        # auto: use the real model only if the ML stack is importable.
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
        except Exception:
            return "fake"
        return "transformers"

    @property
    def is_fake(self) -> bool:
        return self.resolved_backend == "fake"


@lru_cache
def get_settings() -> Settings:
    return Settings()
