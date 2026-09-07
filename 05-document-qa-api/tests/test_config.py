from __future__ import annotations

import os

import pytest

from app.config import Settings


@pytest.fixture(autouse=True)
def _clear_qa_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("QA_"):
            monkeypatch.delenv(key, raising=False)


def _s(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_fake_by_default_with_no_keys():
    s = _s()
    assert s.resolved_provider == "fake"
    assert s.is_fake is True
    assert s.ai_enabled is True  # service always answers


def test_fake_ai_flag_wins_over_keys():
    s = _s(fake_ai=True, openai_api_key="sk-x")
    assert s.resolved_provider == "fake"


def test_auto_prefers_openai_then_groq_then_gemini():
    assert _s(openai_api_key="sk-x", groq_api_key="gsk-y").resolved_provider == "openai"
    assert _s(groq_api_key="gsk-y", google_api_key="g-z").resolved_provider == "groq"
    assert _s(google_api_key="g-z").resolved_provider == "gemini"


def test_explicit_provider_overrides_auto():
    s = _s(provider="gemini", openai_api_key="sk-x", google_api_key="g-z")
    assert s.resolved_provider == "gemini"


def test_default_models_per_provider():
    assert _s(provider="groq", groq_api_key="x").active_chat_model == "openai/gpt-oss-20b"
    assert _s(provider="groq", groq_api_key="x").active_embedding_model == "local"
    assert (
        _s(provider="gemini", google_api_key="x").active_chat_model == "gemini-2.0-flash"
    )


def test_model_override():
    s = _s(provider="openai", openai_api_key="x", chat_model="gpt-4o")
    assert s.active_chat_model == "gpt-4o"
