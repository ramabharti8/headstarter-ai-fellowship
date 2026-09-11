"""Shared fixtures. Everything runs in ``fake_model`` mode — no network, no torch."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SENT_FAKE_MODEL", "1")
    monkeypatch.delenv("SENT_API_KEY", raising=False)

    from app import config

    config.get_settings.cache_clear()

    from app import main

    importlib.reload(main)

    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c

    config.get_settings.cache_clear()
