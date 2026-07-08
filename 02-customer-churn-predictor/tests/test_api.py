"""API tests using FastAPI's TestClient.

The model + metrics are injected into the app's state in-memory so the tests
never touch (or overwrite) the trained artifacts on disk.
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app import main as main_mod
from app import store
from app.main import app
from app.model import train
from data.generate_data import generate

CUSTOMER = {
    "tenure": 24, "monthly_charges": 79.5, "total_charges": 1908.0,
    "num_products": 3, "has_internet": 1, "has_phone": 1,
    "contract_type": 1, "payment_method": 2,
    "paperless_billing": 1, "senior_citizen": 0,
}


@pytest.fixture(scope="module")
def client(trained_pipeline):
    # Point the prediction store at a throwaway DB so tests don't pollute models/.
    store.DB_PATH = os.path.join(tempfile.mkdtemp(), "predictions.db")
    # Metrics from an in-memory train (no artifacts written to disk).
    metrics = train(generate(2000, seed=11), save=False)
    with TestClient(app) as c:
        # Override whatever lifespan loaded with the in-memory model.
        main_mod.state["pipeline"] = trained_pipeline
        main_mod.state["metrics"] = {k: v for k, v in metrics.items() if k != "report"}
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["model_loaded"] is True


def test_features(client):
    r = client.get("/features")
    assert r.status_code == 200
    assert len(r.json()["required_features"]) == 10


def test_model_info(client):
    r = client.get("/model-info")
    assert r.status_code == 200
    body = r.json()
    assert "feature_importance" in body
    assert body["metrics"]["roc_auc"] > 0.8


def test_predict(client):
    r = client.post("/predict", json=CUSTOMER)
    assert r.status_code == 200
    body = r.json()
    assert 0.0 <= body["churn_probability"] <= 1.0
    assert body["risk_level"] in {"low", "medium", "high"}


def test_predict_batch(client):
    r = client.post("/predict/batch", json={"customers": [CUSTOMER, CUSTOMER]})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert len(body["predictions"]) == 2


def test_predict_validation_error(client):
    bad = {**CUSTOMER, "contract_type": 9}  # out of allowed range 0-2
    r = client.post("/predict", json=bad)
    assert r.status_code == 422


def test_prediction_is_logged(client):
    before = client.get("/stats").json()["total"]
    client.post("/predict", json=CUSTOMER)
    after = client.get("/stats").json()
    assert after["total"] == before + 1
    assert set(after["risk_counts"]).issubset({"low", "medium", "high"})


def test_recent_predictions(client):
    client.post("/predict", json=CUSTOMER)
    r = client.get("/predictions?limit=5")
    assert r.status_code == 200
    preds = r.json()["predictions"]
    assert len(preds) >= 1
    assert {"ts", "churn_probability", "will_churn", "risk_level"} <= set(preds[0])
