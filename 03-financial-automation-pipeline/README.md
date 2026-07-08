# Financial Automation Pipeline

Automated financial reporting and anomaly detection from CSV/Excel transaction
data, served as a hardened **FastAPI** service with a matching **CLI**. Upload a
transactions file and get a full report — cash flow, monthly and category
breakdowns, top merchants, and flagged anomalies — as JSON or a downloadable Excel
workbook.

[![Python](https://img.shields.io/badge/Python-3.12-blue)](https://python.org)
[![pandas](https://img.shields.io/badge/pandas-2.2-150458)](https://pandas.pydata.org)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.5-orange)](https://scikit-learn.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)](https://fastapi.tiangolo.com)
[![Tests](https://img.shields.io/badge/tests-18%20passing-brightgreen)](#testing)

---

## Results on real data

The report itself is just correct math on your file — there's nothing to "score".
But the **anomaly detection** can be validated: on the real **ULB Credit Card
Fraud** dataset (284,807 real transactions, 492 labeled frauds — 0.17%), we
measure each detector against the ground-truth `Class` label
(`python evaluation/evaluate_fraud.py`):

| Method | ROC-AUC | Recall (frauds caught) | Precision@492 |
|--------|--------:|----------------------:|--------------:|
| z-score (amount only) | 0.635 | 2% | 0.00 |
| IQR (amount only) | 0.538 | 19% | 0.00 |
| Isolation Forest (amount only) | 0.504 | 21% | 0.00 |
| **Isolation Forest (all features)** | **0.949** | **82%** | **0.28** |

> **The lesson (a great interview talking point):** amount alone is a *terrible*
> fraud signal — statistical outliers by size barely beat random (ROC-AUC ≈ 0.5).
> The **multivariate Isolation Forest** using all transaction features catches
> **82% of real frauds** at **ROC-AUC 0.95**, and its top-492 flagged transactions
> are **28% fraud — ~160× the 0.17% base rate**. Feature choice, not the algorithm,
> makes or breaks unsupervised fraud detection.

Metrics are genuine hold-out numbers, reproducible with
`make evaluate` (see [Real-data evaluation](#real-data-evaluation)).

---

## What it does

- **Ingests** CSV or Excel files with flexible headers (case-insensitive; needs at
  least `date` + `amount`), coercing types and dropping invalid rows.
- **Detects anomalies** with three selectable methods:
  - `zscore` — statistical outliers by standard deviations from the mean
  - `iqr` — Tukey's interquartile-range fences
  - `isolation_forest` — an ML outlier detector (scikit-learn)
- **Reports**: summary stats, cash flow (income vs. expense vs. net), monthly
  breakdown, category breakdown, top merchants, and a ranked anomaly list.
- **Exports** the report as a multi-sheet `.xlsx` workbook.

## Production hardening

| Concern | Implementation |
|---------|----------------|
| **Auth** | Optional API-key (`X-API-Key`) on analyze routes — `app/security.py` |
| **Rate limiting** | Per-key/IP limits via slowapi (429 on exceed) |
| **Input safety** | Type coercion, required-column checks, 10 MB upload cap, empty-file guard |
| **Clear errors** | Bad input → `422` with a helpful message (not a 500) |
| **Structured logging** | JSON logs with request-id + latency (structlog) |
| **Tests + CI** | 18 pytest tests, GitHub Actions workflow |
| **Real-data validation** | Anomaly detectors scored on the real fraud dataset — `evaluation/` |

## Project Structure

```
03-financial-automation-pipeline/
├── app/
│   ├── main.py            # FastAPI app: endpoints, middleware, error handling
│   ├── pipeline.py        # Load, validate, anomaly detection, report generation
│   ├── report.py          # Report -> multi-sheet Excel workbook
│   ├── security.py        # API-key auth + rate limiting
│   └── logging_config.py  # Structured JSON logging
├── data/generate_data.py  # Synthetic transactions generator (with anomalies)
├── tests/                 # Pipeline + API tests
├── cli.py                 # Command-line analyzer (JSON / Excel output)
├── requirements.txt / requirements-dev.txt
├── Dockerfile / docker-compose.yml / Makefile
└── .github/workflows/ci.yml
```

---

## Run on a fresh machine (step by step)

Works on Windows, macOS, and Linux.

### 0. Prerequisites
- **Git** and **Python 3.11/3.12** (`python --version`; use `python3` on macOS/Linux)

### 1. Clone and enter the project
```bash
git clone https://github.com/ramabharti8/headstarter-ai-fellowship.git
cd headstarter-ai-fellowship/03-financial-automation-pipeline
```

### 2. Create and activate a virtual environment
```bash
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Try it — three ways

**A. CLI (no server needed)**
```bash
python cli.py --generate 500                 # make sample data + print a report
python cli.py data/transactions.csv --excel report.xlsx   # also export Excel
```

**B. REST API**
```bash
uvicorn app.main:app --reload                # open http://localhost:8000/docs
# in another terminal:
curl -s "http://localhost:8000/sample?rows=300" -o sample.csv   # get sample data
curl -s -F "file=@sample.csv" "http://localhost:8000/analyze?method=zscore"
```

**C. Tests**
```bash
pip install -r requirements-dev.txt
pytest -q
```

### Troubleshooting
| Problem | Fix |
|---------|-----|
| `python: command not found` | Use `python3` (macOS/Linux) |
| `ModuleNotFoundError: app` | Run commands from **inside** `03-financial-automation-pipeline/` |
| `422` from `/analyze` | Your file is missing a `date` or `amount` column |
| `Address already in use` | Add `--port 8001` to the `uvicorn` command |

---

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`  | `/health` | — | Health check |
| `GET`  | `/` | — | Service metadata + available methods |
| `GET`  | `/sample?rows=N` | — | Download a synthetic sample CSV |
| `POST` | `/analyze` | 🔑 | Upload CSV/Excel → JSON report |
| `POST` | `/analyze/excel` | 🔑 | Upload CSV/Excel → downloadable `.xlsx` report |

Query params on analyze: `method` (`zscore` \| `iqr` \| `isolation_forest`),
`threshold` (float, for zscore/iqr).

### Input format
CSV/Excel with at minimum `date` and `amount` columns. Optional columns
(`category`, `merchant`, `description`, `transaction_id`) enrich the report.
Positive `amount` = income, negative = expense.

### Example response (truncated)
```json
{
  "summary": {
    "total_transactions": 500, "total_amount": 12450.30,
    "avg_transaction": 24.90, "date_range": {"start": "2024-01-01", "end": "2024-12-31"}
  },
  "cash_flow": {"total_income": 62400.0, "total_expense": -49950.0, "net": 12450.0},
  "monthly_breakdown": [{"month": "2024-01", "total": 980.0, "income": 5200.0, "expense": -4220.0, "count": 42}],
  "category_breakdown": [{"category": "Rent", "total": -21600.0, "count": 12}],
  "top_merchants": [{"merchant": "Amazon", "total": -3120.0, "count": 28}],
  "anomalies": {"method": "zscore", "count": 5, "transactions": [{"date": "2024-06-14", "amount": -8123.0, "anomaly_score": 6.2}]}
}
```

## Run with Docker
```bash
docker compose up --build      # API on http://localhost:8000
```

## Configuration (env vars)
| Var | Default | Purpose |
|-----|---------|---------|
| `API_KEY` | *(unset)* | Set to require `X-API-Key`; unset = open (dev) |
| `RATE_LIMIT` | `30/minute` | Per-key/IP limit on analyze routes |
| `MAX_UPLOAD_BYTES` | `10485760` | Max upload size (10 MB) |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

## Testing
```bash
pip install -r requirements-dev.txt
pytest -q
```
18 tests covering the pipeline (loading, validation, all three anomaly methods,
multivariate isolation forest, cash-flow math) and the API (all endpoints, 422 on
bad input, 400 on empty file, Excel download).

## Real-data evaluation

Validate the anomaly detectors against real, labeled fraud data:

```bash
# One-time download of the real ULB Credit Card Fraud dataset (~100 MB, git-ignored)
curl -sL https://raw.githubusercontent.com/nsethi31/Kaggle-Data-Credit-Card-Fraud-Detection/master/creditcard.csv \
  -o data/creditcard.csv

python evaluation/evaluate_fraud.py     # prints the metrics table + writes evaluation/fraud_metrics.json
```

The committed `evaluation/fraud_metrics.json` holds the results shown in
[Results on real data](#results-on-real-data).

## What I'd Do Next
- Persist analyses to a database + a dashboard of trends over time.
- Rule-based alerts (e.g. spend > budget) and scheduled report emails.
- A supervised fraud model (using the labels) to compare against the unsupervised
  detectors; probability calibration and a cost-based alert threshold.
- Auth via OAuth/JWT and per-user data isolation for a multi-tenant deployment.

---

*Built for the Headstarter AI Fellowship · Pandas · scikit-learn · FastAPI*
