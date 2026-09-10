from __future__ import annotations


def _upload(client, sample_pdf):
    with sample_pdf.open("rb") as fh:
        return client.post(
            "/upload", files={"file": ("report.pdf", fh, "application/pdf")}
        )


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["fake_ai"] is True
    assert body["ai_enabled"] is True


def test_index_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Document Q&amp;A" in r.text or "Document Q&A" in r.text


def test_static_assets_served(client):
    for path, ctype in [
        ("/assets/app.js", "javascript"),
        ("/assets/styles.css", "css"),
        ("/favicon.ico", "svg"),
    ]:
        r = client.get(path)
        assert r.status_code == 200, path
        assert ctype in r.headers["content-type"]

    # UI + assets must not be cached, so a stale app.js can't linger
    assert "no-cache" in client.get("/").headers.get("cache-control", "")
    assert "no-cache" in client.get("/assets/app.js").headers.get("cache-control", "")


def test_upload_rejects_non_pdf(client):
    r = client.post("/upload", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_upload_rejects_empty(client):
    r = client.post("/upload", files={"file": ("x.pdf", b"", "application/pdf")})
    assert r.status_code == 400


def test_upload_then_ask_flow(client, sample_pdf):
    up = _upload(client, sample_pdf)
    assert up.status_code == 200, up.text
    doc = up.json()
    assert doc["pages"] == 2
    assert doc["chunks"] >= 1

    listed = client.get("/documents").json()["documents"]
    assert [d["doc_id"] for d in listed] == [doc["doc_id"]]

    ans = client.post(
        "/ask", json={"doc_id": doc["doc_id"], "question": "What was the key finding?"}
    )
    assert ans.status_code == 200, ans.text
    payload = ans.json()
    assert "revenue" in payload["answer"].lower()
    assert payload["sources"]
    assert payload["sources"][0]["page"] in (0, 1)


def test_ask_unknown_document(client):
    r = client.post("/ask", json={"doc_id": "nope", "question": "anything here?"})
    assert r.status_code == 404


def test_summarize_whole_document(client, sample_pdf):
    doc_id = _upload(client, sample_pdf).json()["doc_id"]
    r = client.post("/summarize", json={"doc_id": doc_id})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["chunks_used"] >= 1
    assert len(body["summary"]) > 0


def test_summarize_unknown_document(client):
    assert client.post("/summarize", json={"doc_id": "nope"}).status_code == 404


def test_docs_open_by_default(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_no_auth_by_default(client):
    body = client.get("/health").json()
    assert body["auth_required"] is False


def _client_with(tmp_path, monkeypatch, **env):
    import importlib

    monkeypatch.setenv("QA_FAKE_AI", "1")
    monkeypatch.setenv("QA_DATA_DIR", str(tmp_path / "d"))
    for k, v in env.items():
        monkeypatch.setenv(k, str(v))
    from app import config

    config.get_settings.cache_clear()
    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    return config, TestClient(main.app)


def _secured_client(tmp_path, monkeypatch):
    return _client_with(
        tmp_path, monkeypatch, QA_API_KEY="s3cret", QA_DOCS_ENABLED="false"
    )


def _pdf_bytes():
    from fpdf import FPDF

    p = FPDF()
    p.add_page()
    p.set_font("Helvetica", size=12)
    p.multi_cell(0, 8, "Revenue grew 42 percent. Churn fell to 3 percent.")
    return bytes(p.output())


def test_api_key_gate(tmp_path, monkeypatch):
    config, tc = _secured_client(tmp_path, monkeypatch)
    with tc as c:
        assert c.get("/health").json()["auth_required"] is True
        assert c.get("/documents").status_code == 401
        assert c.get("/documents", headers={"X-API-Key": "wrong"}).status_code == 401
        assert c.get("/documents", headers={"X-API-Key": "s3cret"}).status_code == 200
        assert (
            c.get("/documents", headers={"Authorization": "Bearer s3cret"}).status_code
            == 200
        )
    config.get_settings.cache_clear()


def test_docs_disabled_when_configured(tmp_path, monkeypatch):
    config, tc = _secured_client(tmp_path, monkeypatch)
    with tc as c:
        assert c.get("/docs").status_code == 404
        assert c.get("/openapi.json").status_code == 404
    config.get_settings.cache_clear()


def test_rate_limit_kicks_in(tmp_path, monkeypatch):
    config, tc = _client_with(tmp_path, monkeypatch, QA_RATE_LIMIT_PER_MIN=3)
    with tc as c:
        codes = [c.get("/documents").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200]
    assert codes[3] == 429 and codes[4] == 429
    config.get_settings.cache_clear()


def test_rate_limit_skipped_with_api_key(tmp_path, monkeypatch):
    config, tc = _client_with(
        tmp_path, monkeypatch, QA_RATE_LIMIT_PER_MIN=2, QA_API_KEY="k"
    )
    with tc as c:
        h = {"X-API-Key": "k"}
        codes = [c.get("/documents", headers=h).status_code for _ in range(5)]
    assert codes == [200] * 5
    config.get_settings.cache_clear()


def test_max_documents_prunes_oldest(tmp_path, monkeypatch):
    config, tc = _client_with(tmp_path, monkeypatch, QA_MAX_DOCUMENTS=2)
    pdf = _pdf_bytes()
    with tc as c:
        ids = []
        for i in range(3):
            r = c.post("/upload", files={"file": (f"d{i}.pdf", pdf, "application/pdf")})
            ids.append(r.json()["doc_id"])
        listed = {d["doc_id"] for d in c.get("/documents").json()["documents"]}
    assert len(listed) == 2
    assert ids[0] not in listed  # oldest pruned
    assert ids[2] in listed
    config.get_settings.cache_clear()


def test_daily_upload_quota(tmp_path, monkeypatch):
    config, tc = _client_with(tmp_path, monkeypatch, QA_UPLOADS_PER_DAY_PER_IP=2)
    pdf = _pdf_bytes()
    with tc as c:
        codes = [
            c.post(
                "/upload", files={"file": (f"d{i}.pdf", pdf, "application/pdf")}
            ).status_code
            for i in range(3)
        ]
    assert codes == [200, 200, 429]
    config.get_settings.cache_clear()


def test_ask_validates_question_length(client, sample_pdf):
    doc_id = _upload(client, sample_pdf).json()["doc_id"]
    r = client.post("/ask", json={"doc_id": doc_id, "question": "hi"})
    assert r.status_code == 422


def test_delete_document(client, sample_pdf):
    doc_id = _upload(client, sample_pdf).json()["doc_id"]
    assert client.delete(f"/documents/{doc_id}").status_code == 204
    assert client.get(f"/documents/{doc_id}").status_code == 404
    assert client.delete(f"/documents/{doc_id}").status_code == 404
