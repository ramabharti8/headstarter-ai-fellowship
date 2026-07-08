"""API tests via FastAPI TestClient."""
import io

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _upload(client, csv_bytes, path="/analyze", **params):
    return client.post(
        path, params=params,
        files={"file": ("transactions.csv", io.BytesIO(csv_bytes), "text/csv")},
    )


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_root_lists_methods(client):
    body = client.get("/").json()
    assert "zscore" in body["anomaly_methods"]


def test_sample_download(client):
    r = client.get("/sample?rows=50")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert r.content.count(b"\n") > 10


def test_analyze_returns_report(client, sample_csv_bytes):
    r = _upload(client, sample_csv_bytes)
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["total_transactions"] > 0
    assert "cash_flow" in body
    assert body["anomalies"]["count"] >= 1


def test_analyze_isolation_forest(client, sample_csv_bytes):
    r = _upload(client, sample_csv_bytes, method="isolation_forest")
    assert r.status_code == 200
    assert r.json()["anomalies"]["method"] == "isolation_forest"


def test_analyze_missing_column_returns_422(client):
    bad = b"date,value\n2024-01-01,10\n"
    r = _upload(client, bad)
    assert r.status_code == 422


def test_analyze_empty_file_returns_400(client):
    r = _upload(client, b"")
    assert r.status_code == 400


def test_analyze_excel_download(client, sample_csv_bytes):
    r = _upload(client, sample_csv_bytes, path="/analyze/excel")
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert r.content[:2] == b"PK"  # xlsx is a zip
