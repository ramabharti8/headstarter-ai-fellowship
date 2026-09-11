"""Runtime configuration, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["openai", "groq", "fake"]

# Per-provider default chat model. Override with RS_CHAT_MODEL.
_CHAT_DEFAULTS: dict[str, str] = {
    "openai": "gpt-4o",
    # Groq rotates its hosted models; gpt-oss-20b is fast and free. Larger
    # option: "openai/gpt-oss-120b". See https://console.groq.com/docs/models
    "groq": "openai/gpt-oss-20b",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RS_", extra="ignore")

    # --- AI provider ---
    # "auto" picks the first provider that has a key: openai -> groq, falling
    # back to "fake" (deterministic, offline, skill-overlap heuristic) when
    # neither is set.
    provider: Literal["auto", "openai", "groq", "fake"] = "auto"

    openai_api_key: str | None = None
    groq_api_key: str | None = None

    # Override the per-provider default model if set.
    chat_model: str | None = None

    # Back-compat / test switch: RS_FAKE_AI=1 forces the offline provider.
    fake_ai: bool = False

    # --- Screening knobs ---
    max_resume_chars: int = 20_000  # resume text longer than this is truncated
    max_jd_chars: int = 8_000  # job description longer than this is truncated
    max_output_tokens: int = 2_000
    temperature: float = 0.2
    request_timeout_s: float = 90.0
    max_upload_bytes: int = 5 * 1024 * 1024  # reject a bigger resume file (413)

    # --- API ---
    cors_origins: str = "*"

    # --- Abuse protection (applied only when RS_API_KEY is NOT set) ---
    rate_limit_per_min: int = 20  # requests per client IP per minute; 0 disables
    trust_forwarded: bool = True  # read client IP from X-Forwarded-For

    # Access control. Leave unset for local/demo (no auth). When set, every
    # endpoint except /health and the static UI requires this key via an
    # "Authorization: Bearer <key>" or "X-API-Key: <key>" header.
    api_key: str | None = None
    # Serve /docs, /redoc and /openapi.json. Turn off for a public deployment.
    docs_enabled: bool = True

    @field_validator(
        "openai_api_key", "groq_api_key", "chat_model", "api_key", mode="before"
    )
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        # An empty or whitespace-only env var ("RS_GROQ_API_KEY=") means "unset".
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
        if self.fake_ai:
            return "fake"
        if self.provider != "auto":
            return self.provider
        if self.openai_api_key:
            return "openai"
        if self.groq_api_key:
            return "groq"
        return "fake"

    @property
    def is_fake(self) -> bool:
        return self.resolved_provider == "fake"

    @property
    def active_chat_model(self) -> str:
        return self.chat_model or _CHAT_DEFAULTS.get(self.resolved_provider, "")

    def api_key_for(self, provider: Provider) -> str | None:
        return {
            "openai": self.openai_api_key,
            "groq": self.groq_api_key,
            "fake": None,
        }.get(provider)


@lru_cache
def get_settings() -> Settings:
    return Settings()
