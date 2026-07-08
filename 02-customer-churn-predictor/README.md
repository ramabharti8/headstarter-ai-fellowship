# Customer Churn Predictor

Production-hardened churn prediction: a **calibrated XGBoost** model behind a
**FastAPI** service (API-key auth, rate limiting, structured logging, prediction
logging) with a **Streamlit** demo UI and **MLflow** experiment tracking. Trained
on the **real IBM Telco Customer Churn dataset** (7,043 customers).

[![Python](https://img.shields.io/badge/Python-3.12-blue)](https://python.org)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.8-orange)](https://scikit-learn.org)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.1-red)](https://xgboost.ai)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)](https://fastapi.tiangolo.com)
[![MLflow](https://img.shields.io/badge/MLflow-3.14-0194E2)](https://mlflow.org)
[![Tests](https://img.shields.io/badge/tests-18%20passing-brightgreen)](#testing)

---

## Results

Trained and evaluated on the **real IBM Telco dataset** — a held-out 20% stratified
test split (1,409 customers), true **26.5% churn rate**.

| Metric | Score | Notes |
|--------|-------|-------|
| **ROC-AUC** | **0.837** | Threshold-independent ranking quality — the headline metric |
| **Brier score** | **0.139** | Probability calibration quality (lower is better) |
| **Recall (churn)** | **0.92** | At the cost-optimal threshold — catches ~9 of 10 churners |
| Precision (churn) | 0.42 | The deliberate trade-off for high recall (see below) |
| Decision threshold | **0.15** | Chosen by business cost, not a naive 0.5 |

> **Why recall 0.92 / precision 0.42?** Probabilities are **calibrated** (isotonic),
> then the decision threshold is picked to **minimize business cost**, where a
> missed churner is treated as **5× costlier** than a wasted retention offer
> (`FN_COST` / `FP_COST`, both configurable). That drives the threshold to 0.15 —
> the model flags aggressively to *catch churners*, which is the point of a
> retention system. Change the cost ratio and the threshold moves with it.

**Top churn drivers** (XGBoost gain): `contract_type` → `has_internet` → `tenure`.
Month-to-month, fiber-internet, low-tenure customers are the flight risk.

---

## Production hardening

This isn't just a notebook model — it has the operational layer a real service needs:

| Concern | Implementation |
|---------|----------------|
| **Auth** | API-key (`X-API-Key`) on prediction endpoints — `app/security.py` |
| **Rate limiting** | Per-key / per-IP limits via slowapi (429 on exceed) |
| **Trustworthy probabilities** | Isotonic **calibration** (`CalibratedClassifierCV`) |
| **Decision policy** | **Business-cost threshold**, not 0.5 — `app/model.choose_threshold` |
| **Structured logging** | JSON logs w/ request-id + latency (structlog) — `app/logging_config.py` |
| **Prediction logging** | Every prediction persisted to SQLite for audit/monitoring — `app/store.py` |
| **Experiment tracking** | Params/metrics/model to **MLflow** — `app/tracking.py` |
| **Drift detection** | PSI + KS-test on logged inputs vs. training data — `monitoring/drift.py` |
| **Automated retraining** | Champion/challenger gate + scheduled GitHub Action — `scripts/promote.py` |
| **Tests + CI** | 18 pytest tests, GitHub Actions on every push |

## Tech Stack

- **Model**: XGBoost + scikit-learn `Pipeline` + `CalibratedClassifierCV`
- **API**: FastAPI + uvicorn + slowapi + structlog (OpenAPI docs at `/docs`)
- **Tracking**: MLflow
- **Demo UI**: Streamlit
- **Testing**: pytest (14 tests) + GitHub Actions CI
- **Packaging**: Docker + docker-compose

## Project Structure

```
02-customer-churn-predictor/
├── app/
│   ├── main.py             # FastAPI app + middleware + endpoints
│   ├── model.py            # Pipeline, calibration, cost threshold, inference
│   ├── security.py         # API-key auth + rate limiting
│   ├── store.py            # SQLite prediction log
│   ├── logging_config.py   # Structured JSON logging
│   └── tracking.py         # MLflow experiment tracking
├── data/
│   ├── load_telco.py       # Map the real IBM Telco CSV -> model schema
│   └── generate_data.py    # Synthetic fallback dataset (same schema)
├── monitoring/
│   └── drift.py            # PSI + KS-test data-drift report (HTML + JSON)
├── scripts/
│   └── promote.py          # Champion/challenger retraining gate
├── notebooks/eda.ipynb     # EDA on the real data + baseline model
├── tests/                  # Model + API + drift tests (in-memory, no disk writes)
├── .github/workflows/      # ci.yml (tests) + retrain.yml (scheduled retraining)
├── train.py                # Training entrypoint (+ --telco-raw, --track)
├── streamlit_app.py        # Interactive demo UI
├── requirements.txt / requirements-dev.txt
├── Dockerfile / docker-compose.yml / Makefile
```

---

## Run on a fresh machine (step by step)

Everything you need to go from a bare computer to a running app. Works on
Windows, macOS, and Linux.

### 0. Prerequisites
- **Git** — https://git-scm.com/downloads
- **Python 3.11 or 3.12** — https://www.python.org/downloads/
  (verify with `python --version`; on macOS/Linux you may need `python3`)

### 1. Clone the repo and enter the project
```bash
git clone https://github.com/ramabharti8/headstarter-ai-fellowship.git
cd headstarter-ai-fellowship/02-customer-churn-predictor
```

### 2. Create and activate a virtual environment
```bash
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1

# Windows (CMD)
python -m venv .venv
.venv\Scripts\activate.bat

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt          # runtime only
# or, to also run tests / notebook / MLflow / drift:
pip install -r requirements-dev.txt
```

### 4. Get a trained model (pick ONE)
```bash
# Option A — zero setup, works offline (synthetic Telco-style data)
python train.py

# Option B — the REAL IBM Telco dataset (recommended)
#   Windows PowerShell:
curl.exe -L https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv -o data/_raw_telco.csv
#   macOS/Linux:
curl -sL https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv -o data/_raw_telco.csv
python train.py --telco-raw data/_raw_telco.csv
```
This writes `models/churn_model.joblib` and `models/metrics.json`.

### 5. Run it
```bash
# REST API  →  open http://localhost:8000/docs
uvicorn app.main:app --reload

# …or the demo UI  →  open http://localhost:8501
streamlit run streamlit_app.py

# …or the tests
pytest -q
```

> **Why isn't there a model/dataset in the repo?** Data and model artifacts are
> intentionally **git-ignored** — you regenerate them in step 4. This keeps the repo
> small and reproducible, and avoids redistributing the dataset. The synthetic
> option (A) means the project runs even with no internet.

### Troubleshooting
| Problem | Fix |
|---------|-----|
| `python: command not found` | Use `python3` (macOS/Linux) |
| `ModuleNotFoundError: app` | Run commands from **inside** `02-customer-churn-predictor/` |
| `Model not loaded` (503) from the API | You skipped step 4 — run `python train.py` |
| `Address already in use` | Add `--port 8001` to the `uvicorn` / `streamlit` command |
| PowerShell blocks venv activation | Run `Set-ExecutionPolicy -Scope Process RemoteSigned` once, then activate |

---

## Quickstart (TL;DR)

Already have Python + the repo cloned? (Full walkthrough above.)

```bash
pip install -r requirements.txt
python train.py                      # synthetic data — or --telco-raw data/_raw_telco.csv for real
uvicorn app.main:app --reload        # API at http://localhost:8000/docs
streamlit run streamlit_app.py       # UI  at http://localhost:8501
```

**Track experiments?** add `--track` to `train.py` and run `mlflow ui`.

### Run with Docker

```bash
docker compose up --build      # API on :8000, UI on :8501
```

### Monitoring & retraining

```bash
# Data-drift report (training data vs. features actually sent to the API)
python monitoring/drift.py            # -> models/drift_report.html + drift_summary.json

# Retrain with a safety gate: only promote if the new model doesn't regress
python scripts/promote.py --telco-raw data/_raw_telco.csv
```

A scheduled GitHub Action (`.github/workflows/retrain.yml`) runs the champion/
challenger gate weekly and uploads the promoted model as an artifact.

---

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `API_KEY` | *(unset)* | Set to require `X-API-Key`; unset = open (dev) |
| `RATE_LIMIT` | `60/minute` | Per-key/IP limit on prediction endpoints |
| `FN_COST` / `FP_COST` | `5` / `1` | Cost of a missed churner vs. false alarm (sets threshold) |
| `LOG_LEVEL` | `INFO` | Logging verbosity |
| `MODEL_PATH` | `models/churn_model.joblib` | Model artifact location |
| `PREDICTIONS_DB` | `models/predictions.db` | Prediction log DB |

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`  | `/health` | — | Health check + model-loaded flag |
| `GET`  | `/features` | — | Required feature names |
| `GET`  | `/model-info` | — | Metrics + calibration + threshold + importances |
| `GET`  | `/stats` | — | Aggregate stats over logged predictions |
| `GET`  | `/predictions` | — | Recent predictions (audit) |
| `POST` | `/predict` | 🔑 | Churn prediction for one customer |
| `POST` | `/predict/batch` | 🔑 | Predictions for a list of customers |

### Example

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"tenure": 2, "monthly_charges": 95.0, "total_charges": 190.0,
       "num_products": 1, "has_internet": 1, "has_phone": 1,
       "contract_type": 0, "payment_method": 0,
       "paperless_billing": 1, "senior_citizen": 0}'
```

```json
{ "churn_probability": 0.89, "will_churn": true, "risk_level": "high" }
```

### Feature reference

| Feature | Type | Notes |
|---------|------|-------|
| `tenure` | int | Months as a customer |
| `monthly_charges` / `total_charges` | float | Current bill / lifetime charges |
| `num_products` | int | Count of subscribed services (≥1) |
| `has_internet` / `has_phone` | 0/1 | Service flags |
| `contract_type` | 0–2 | 0 = month-to-month, 1 = one-year, 2 = two-year |
| `payment_method` | 0–3 | 0 = e-check, 1 = mail, 2 = bank, 3 = card |
| `paperless_billing` / `senior_citizen` | 0/1 | |

`will_churn` uses the cost-based threshold. Risk bands: `low` < 0.40 · `medium`
0.40–0.70 · `high` ≥ 0.70.

---

## Testing

```bash
pip install -r requirements-dev.txt
pytest -q
```

14 tests: model layer (metrics thresholds, prediction bounds, risk monotonicity,
validation) and API (all endpoints via `TestClient`, auth-off path, prediction
logging, stats). API tests run **in-memory** and never touch the trained artifact.
CI runs them on every push.

## What I'd Do Next (true remaining gaps)

The **model, service, and MLOps layers** are in place. To fully deploy you'd still add:

- **Deployment**: container registry + Cloud Run / ECS / K8s with autoscaling.
- **Monitoring stack**: Prometheus + Grafana dashboards + alerting on the drift metrics.
- **Feedback loop**: capture actual churn outcomes to measure *live* model performance
  (drift on inputs is covered; ground-truth performance needs labels).
- **SHAP** per-prediction explanations; secrets manager; Terraform IaC.

## Honest scope

Trained on **real data**; metrics are genuine hold-out results. Beyond a notebook
demo, this has **auth, rate limiting, structured + prediction logging, probability
calibration, a cost-based decision policy, MLflow tracking, PSI/KS drift detection,
and a champion/challenger retraining gate wired to a scheduled GitHub Action.**

It is still *not deployed* — no cloud hosting, live monitoring dashboards, or
ground-truth feedback loop (see above) — so it's an **advanced, production-*minded*
portfolio project**, not a running production service. Note: `num_products` is
engineered (count of subscribed services), since the raw Telco data has no single
such column.

*Built for the Headstarter AI Fellowship · Scikit-learn · XGBoost · FastAPI · MLflow · Streamlit*
