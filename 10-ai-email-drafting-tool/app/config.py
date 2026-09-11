"""Runtime configuration, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["openai", "groq", "fake"]

# Per-provider default chat model. Override with EM_CHAT_MODEL.
_CHAT_DEFAULTS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    # Groq rotates its hosted models; gpt-oss-20b is fast and free.
    "groq": "openai/gpt-oss-20b",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EM_", extra="ignore")

    # --- AI provider ---
    # "auto" picks the first provider that has a key: openai -> groq, falling
    # back to "fake" (deterministic, offline, template-based) when neither is
    # set.
    provider: Literal["auto", "openai", "groq", "fake"] = "auto"

    openai_api_key: str | None = None
    groq_api_key: str | None = None

    # Override the per-provider default model if set.
    chat_model: str | None = None

    # Back-compat / test switch: EM_FAKE_AI=1 forces the offline provider.
    fake_ai: bool = False

    # --- Drafting knobs ---
    max_bullets: int = 20
    max_bullet_chars: int = 300
    max_context_chars: int = 1000
    max_variants: int = 3  # cap on how many drafts one request can generate
    max_output_tokens: int = 900  # per draft; multiplied by variants
    temperature: float = 0.7
    request_timeout_s: float = 60.0

    # --- API ---
    cors_origins: str = "*"

    # --- Abuse protection (applied only when EM_API_KEY is NOT set) ---
    rate_limit_per_min: int = 30
    trust_forwarded: bool = True

    api_key: str | None = None
    docs_enabled: bool = True

    @field_validator(
        "openai_api_key", "groq_api_key", "chat_model", "api_key", mode="before"
    )
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
