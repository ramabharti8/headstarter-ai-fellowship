"""Evaluate the anomaly detectors on the REAL Credit Card Fraud dataset.

Unlike the report itself (which has no ground truth), fraud detection can be
scored: the ULB Credit Card Fraud dataset (284,807 real transactions, 492 real
frauds) carries a `Class` label, so we can measure real ROC-AUC / PR-AUC /
precision / recall for each anomaly method.

Dataset (~100 MB, one-time download):
    curl -sL https://raw.githubusercontent.com/nsethi31/Kaggle-Data-Credit-Card-Fraud-Detection/master/creditcard.csv -o data/creditcard.csv

Run:
    python evaluation/evaluate_fraud.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.pipeline import detect_anomalies


def evaluate(df: pd.DataFrame) -> list[dict]:
    y = df["Class"].to_numpy()
    n_fraud = int(y.sum())
    feature_cols = [c for c in df.columns if c.startswith("V")] + ["amount"]

    configs = [
        ("zscore (amount only)", dict(method="zscore", threshold=3.0)),
        ("iqr (amount only)", dict(method="iqr")),
        ("isolation_forest (amount only)",
         dict(method="isolation_forest", feature_columns=["amount"])),
        ("isolation_forest (all features)",
         dict(method="isolation_forest", feature_columns=feature_cols)),
    ]

    results = []
    for name, kwargs in configs:
        flagged = detect_anomalies(df, **kwargs)
        scores = flagged["anomaly_score"].to_numpy()
        pred = flagged["is_anomaly"].to_numpy()

        # Rank-based metrics (threshold-independent)
        roc = float(roc_auc_score(y, scores))
        pr_auc = float(average_precision_score(y, scores))

        # precision/recall at the detector's own flagged set
        prec = float(precision_score(y, pred, zero_division=0))
        rec = float(recall_score(y, pred, zero_division=0))

        # precision@k: of the top-k highest scores (k = #frauds), how many are fraud
        top_k = df.assign(_s=scores).nlargest(n_fraud, "_s")
        prec_at_k = float(top_k["Class"].mean())

        results.append({
            "method": name,
            "roc_auc": round(roc, 4),
            "pr_auc": round(pr_auc, 4),
            "precision_at_flagged": round(prec, 4),
            "recall_at_flagged": round(rec, 4),
            "n_flagged": int(pred.sum()),
            f"precision_at_{n_fraud}": round(prec_at_k, 4),
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate anomaly detection on real fraud data")
    parser.add_argument("--data", default="data/creditcard.csv")
    parser.add_argument("--out", default="evaluation/fraud_metrics.json")
    args = parser.parse_args()

    if not os.path.exists(args.data):
        sys.exit(f"Dataset not found at {args.data}. Download it first (see module docstring).")

    print(f"Loading {args.data} ...")
    df = pd.read_csv(args.data).rename(columns={"Amount": "amount"})
    n_fraud = int(df["Class"].sum())
    print(f"{len(df):,} transactions | {n_fraud} real frauds "
          f"({df['Class'].mean():.3%} fraud rate)\n")

    results = evaluate(df)

    hdr = f"{'method':<34}{'ROC-AUC':>9}{'PR-AUC':>9}{'recall':>9}{'prec@k':>9}"
    print(hdr); print("-" * len(hdr))
    for r in results:
        pk = r[f'precision_at_{n_fraud}']
        print(f"{r['method']:<34}{r['roc_auc']:>9.4f}{r['pr_auc']:>9.4f}"
              f"{r['recall_at_flagged']:>9.4f}{pk:>9.4f}")

    summary = {
        "dataset": "ULB Credit Card Fraud (real)",
        "n_transactions": int(len(df)),
        "n_frauds": n_fraud,
        "fraud_rate": round(float(df["Class"].mean()), 5),
        "results": results,
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nMetrics written to {args.out}")


if __name__ == "__main__":
    main()
