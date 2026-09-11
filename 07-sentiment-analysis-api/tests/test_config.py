from __future__ import annotations

import os

import pytest

from app.config import Settings


@pytest.fixture(autouse=True)
def _clear_sent_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("SENT_"):
            monkeypatch.delenv(key, raising=False)


def _s(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_backend_auto_falls_back_to_fake_without_ml_stack(monkeypatch):
    # torch is not installed in the CI env, so auto -> fake.
    import builtins

    real_import = builtins.__import__

    def _no_torch(name, *a, **k):
        if name in {"torch", "transformers"}:
            raise ImportError(name)
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", _no_torch)
    assert _s(backend="auto").resolved_backend == "fake"


def test_fake_model_flag_wins():
    assert _s(fake_model=True, backend="transformers").resolved_backend == "fake"


def test_explicit_fake_backend():
    assert _s(backend="fake").resolved_backend == "fake"
    assert _s(backend="fake").is_fake is True


def test_blank_model_name_uses_default():
    assert _s(model_name="  ").model_name == (
        "cardiffnlp/twitter-roberta-base-sentiment-latest"
    )


def test_blank_device_becomes_auto():
    assert _s(device="").device == "auto"


def test_auth_required_only_when_key_set():
    assert _s().auth_required is False
    assert _s(api_key="secret").auth_required is True


def test_cors_origin_list_splits_and_trims():
    assert _s(cors_origins="a.com, b.com ,").cors_origin_list == ["a.com", "b.com"]
