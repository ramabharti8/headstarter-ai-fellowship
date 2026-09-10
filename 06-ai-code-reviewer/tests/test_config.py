from __future__ import annotations

import os

import pytest

from app.config import Settings


@pytest.fixture(autouse=True)
def _clear_cr_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("CR_"):
            monkeypatch.delenv(key, raising=False)


def _s(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_fake_by_default_with_no_keys():
    s = _s()
    assert s.resolved_provider == "fake"
    assert s.is_fake is True


def test_fake_ai_flag_wins_over_keys():
    assert _s(fake_ai=True, openai_api_key="sk-x").resolved_provider == "fake"


def test_auto_prefers_openai_then_groq():
    assert _s(openai_api_key="sk-x", groq_api_key="gsk-y").resolved_provider == "openai"
    assert _s(groq_api_key="gsk-y").resolved_provider == "groq"


def test_explicit_provider_overrides_auto():
    s = _s(provider="groq", openai_api_key="sk-x", groq_api_key="gsk-y")
    assert s.resolved_provider == "groq"


def test_default_models_per_provider():
    assert _s(provider="openai", openai_api_key="x").active_chat_model == "gpt-4o"
    assert _s(provider="groq", groq_api_key="x").active_chat_model == "openai/gpt-oss-20b"


def test_model_override():
    s = _s(provider="openai", openai_api_key="x", chat_model="gpt-4o-mini")
    assert s.active_chat_model == "gpt-4o-mini"


def test_blank_env_is_treated_as_unset():
    assert _s(openai_api_key="   ").resolved_provider == "fake"


def test_auth_required_only_when_key_set():
    assert _s().auth_required is False
    assert _s(api_key="secret").auth_required is True
