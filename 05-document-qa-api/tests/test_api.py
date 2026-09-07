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


def test_ask_validates_question_length(client, sample_pdf):
    doc_id = _upload(client, sample_pdf).json()["doc_id"]
    r = client.post("/ask", json={"doc_id": doc_id, "question": "hi"})
    assert r.status_code == 422


def test_delete_document(client, sample_pdf):
    doc_id = _upload(client, sample_pdf).json()["doc_id"]
    assert client.delete(f"/documents/{doc_id}").status_code == 204
    assert client.get(f"/documents/{doc_id}").status_code == 404
    assert client.delete(f"/documents/{doc_id}").status_code == 404
