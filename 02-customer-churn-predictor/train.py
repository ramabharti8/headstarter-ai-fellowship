"""Train the churn model and persist the artifact + metrics.

Generates the dataset automatically if it doesn't exist yet.

    python train.py                       # uses data/telco_churn.csv (creates it if absent)
    python train.py --data path/to.csv    # train on your own CSV
"""
from __future__ import annotations

import argparse
import json
import os

import pandas as pd

from app.model import train


def ensure_dataset(path: str, telco_raw: str | None) -> None:
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if telco_raw:
        print(f"Mapping real Telco data from {telco_raw} ...")
        from data.load_telco import load_and_map
        load_and_map(telco_raw).to_csv(path, index=False)
    else:
        print(f"No dataset at {path} — generating a synthetic one...")
        from data.generate_data import generate
        generate(7043).to_csv(path, index=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the churn model")
    parser.add_argument("--data", default="data/telco_churn.csv",
                        help="Normalized CSV (FEATURES + churn). Created if missing.")
    parser.add_argument("--telco-raw", default=None,
                        help="Raw IBM Telco CSV to map into --data if it doesn't exist yet.")
    parser.add_argument("--metrics-out", default="models/metrics.json")
    parser.add_argument("--track", action="store_true",
                        help="Log this run to MLflow (params, metrics, model).")
    args = parser.parse_args()

    ensure_dataset(args.data, args.telco_raw)
    df = pd.read_csv(args.data)
    print(f"Loaded {len(df):,} rows from {args.data} "
          f"(churn rate {df['churn'].mean():.1%})")

    metrics = train(df)

    print("\n=== Test-set metrics ===")
    for key in ("accuracy", "roc_auc", "precision", "recall", "f1", "brier"):
        print(f"  {key:<10} {metrics[key]:.4f}")
    print(f"  {'threshold':<10} {metrics['threshold']:.2f}  "
          f"(calibrated={metrics['calibrated']}, cost FN:FP={metrics['cost_ratio_fn_fp']})")
    print("\n=== Classification report ===")
    print(metrics["report"])
    print("=== Top feature importances ===")
    for name, score in list(metrics["feature_importance"].items())[:5]:
        print(f"  {name:<18} {score:.4f}")
    print(f"\nModel saved to {metrics['model_path']}")

    os.makedirs(os.path.dirname(args.metrics_out) or ".", exist_ok=True)
    serializable = {k: v for k, v in metrics.items() if k != "report"}
    with open(args.metrics_out, "w") as f:
        json.dump(serializable, f, indent=2)
    print(f"Metrics written to {args.metrics_out}")

    if args.track:
        from app.tracking import log_run
        uri = log_run(metrics, metrics["model_path"], args.metrics_out)
        print(f"Logged run to MLflow (tracking URI: {uri}). "
              f"View with:  mlflow ui")


if __name__ == "__main__":
    main()
