"""XGBoost churn model: pipeline definition, training, and inference.

The served model is a scikit-learn Pipeline (StandardScaler -> XGBClassifier)
wrapped in a `CalibratedClassifierCV` so the churn *probabilities* are trustworthy
(a predicted 0.30 really means ~30% churn), and a business-cost-based decision
threshold is chosen instead of a naive 0.5.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
import joblib

MODEL_PATH = os.environ.get("MODEL_PATH", "models/churn_model.joblib")

# Business cost of each error type, used to pick the decision threshold.
# A missed churner (false negative) is treated as ~5x costlier than a wasted
# retention offer (false positive) — override via env for a real cost model.
FN_COST = float(os.environ.get("FN_COST", 5.0))
FP_COST = float(os.environ.get("FP_COST", 1.0))

FEATURES = [
    "tenure", "monthly_charges", "total_charges", "num_products",
    "has_internet", "has_phone", "contract_type", "payment_method",
    "paperless_billing", "senior_citizen",
]

TARGET = "churn"


def build_pipeline(scale_pos_weight: float = 1.0) -> Pipeline:
    """Scaler + gradient-boosted trees. No `use_label_encoder` (removed in XGBoost 2.x).

    `scale_pos_weight` re-weights the positive (churn) class to counter the
    class imbalance in real churn data (~26% churners), which otherwise makes
    the model lazy and predict "no churn" for almost everyone.
    """
    return Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_pos_weight,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        )),
    ])


def choose_threshold(y_true, proba, fn_cost: float = FN_COST, fp_cost: float = FP_COST) -> float:
    """Pick the probability threshold minimizing expected business cost.

    cost(t) = fn_cost * (missed churners) + fp_cost * (false alarms)
    """
    y_true = np.asarray(y_true)
    best_t, best_cost = 0.5, float("inf")
    for t in np.linspace(0.05, 0.95, 19):
        pred = proba >= t
        fn = int(((y_true == 1) & (~pred)).sum())
        fp = int(((y_true == 0) & (pred)).sum())
        cost = fn_cost * fn + fp_cost * fp
        if cost < best_cost:
            best_cost, best_t = cost, float(round(t, 2))
    return best_t


def train(df: pd.DataFrame, test_size: float = 0.2, save: bool = True,
          calibrate: bool = True, save_path: str | None = None) -> dict:
    """Train on a dataframe containing FEATURES + TARGET. Returns a metrics dict.

    `save_path` overrides where the artifact is written (defaults to MODEL_PATH);
    used to train a "challenger" without overwriting the live "champion".
    """
    missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(f"Dataframe is missing required columns: {missing}")

    X = df[FEATURES]
    y = df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y
    )

    # Counter class imbalance: weight positives by (negatives / positives)
    n_pos = int((y_train == 1).sum())
    n_neg = int((y_train == 0).sum())
    spw = (n_neg / n_pos) if n_pos else 1.0

    base = build_pipeline(scale_pos_weight=spw)
    if calibrate:
        # Isotonic calibration via internal CV -> well-calibrated probabilities.
        model = CalibratedClassifierCV(base, method="isotonic", cv=3)
    else:
        model = base
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    threshold = choose_threshold(y_test, proba)
    preds = (proba >= threshold).astype(int)

    metrics = {
        "accuracy": round(float(accuracy_score(y_test, preds)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, proba)), 4),
        "precision": round(float(precision_score(y_test, preds, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, preds)), 4),
        "f1": round(float(f1_score(y_test, preds)), 4),
        "brier": round(float(brier_score_loss(y_test, proba)), 4),
        "threshold": threshold,
        "calibrated": calibrate,
        "cost_ratio_fn_fp": [FN_COST, FP_COST],
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "report": classification_report(y_test, preds, digits=3),
        "feature_importance": feature_importance(model),
    }

    if save:
        path = save_path or MODEL_PATH
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(model, path)
        metrics["model_path"] = path

    return metrics


def _xgb_model(model) -> XGBClassifier:
    """Extract the fitted XGBClassifier from a Pipeline or CalibratedClassifierCV."""
    if isinstance(model, CalibratedClassifierCV):
        pipeline = model.calibrated_classifiers_[0].estimator
    else:
        pipeline = model
    return pipeline.named_steps["model"]


def feature_importance(model) -> dict:
    """Gain-based importance from the fitted XGBoost model, keyed by feature name."""
    importances = _xgb_model(model).feature_importances_
    pairs = sorted(zip(FEATURES, importances), key=lambda p: p[1], reverse=True)
    return {name: round(float(score), 4) for name, score in pairs}


def load_model(path: str = MODEL_PATH):
    return joblib.load(path)


def predict_churn(model, features: dict, threshold: float = 0.5) -> dict:
    """Predict calibrated churn probability + risk for a single customer."""
    df = pd.DataFrame([{k: features[k] for k in FEATURES}])
    prob = float(model.predict_proba(df)[0][1])
    return {
        "churn_probability": round(prob, 4),
        "will_churn": bool(prob >= threshold),
        "risk_level": "high" if prob >= 0.7 else "medium" if prob >= 0.4 else "low",
    }
