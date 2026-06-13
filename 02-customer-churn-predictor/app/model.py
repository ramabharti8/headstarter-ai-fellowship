import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from xgboost import XGBClassifier
import joblib
import os

MODEL_PATH = "models/churn_model.joblib"

FEATURES = [
    "tenure", "monthly_charges", "total_charges", "num_products",
    "has_internet", "has_phone", "contract_type", "payment_method",
    "paperless_billing", "senior_citizen",
]


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            use_label_encoder=False,
            eval_metric="logloss",
            random_state=42,
        )),
    ])


def train(df: pd.DataFrame) -> dict:
    X = df[FEATURES]
    y = df["churn"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    acc = accuracy_score(y_test, preds)

    os.makedirs("models", exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)

    return {"accuracy": acc, "report": classification_report(y_test, preds)}


def load_model() -> Pipeline:
    return joblib.load(MODEL_PATH)


def predict_churn(pipeline: Pipeline, features: dict) -> dict:
    df = pd.DataFrame([features])
    prob = pipeline.predict_proba(df)[0][1]
    return {
        "churn_probability": float(prob),
        "will_churn": bool(prob >= 0.5),
        "risk_level": "high" if prob >= 0.7 else "medium" if prob >= 0.4 else "low",
    }
