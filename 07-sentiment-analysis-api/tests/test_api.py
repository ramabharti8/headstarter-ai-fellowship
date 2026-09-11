from __future__ import annotations

import importlib


def test_health_reports_fake_backend(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["backend"] == "fake"
    assert body["fake_model"] is True
    assert body["auth_required"] is False
    assert body["labels"] == ["negative", "neutral", "positive"]


def test_index_and_assets_served(client):
    assert client.get("/").status_code == 200
    assert "Sentiment Analysis API" in client.get("/").text
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/favicon.ico").status_code == 200


def test_analyze_returns_distribution(client):
    r = client.post("/analyze", json={"text": "I love this, it's amazing!"})
    assert r.status_code == 200
    body = r.json()
    assert body["sentiment"] == "positive"
    assert 0.0 <= body["confidence"] <= 1.0
    assert set(body["scores"]) == {"negative", "neutral", "positive"}
    assert abs(sum(body["scores"].values()) - 1.0) < 1e-3
    assert body["cached"] is False
    assert body["processing_time_ms"] >= 0


def test_analyze_second_call_is_cached(client):
    client.post("/analyze", json={"text": "cache me"})
    r = client.post("/analyze", json={"text": "cache me"})
    assert r.json()["cached"] is True


def test_analyze_rejects_empty_text(client):
    assert client.post("/analyze", json={"text": ""}).status_code == 422


def test_analyze_rejects_oversized_text(client, monkeypatch):
    monkeypatch.setenv("SENT_FAKE_MODEL", "1")
    monkeypatch.setenv("SENT_MAX_TEXT_CHARS", "20")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.post("/analyze", json={"text": "x" * 50})
        assert r.status_code == 422
        assert "exceeds" in r.json()["detail"]
    config.get_settings.cache_clear()


def test_batch_scores_each_text(client):
    texts = ["wonderful, best ever", "horrible and broken", "it is on the table"]
    r = client.post("/analyze/batch", json={"texts": texts})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 3
    sentiments = [x["sentiment"] for x in body["results"]]
    assert sentiments == ["positive", "negative", "neutral"]


def test_batch_reports_cached_count(client):
    client.post("/analyze", json={"text": "seen before"})
    r = client.post("/analyze/batch", json={"texts": ["seen before", "fresh one"]})
    assert r.json()["cached_count"] == 1


def test_batch_rejects_empty_item(client):
    r = client.post("/analyze/batch", json={"texts": ["ok", "   "]})
    assert r.status_code == 422


def test_batch_rejects_oversized_batch(client, monkeypatch):
    monkeypatch.setenv("SENT_FAKE_MODEL", "1")
    monkeypatch.setenv("SENT_MAX_BATCH_SIZE", "2")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.post("/analyze/batch", json={"texts": ["a", "b", "c"]})
        assert r.status_code == 422
    config.get_settings.cache_clear()


def test_metrics_endpoint_exposes_counters(client):
    client.post("/analyze", json={"text": "great stuff"})
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "sentiment_requests_total" in r.text
    assert "sentiment_request_latency_seconds_bucket" in r.text


def test_api_key_gate(monkeypatch):
    monkeypatch.setenv("SENT_FAKE_MODEL", "1")
    monkeypatch.setenv("SENT_API_KEY", "s3cret")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.get("/health").status_code == 200
        assert c.post("/analyze", json={"text": "hi"}).status_code == 401
        ok = c.post(
            "/analyze",
            json={"text": "hi"},
            headers={"X-API-Key": "s3cret"},
        )
        assert ok.status_code == 200
    config.get_settings.cache_clear()


def test_rate_limit_trips(monkeypatch):
    monkeypatch.setenv("SENT_FAKE_MODEL", "1")
    monkeypatch.setenv("SENT_RATE_LIMIT_PER_MIN", "2")
    monkeypatch.delenv("SENT_API_KEY", raising=False)
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.post("/analyze", json={"text": "a"}).status_code == 200
        assert c.post("/analyze", json={"text": "b"}).status_code == 200
        r = c.post("/analyze", json={"text": "c"})
        assert r.status_code == 429
        assert "Retry-After" in r.headers
    config.get_settings.cache_clear()
