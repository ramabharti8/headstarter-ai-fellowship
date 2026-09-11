from __future__ import annotations

import os

import pytest

from app.config import Settings


@pytest.fixture(autouse=True)
def _clear_ss_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("SS_"):
            monkeypatch.delenv(key, raising=False)


def _s(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_fastembed_by_default_with_no_keys():
    assert _s().resolved_provider == "fastembed"


def test_fake_embed_flag_wins_over_keys():
    assert _s(fake_embed=True, openai_api_key="sk-x").resolved_provider == "fake"


def test_auto_prefers_openai_then_gemini_then_fastembed():
    assert _s(openai_api_key="sk-x", gemini_api_key="g-y").resolved_provider == "openai"
    assert _s(gemini_api_key="g-y").resolved_provider == "gemini"
    assert _s().resolved_provider == "fastembed"


def test_explicit_provider_overrides_auto():
    s = _s(provider="gemini", openai_api_key="sk-x", gemini_api_key="g-y")
    assert s.resolved_provider == "gemini"


def test_blank_env_is_treated_as_unset():
    assert _s(openai_api_key="   ").resolved_provider == "fastembed"


def test_dims_per_provider():
    assert _s(provider="openai", openai_api_key="x").embedding_dim == 1536
    assert _s(provider="gemini", gemini_api_key="x").embedding_dim == 768
    assert _s(provider="fastembed").embedding_dim == 384
    assert _s(fake_embed=True).embedding_dim == 64


def test_auth_required_only_when_key_set():
    assert _s().auth_required is False
    assert _s(api_key="secret").auth_required is True
