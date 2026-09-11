from __future__ import annotations

import importlib

DOCS = [
    "FastAPI is a modern Python web framework for building APIs.",
    "React is a JavaScript library for building user interfaces.",
    "PostgreSQL is a powerful open-source relational database.",
]


def test_health_reports_fake_provider(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["provider"] == "fake"
    assert body["dim"] == 64
    assert body["total_documents"] == 0
    assert body["auth_required"] is False


def test_index_and_assets_served(client):
    assert client.get("/").status_code == 200
    assert "Smart Search API" in client.get("/").text
    assert client.get("/assets/app.js").status_code == 200


def test_index_then_search_finds_relevant_doc(client):
    r = client.post("/index", json={"documents": DOCS})
    assert r.status_code == 200
    body = r.json()
    assert body["indexed"] == 3
    assert len(body["ids"]) == 3

    r = client.get("/health")
    assert r.json()["total_documents"] == 3

    r = client.post("/search", json={"query": "Python API framework", "top_k": 2})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) <= 2
    assert results[0]["document"].startswith("FastAPI")


def test_index_rejects_mismatched_ids_length(client):
    r = client.post("/index", json={"documents": DOCS, "ids": ["only-one"]})
    assert r.status_code == 422


def test_index_rejects_empty_document(client):
    r = client.post("/index", json={"documents": ["ok", "   "]})
    assert r.status_code == 422


def test_custom_ids_and_metadata_roundtrip(client):
    r = client.post(
        "/index",
        json={
            "documents": ["hello world"],
            "ids": ["my-id"],
            "metadata": [{"source": "test"}],
        },
    )
    assert r.status_code == 200
    assert r.json()["ids"] == ["my-id"]

    r = client.get("/documents/my-id")
    assert r.status_code == 200
    assert r.json()["metadata"] == {"source": "test"}


def test_metadata_filter_narrows_results(client):
    client.post(
        "/index",
        json={
            "documents": ["python backend framework", "python backend framework two"],
            "metadata": [{"lang": "en"}, {"lang": "fr"}],
        },
    )
    r = client.post(
        "/search",
        json={"query": "python backend", "top_k": 5, "metadata_filter": {"lang": "fr"}},
    )
    results = r.json()["results"]
    assert all(x["metadata"]["lang"] == "fr" for x in results)


def test_delete_document(client):
    r = client.post("/index", json={"documents": ["temporary doc"], "ids": ["tmp1"]})
    assert r.status_code == 200

    r = client.delete("/index/tmp1")
    assert r.status_code == 200
    assert r.json() == {"deleted": "tmp1", "found": True}

    r = client.get("/documents/tmp1")
    assert r.status_code == 404

    r = client.delete("/index/tmp1")
    assert r.json()["found"] is False


def test_list_documents_pagination(client):
    client.post("/index", json={"documents": DOCS})
    r = client.get("/documents?limit=2&offset=0")
    assert r.status_code == 200
    body = r.json()
    assert len(body["documents"]) == 2
    assert body["total_documents"] == 3


def test_search_empty_index_returns_no_results(client):
    r = client.post("/search", json={"query": "anything"})
    assert r.status_code == 200
    assert r.json()["results"] == []


def test_api_key_gate(monkeypatch, tmp_path):
    monkeypatch.setenv("SS_FAKE_EMBED", "1")
    monkeypatch.setenv("SS_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SS_API_KEY", "s3cret")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.get("/health").status_code == 200
        assert c.post("/index", json={"documents": ["x"]}).status_code == 401
        ok = c.post("/index", json={"documents": ["x"]}, headers={"X-API-Key": "s3cret"})
        assert ok.status_code == 200
    config.get_settings.cache_clear()


def test_batch_size_cap(monkeypatch, tmp_path):
    monkeypatch.setenv("SS_FAKE_EMBED", "1")
    monkeypatch.setenv("SS_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SS_MAX_BATCH_SIZE", "2")
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.post("/index", json={"documents": ["a", "b", "c"]})
        assert r.status_code == 422
    config.get_settings.cache_clear()
