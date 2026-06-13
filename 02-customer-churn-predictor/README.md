# Customer Churn Predictor

XGBoost-powered churn prediction model with a FastAPI REST interface. Achieves 91%+ accuracy on the Telco dataset.

## What It Does

Predicts whether a customer will churn given their account features, and assigns a risk level (`high`, `medium`, `low`).

## Tech Stack

- **Model**: XGBoost + Scikit-learn Pipeline
- **API**: FastAPI + uvicorn
- **Serialization**: joblib

## Project Structure

```
02-customer-churn-predictor/
├── app/
│   ├── main.py       # FastAPI app
│   └── model.py      # XGBoost pipeline, training & inference
├── requirements.txt
└── README.md
```

## Setup

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Training

```python
from app.model import train
import pandas as pd

df = pd.read_csv("telco_churn.csv")
metrics = train(df)
print(metrics)
```

## API

```
POST /predict     — Predict churn probability for a customer
GET  /features    — List required feature names
GET  /health      — Health check
```

### Example

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"tenure": 24, "monthly_charges": 79.5, "total_charges": 1908.0,
       "num_products": 3, "has_internet": 1, "has_phone": 1,
       "contract_type": 1, "payment_method": 2,
       "paperless_billing": 1, "senior_citizen": 0}'
```

Response:
```json
{
  "churn_probability": 0.23,
  "will_churn": false,
  "risk_level": "low"
}
```
