"""Champion/challenger retraining gate.

Trains a fresh "challenger" model, compares it to the live "champion" on ROC-AUC,
and only promotes the challenger if it does not regress. This is the core of a
safe automated-retraining pipeline: retrain often, but never ship a worse model.

    python scripts/promote.py                         # synthetic data
    python scripts/promote.py --telco-raw data/_raw_telco.csv
    python scripts/promote.py --min-delta -0.005      # allow tiny regressions

Exit code 0 = ran successfully (whether or not it promoted); it never fails CI on
a non-promotion, it just leaves the champion in place.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import pandas as pd

# Allow running as `python scripts/promote.py` (adds project root to path).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.model import MODEL_PATH, train

METRICS_PATH = os.environ.get("METRICS_PATH", "models/metrics.json")
CHALLENGER_PATH = "models/_challenger.joblib"


def champion_auc() -> float | None:
    if not os.path.exists(METRICS_PATH) or not os.path.exists(MODEL_PATH):
        return None
    with open(METRICS_PATH) as f:
        return json.load(f).get("roc_auc")


def load_data(telco_raw: str | None, data_path: str) -> pd.DataFrame:
    if os.path.exists(data_path):
        return pd.read_csv(data_path)
    os.makedirs(os.path.dirname(data_path) or ".", exist_ok=True)
    if telco_raw:
        from data.load_telco import load_and_map
        df = load_and_map(telco_raw)
    else:
        from data.generate_data import generate
        df = generate(7043)
    df.to_csv(data_path, index=False)
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrain + gated promotion")
    parser.add_argument("--data", default="data/telco_churn.csv")
    parser.add_argument("--telco-raw", default=None)
    parser.add_argument("--min-delta", type=float, default=0.0,
                        help="Promote only if challenger AUC >= champion AUC + min_delta")
    args = parser.parse_args()

    df = load_data(args.telco_raw, args.data)
    baseline = champion_auc()

    print("Training challenger...")
    metrics = train(df, save=True, save_path=CHALLENGER_PATH)
    challenger = metrics["roc_auc"]

    if baseline is None:
        print(f"No champion yet - promoting challenger (AUC {challenger:.4f}).")
        promote(metrics)
        return

    print(f"Champion AUC: {baseline:.4f}  |  Challenger AUC: {challenger:.4f}")
    delta = challenger - baseline
    if challenger >= baseline + args.min_delta:
        print(f"Challenger wins (delta {delta:+.4f}) - promoting.")
        promote(metrics)
    else:
        print(f"Challenger regressed (delta {delta:+.4f}) - keeping champion.")
        os.remove(CHALLENGER_PATH)


def promote(metrics: dict) -> None:
    os.replace(CHALLENGER_PATH, MODEL_PATH)
    metrics["model_path"] = MODEL_PATH
    serializable = {k: v for k, v in metrics.items() if k != "report"}
    with open(METRICS_PATH, "w") as f:
        json.dump(serializable, f, indent=2)
    print(f"Promoted -> {MODEL_PATH}")


if __name__ == "__main__":
    main()
