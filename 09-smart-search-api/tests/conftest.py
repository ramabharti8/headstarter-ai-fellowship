"""Shared fixtures. Everything runs in ``fake_embed`` mode — no network, no API
key — with a fresh temp data dir per test so the FAISS index/SQLite docstore
never leaks between tests."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SS_FAKE_EMBED", "1")
    monkeypatch.setenv("SS_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("SS_API_KEY", raising=False)

    from app import config

    config.get_settings.cache_clear()

    from app import main

    importlib.reload(main)

    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c

    config.get_settings.cache_clear()
