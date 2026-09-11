from __future__ import annotations

import importlib

JD = "Looking for a Python backend engineer with FastAPI and AWS experience."
RESUME = b"5 years building APIs with Python, FastAPI and AWS."


def _upload(client, resume=RESUME, filename="resume.txt", jd=JD, **kw):
    return client.post(
        "/screen",
        files={"resume": (filename, resume, "text/plain")},
        data={"job_description": jd},
        **kw,
    )


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
    assert "AI Resume Screener" in client.get("/").text
    assert client.get("/assets/app.js").status_code == 200


def test_screen_returns_structured_result(client):
    r = _upload(client)
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "fake"
    assert 0 <= body["score"] <= 100
    assert body["grade"] in {"A", "B", "C", "D", "F"}
    assert body["recommendation"] in {"hire", "maybe", "reject"}
    assert "Python" in body["key_skills_matched"]


def test_screen_requires_job_description(client):
    r = client.post(
        "/screen",
        files={"resume": ("resume.txt", RESUME, "text/plain")},
        data={"job_description": ""},
    )
    assert r.status_code == 422  # pydantic min_length on the Form field


def test_screen_rejects_unsupported_file_type(client):
    r = _upload(client, resume=b"binary", filename="resume.exe")
    assert r.status_code == 422


def test_screen_rejects_empty_file(client):
    r = _upload(client, resume=b"", filename="resume.txt")
    assert r.status_code == 422


def test_screen_rejects_oversized_upload(client, monkeypatch):
    monkeypatch.setenv("RS_FAKE_AI", "1")
    monkeypatch.setenv("RS_MAX_UPLOAD_BYTES", "10")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = _upload(c)
        assert r.status_code == 413
    config.get_settings.cache_clear()


def test_api_key_gate(monkeypatch):
    monkeypatch.setenv("RS_FAKE_AI", "1")
    monkeypatch.setenv("RS_API_KEY", "s3cret")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.get("/health").status_code == 200
        assert _upload(c).status_code == 401
        ok = _upload(c, **{"headers": {"X-API-Key": "s3cret"}})
        assert ok.status_code == 200
    config.get_settings.cache_clear()
