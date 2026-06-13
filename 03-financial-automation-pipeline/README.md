# Financial Automation Pipeline

Automated financial report generation and anomaly detection from CSV/Excel transaction data.

## What It Does

- Parses transaction files (CSV or Excel)
- Detects anomalous transactions using Z-score analysis
- Generates summary reports with monthly breakdowns

## Tech Stack

- **Processing**: Pandas + NumPy + SciPy
- **API**: FastAPI + uvicorn

## Project Structure

```
03-financial-automation-pipeline/
├── app/
│   ├── main.py       # FastAPI app
│   └── pipeline.py   # Data loading, anomaly detection, report generation
├── requirements.txt
└── README.md
```

## Setup

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /analyze     — Upload CSV/Excel, get full financial report
GET  /health      — Health check
```

### Input Format

CSV/Excel must have at minimum: `date`, `amount` columns.

### Example

```bash
curl -X POST http://localhost:8000/analyze \
  -F "file=@transactions.csv"
```

Response:
```json
{
  "summary": {
    "total_transactions": 1240,
    "total_amount": 542300.50,
    "avg_transaction": 437.34,
    "date_range": {"start": "2024-01-01", "end": "2024-12-31"}
  },
  "anomalies": {
    "count": 3,
    "transactions": [...]
  },
  "monthly_breakdown": [...]
}
```
