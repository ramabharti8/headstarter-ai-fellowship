"""Shared fixtures. Everything runs in ``fake_ai`` mode — no network, no API key."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CR_FAKE_AI", "1")
    monkeypatch.delenv("CR_API_KEY", raising=False)

    from app import config

    config.get_settings.cache_clear()

    from app import main

    importlib.reload(main)

    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c

    config.get_settings.cache_clear()
