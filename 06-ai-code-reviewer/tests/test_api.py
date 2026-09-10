from __future__ import annotations

import importlib

EVAL_CODE = (
    "def f(x):\n"
    "    try:\n"
    "        return eval(x)\n"
    "    except:\n"
    "        return None\n"
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
    assert "AI Code Reviewer" in client.get("/").text
    assert client.get("/assets/app.js").status_code == 200


def test_review_requires_code_or_diff(client):
    r = client.post("/review", json={"language": "python"})
    assert r.status_code == 422


def test_review_returns_structured_result(client):
    r = client.post("/review", json={"code": EVAL_CODE, "language": "python"})
    assert r.status_code == 200
    body = r.json()
    assert body["language"] == "python"
    assert body["provider"] == "fake"
    assert body["verdict"] == "request_changes"
    assert 0 <= body["score"] <= 10
    assert any(i["title"] == "Use of eval/exec" for i in body["issues"])
    issue = body["issues"][0]
    expected = {"severity", "category", "line", "title", "detail", "suggestion"}
    assert expected <= issue.keys()


def test_review_auto_detects_language(client):
    r = client.post(
        "/review",
        json={"code": "package main\nfunc main() {}\n", "language": "auto"},
    )
    assert r.status_code == 200
    assert r.json()["language"] == "go"


def test_review_truncates_oversized_input(client, monkeypatch):
    monkeypatch.setenv("CR_FAKE_AI", "1")
    monkeypatch.setenv("CR_MAX_CODE_CHARS", "50")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.post("/review", json={"code": "x = 1\n" * 100})
        assert r.status_code == 200
        assert r.json()["truncated"] is True
    config.get_settings.cache_clear()


def test_review_accepts_diff(client):
    diff = (
        "--- a/app.py\n+++ b/app.py\n@@ -1,2 +1,2 @@\n"
        "-def f(): return 1\n+def f(): return eval('1')\n"
    )
    r = client.post("/review", json={"diff": diff})
    assert r.status_code == 200
    assert r.json()["provider"] == "fake"


def test_api_key_gate(monkeypatch):
    monkeypatch.setenv("CR_FAKE_AI", "1")
    monkeypatch.setenv("CR_API_KEY", "s3cret")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.get("/health").status_code == 200
        assert c.post("/review", json={"code": "x=1"}).status_code == 401
        ok = c.post(
            "/review",
            json={"code": "x=1"},
            headers={"X-API-Key": "s3cret"},
        )
        assert ok.status_code == 200
    config.get_settings.cache_clear()
