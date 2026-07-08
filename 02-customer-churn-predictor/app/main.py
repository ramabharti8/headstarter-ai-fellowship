"""FastAPI service for the customer churn model.

Endpoints:
    GET  /                 — service metadata
    GET  /health           — health check + model-loaded flag
    GET  /features         — required feature names
    GET  /model-info       — training metrics + feature importances
    POST /predict          — churn prediction for one customer
    POST /predict/batch    — churn predictions for a list of customers
"""
# NOTE: no `from __future__ import annotations` here — slowapi's rate-limit
# decorator interferes with pydantic/FastAPI resolving stringized forward refs.
import json
import os
import time
import uuid
from contextlib import asynccontextmanager

import joblib
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app import store
from app.logging_config import configure_logging, get_logger
from app.model import FEATURES, feature_importance, predict_churn
from app.security import RATE_LIMIT, auth_enabled, limiter, require_api_key

configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
log = get_logger("churn.api")

MODEL_PATH = os.environ.get("MODEL_PATH", "models/churn_model.joblib")
METRICS_PATH = os.environ.get("METRICS_PATH", "models/metrics.json")

# Populated on startup (see lifespan)
state: dict = {"pipeline": None, "metrics": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.init_db()
    if os.path.exists(MODEL_PATH):
        state["pipeline"] = joblib.load(MODEL_PATH)
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH) as f:
            state["metrics"] = json.load(f)
    log.info("startup", model_loaded=state["pipeline"] is not None,
             auth_required=auth_enabled())
    yield
    state.clear()


app = FastAPI(
    title="Customer Churn Predictor",
    description="XGBoost-powered churn prediction with a FastAPI REST interface.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# Rate limiting (slowapi): register limiter + 429 handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    log.info(
        "request",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        latency_ms=elapsed_ms,
    )
    return response


class CustomerFeatures(BaseModel):
    tenure: float = Field(..., ge=0, description="Months as a customer")
    monthly_charges: float = Field(..., ge=0, description="Monthly bill amount")
    total_charges: float = Field(..., ge=0, description="Lifetime charges")
    num_products: int = Field(..., ge=1, description="Number of subscribed products")
    has_internet: int = Field(..., ge=0, le=1)
    has_phone: int = Field(..., ge=0, le=1)
    contract_type: int = Field(..., ge=0, le=2, description="0=month-to-month, 1=one-year, 2=two-year")
    payment_method: int = Field(..., ge=0, le=3, description="0=e-check, 1=mail, 2=bank, 3=card")
    paperless_billing: int = Field(..., ge=0, le=1)
    senior_citizen: int = Field(..., ge=0, le=1)

    model_config = {
        "json_schema_extra": {
            "example": {
                "tenure": 24, "monthly_charges": 79.5, "total_charges": 1908.0,
                "num_products": 3, "has_internet": 1, "has_phone": 1,
                "contract_type": 1, "payment_method": 2,
                "paperless_billing": 1, "senior_citizen": 0,
            }
        }
    }


class BatchRequest(BaseModel):
    customers: list[CustomerFeatures]


def _require_model():
    if state["pipeline"] is None:
        raise HTTPException(status_code=503, detail="Model not loaded — run `python train.py` first")
    return state["pipeline"]


def _threshold() -> float:
    """Business-cost decision threshold from the trained model's metrics."""
    if state["metrics"]:
        return float(state["metrics"].get("threshold", 0.5))
    return 0.5


@app.get("/")
def root():
    return {
        "service": "Customer Churn Predictor",
        "version": "1.0.0",
        "docs": "/docs",
        "auth_required": auth_enabled(),
        "rate_limit": RATE_LIMIT,
        "endpoints": ["/predict", "/predict/batch", "/features", "/model-info", "/health"],
    }


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": state["pipeline"] is not None}


@app.get("/features")
def get_features():
    return {"required_features": FEATURES}


@app.get("/model-info")
def model_info():
    pipeline = _require_model()
    info = {"features": FEATURES, "feature_importance": feature_importance(pipeline)}
    if state["metrics"]:
        info["metrics"] = {
            k: state["metrics"][k]
            for k in ("accuracy", "roc_auc", "precision", "recall", "f1", "brier",
                      "threshold", "calibrated", "n_train", "n_test")
            if k in state["metrics"]
        }
    return info


@app.post("/predict", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT)
def predict(request: Request, customer: CustomerFeatures):
    pipeline = _require_model()
    features = customer.model_dump()
    result = predict_churn(pipeline, features, threshold=_threshold())
    store.log_prediction(features, result)
    return result


@app.post("/predict/batch", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT)
def predict_batch(request: Request, req: BatchRequest):
    pipeline = _require_model()
    threshold = _threshold()
    results = []
    for c in req.customers:
        features = c.model_dump()
        result = predict_churn(pipeline, features, threshold=threshold)
        store.log_prediction(features, result)
        results.append(result)
    n_high = sum(1 for r in results if r["risk_level"] == "high")
    return {"count": len(results), "high_risk": n_high, "predictions": results}


@app.get("/stats")
def prediction_stats():
    """Aggregate stats over all logged predictions (volume, risk mix, avg prob)."""
    return store.stats()


@app.get("/predictions")
def recent_predictions(limit: int = 20):
    """Most recent predictions served (for auditing / monitoring)."""
    return {"predictions": store.recent(limit)}
