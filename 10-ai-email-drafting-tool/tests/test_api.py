from __future__ import annotations

import importlib

BULLETS = ["Meeting rescheduled to Thursday 3pm", "Please confirm attendance"]


def test_health_reports_fake_provider(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["provider"] == "fake"
    assert body["fake_ai"] is True
    assert body["auth_required"] is False


def test_index_and_assets_served(client):
    assert client.get("/").status_code == 200
    assert "AI Email Drafting Tool" in client.get("/").text
    assert client.get("/assets/app.js").status_code == 200


def test_draft_returns_structured_result(client):
    r = client.post(
        "/draft",
        json={"bullet_points": BULLETS, "recipient": "Team", "sender": "Rama"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "fake"
    assert len(body["drafts"]) == 1
    assert body["subject"] == body["drafts"][0]["subject"]
    assert "Rama" in body["full_email"]
    for b in BULLETS:
        assert b in body["body"]


def test_draft_rejects_empty_bullets(client):
    r = client.post("/draft", json={"bullet_points": []})
    assert r.status_code == 422


def test_draft_rejects_all_blank_bullets(client):
    r = client.post("/draft", json={"bullet_points": ["   ", ""]})
    assert r.status_code == 422


def test_draft_multiple_variants(client):
    r = client.post("/draft", json={"bullet_points": BULLETS, "variants": 2})
    assert r.status_code == 200
    body = r.json()
    assert len(body["drafts"]) == 2
    assert body["drafts"][0]["full_email"] != body["drafts"][1]["full_email"]


def test_draft_rejects_variants_over_limit(client, monkeypatch):
    monkeypatch.setenv("EM_FAKE_AI", "1")
    monkeypatch.setenv("EM_MAX_VARIANTS", "1")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.post("/draft", json={"bullet_points": BULLETS, "variants": 2})
        assert r.status_code == 422
    config.get_settings.cache_clear()


def test_draft_truncates_oversized_bullets(client, monkeypatch):
    monkeypatch.setenv("EM_FAKE_AI", "1")
    monkeypatch.setenv("EM_MAX_BULLET_CHARS", "10")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.post(
            "/draft", json={"bullet_points": ["a much longer bullet point than allowed"]}
        )
        assert r.status_code == 200
        assert r.json()["truncated"] is True
    config.get_settings.cache_clear()


def test_revise_returns_updated_email(client):
    draft = client.post("/draft", json={"bullet_points": BULLETS}).json()
    r = client.post(
        "/revise",
        json={"full_email": draft["full_email"], "feedback": "make it shorter"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["full_email"].startswith("Subject:")


def test_revise_rejects_empty_feedback(client):
    r = client.post("/revise", json={"full_email": "Subject: X\n\nHi", "feedback": ""})
    assert r.status_code == 422


def test_api_key_gate(monkeypatch):
    monkeypatch.setenv("EM_FAKE_AI", "1")
    monkeypatch.setenv("EM_API_KEY", "s3cret")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.get("/health").status_code == 200
        assert c.post("/draft", json={"bullet_points": BULLETS}).status_code == 401
        ok = c.post(
            "/draft",
            json={"bullet_points": BULLETS},
            headers={"X-API-Key": "s3cret"},
        )
        assert ok.status_code == 200
    config.get_settings.cache_clear()


def test_rate_limit_trips(monkeypatch):
    monkeypatch.setenv("EM_FAKE_AI", "1")
    monkeypatch.setenv("EM_RATE_LIMIT_PER_MIN", "2")
    monkeypatch.delenv("EM_API_KEY", raising=False)
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.post("/draft", json={"bullet_points": BULLETS}).status_code == 200
        assert c.post("/draft", json={"bullet_points": BULLETS}).status_code == 200
        r = c.post("/draft", json={"bullet_points": BULLETS})
        assert r.status_code == 429
    config.get_settings.cache_clear()
